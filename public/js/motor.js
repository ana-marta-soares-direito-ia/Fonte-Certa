// Motor de pesquisa: transforma a pergunta em consultas, interroga as fontes e ordena os resultados.
import { BASES, GRUPOS_BASES, ORDEM, pesquisar, lerAcordao } from "./fontes/dgsi.js";
import { pesquisarLegislacao, publicacoesRecentes, alertasJurisprudencia, encontrarDiploma, diplomasDeReferencia, textoDiploma, artigos as listarArtigos, encontrarArtigo } from "./fontes/legislacao.js";
import { planearPesquisa, ordenarPorPertinencia } from "./ia/analise.js";
import { temIA as temChave, fornecedorIA } from "./ia/gemini.js";
import { palavrasChave, radical, normalizar, emParalelo, semAO } from "./util.js";

let descritoresOficiais = null;
async function descritores() {
  if (!descritoresOficiais) {
    const r = await fetch("/dados/descritores.json");
    descritoresOficiais = (await r.json()).map(([nome, ...variantes]) => ({ nome, variantes, n: normalizar(nome) }));
  }
  return descritoresOficiais;
}

// Descritores oficiais cujo nome aparece na pergunta (ex.: "extinção do posto de trabalho").
export async function descritoresNaPergunta(texto) {
  const lista = await descritores();
  const t = " " + normalizar(texto) + " ";
  return lista.filter(d => d.n.split(" ").length >= 2 && t.includes(" " + d.n + " "))
    .sort((a, b) => b.n.length - a.n.length).slice(0, 4);
}

const AREAS_ADMIN = /proposta|concorrente|adjudica|j[uú]ri do|caderno de encargos|anormalmente baix|empreitada de obras p[uú]blicas|administrativ|contrata[cç][aã]o p[uú]blica|concurso p[uú]blico|ato administrativo|acto administrativo|autarquia|munic[ií]pio|funcion[aá]rio p[uú]blico|fun[cç][oõ]es p[uú]blicas|tribut|imposto|iva\b|irs\b|irc\b|fiscal|urbanismo|expropria/i;

// Consultas sem IA: palavras-chave reduzidas ao radical, do mais exigente para o mais amplo.
export function consultasHeuristicas(texto) {
  const p = palavrasChave(texto, 6).map(radical).map(r => (r.length >= 6 ? r + "*" : r));
  const c = [];
  for (let n = Math.min(4, p.length); n >= 2; n--) c.push(p.slice(0, n).join(" AND "));
  if (!c.length && p.length) c.push(p[0]);
  return [...new Set(c)];
}

export function basesSugeridas(texto, jurisdicao) {
  if (jurisdicao === "administrativa" || (!jurisdicao && AREAS_ADMIN.test(texto))) return [...GRUPOS_BASES.administrativa, "jstj"];
  if (jurisdicao === "ambas") return GRUPOS_BASES.todas;
  return GRUPOS_BASES.comum;
}

// Pontuação local: descritores coincidentes, actualidade e hierarquia do tribunal.
function pontuar(r, termos, descritoresAlvo) {
  const desc = normalizar(r.descritores.join(" | "));
  let p = 0;
  for (const t of termos) if (desc.includes(t.replace(/\*$/, ""))) p += 3;
  for (const d of descritoresAlvo) if (desc.includes(d)) p += 6;
  const ano = Number((r.data || "").slice(0, 4)) || 1990;
  p += Math.max(0, Math.min(10, (ano - 2010) / 1.5));
  p += (BASES[r.base]?.nivel || 1) * 1.2;
  return p;
}

// Pesquisa completa. "progresso" recebe mensagens de estado para a interface.
export async function pesquisarTudo(pergunta, { caso = null, bases = null, progresso = () => {} } = {}) {
  const usarIA = temChave();
  let plano = null;
  if (usarIA) {
    progresso("A preparar a pesquisa");
    try { plano = await planearPesquisa(pergunta, caso?.texto); } catch (e) { plano = null; progresso("Pesquisa sem IA: " + e.message); }
  }
  const descPergunta = await descritoresNaPergunta(pergunta);
  const consultas = [];
  const heuristicas = consultasHeuristicas(pergunta);
  if (plano?.consultas?.length) consultas.push(...plano.consultas.slice(0, 4));
  else if (heuristicas[0]) consultas.push(heuristicas[0]);
  for (const d of descPergunta.slice(0, 2)) consultas.push(`[DESCRITORES] CONTAINS "${d.variantes[0] || d.nome.toUpperCase()}"`);
  if (plano?.descritores?.length) for (const d of plano.descritores.slice(0, 2)) consultas.push(`[DESCRITORES] CONTAINS "${String(d).toUpperCase().replace(/"/g, "")}"`);
  consultas.push(...heuristicas.slice(1));
  const unicas = [...new Set(consultas.map(c => c.replace(/[()]/g, " ").replace(/\s+/g, " ").trim()))].slice(0, 5);

  const sugeridasIA = (plano?.tribunais || []).filter(t => BASES[t]);
  const listaBases = bases?.length ? bases : [...new Set([...basesSugeridas(pergunta + " " + (plano?.area || ""), plano?.jurisdicao), ...sugeridasIA])];

  // Jurisprudência: corre as consultas até reunir resultados suficientes.
  progresso("A pesquisar na DGSI");
  const todos = new Map();
  const porConsulta = [];
  for (const consulta of unicas) {
    const r = await pesquisar(listaBases, consulta, { ordem: ORDEM.recentes, n: 30 });
    porConsulta.push({ consulta, n: r.resultados.length, erros: r.erros });
    for (const x of r.resultados) if (!todos.has(x.id)) todos.set(x.id, { ...x, consulta });
    if (todos.size >= 60) break;
  }
  const termos = palavrasChave(pergunta, 8).map(radical);
  const descAlvo = [...descPergunta.map(d => d.n), ...(plano?.descritores || []).map(normalizar)];
  let juris = [...todos.values()].map(r => ({ ...r, _p: pontuar(r, termos, descAlvo) })).sort((a, b) => b._p - a._p).slice(0, 40);

  // Sumários dos primeiros resultados (para a lista e para a ordenação com IA).
  progresso("A ler os sumários");
  const aLer = juris.slice(0, usarIA && fornecedorIA() === "gemini" ? 16 : 10);
  await emParalelo(aLer, 4, async r => {
    try {
      const ac = await lerAcordao(r.url);
      r.sumarioCurto = ac.sumario.join(" ").slice(0, 900);
      r.relator = r.relator || ac.relator;
      r.votacao = ac.votacao;
      r.decisao = ac.decisao;
      r.temTexto = ac.textoIntegral;
    } catch { /* fica sem sumário */ }
  });
  // A ordenação por pertinência consome muito do limite diário do modelo incluído: só com chave própria.
  if (usarIA && fornecedorIA() === "gemini" && aLer.length) {
    progresso("A ordenar por pertinência");
    try {
      const pts = await ordenarPorPertinencia(plano?.questao || pergunta, aLer);
      for (const { i, p } of pts) aLer[i].pertinencia = p;
      juris.sort((a, b) => (b.pertinencia ?? -1) - (a.pertinencia ?? -1) || b._p - a._p);
    } catch { /* mantém a ordenação local */ }
  }

  // Legislação e Diário da República.
  progresso("A pesquisar a legislação");
  const textoLeg = [pergunta, plano?.termos_legislacao].filter(Boolean).join(" ");
  const [legislacao, recentes, alertas] = await Promise.all([
    pesquisarLegislacao(textoLeg, { max: 20 }).catch(() => []),
    publicacoesRecentes(textoLeg).catch(() => []),
    alertasJurisprudencia(textoLeg).catch(() => []),
  ]);
  // Normas: diplomas indicados pela IA ou de referência para o tema, sempre confirmados no índice oficial.
  // Os artigos mostrados são os que, no próprio diploma, tratam da questão (epígrafe e texto).
  progresso("A localizar os artigos aplicáveis");
  const candidatos = [];
  for (const d of plano?.diplomas || []) {
    try {
      const r = await encontrarDiploma(d.designacao || "");
      if (r && !r.externo) {
        const ja = candidatos.find(c => c.diploma.p === r.p);
        if (ja) ja.sugeridos.push(...(d.artigos || []).map(String));
        else candidatos.push({ diploma: r, sugeridos: (d.artigos || []).map(String), origem: "ia" });
      }
    } catch {}
  }
  for (const r of await diplomasDeReferencia(pergunta).catch(() => [])) {
    const ja = candidatos.find(c => c.diploma.p === r.p);
    if (ja) ja.origem = "tema"; else candidatos.push({ diploma: r, sugeridos: [], origem: "tema" });
  }
  const termosNorma = [...new Set(palavrasChave(pergunta, 10).map(t => radical(semAO(t))))];
  const normas = [];
  for (const c of candidatos.slice(0, 5)) {
    let arts = [];
    try {
      const lista = listarArtigos(await textoDiploma(c.diploma.p));
      const codigo = /^c[oó]digo|constitui/i.test(c.diploma.c || c.diploma.t);
      const epigrafes = lista.map(a => semAO(normalizar(a.epigrafe)));
      const peso = Object.fromEntries(termosNorma.map(t => [t, Math.log(1 + lista.length / (1 + epigrafes.filter(e => e.includes(t)).length))]));
      const pontuar = a => {
        const ep = epigrafes[a.indice], tx = semAO(normalizar(a.texto.slice(0, 1500))), ctx = semAO(normalizar(a.contexto));
        let p = 0, n = 0;
        for (const t of termosNorma) {
          if (ep.includes(t)) { p += 3 * peso[t]; n++; }
          else if (ctx.includes(t)) { p += 1.5 * peso[t]; n += 0.5; }
          else if (tx.includes(t)) p += 0.6 * peso[t];
        }
        return n ? p * (1 + 0.5 * (n - 1)) : p * 0.3;
      };
      // Artigos sugeridos pela IA só ficam se tratarem, de facto, da questão.
      const pontos = lista.map(a => ({ a, p: pontuar(a) })).sort((x, y) => y.p - x.p);
      const melhor = pontos[0]?.p || 0;
      const sugeridos = c.sugeridos.map(n => encontrarArtigo(lista, n, codigo)).filter(a => a && pontuar(a) >= Math.max(8, melhor * 0.15));
      const encontrados = melhor < 30 ? [] : pontos.filter(x => x.p >= Math.max(20, melhor * 0.55)).slice(0, 5).map(x => x.a);
      const vistos = new Set();
      arts = [...sugeridos, ...encontrados].filter(a => (vistos.has(a.indice) ? false : vistos.add(a.indice)))
        .sort((x, y) => x.indice - y.indice).slice(0, 6).map(a => ({ numero: a.numero, epigrafe: a.epigrafe }));
    } catch {}
    // Um diploma sugerido só pela IA, sem nenhum artigo sobre a questão, não é apresentado.
    if (arts.length || c.origem === "tema") normas.push({ diploma: c.diploma, artigos: arts });
  }
  return { pergunta, plano, consultas: porConsulta, bases: listaBases, juris, legislacao, recentes, alertas, normas, usarIA };
}
