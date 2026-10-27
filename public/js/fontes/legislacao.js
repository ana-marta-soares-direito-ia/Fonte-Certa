// Legislação: índice próprio (gerado diariamente a partir do Diário da República, 1.ª série)
// e texto de cada diploma na versão em vigor numa dada data.
import { normalizar, palavrasChave } from "../util.js";

const REPO = "legalize-dev/legalize-pt";
const RAW = `https://raw.githubusercontent.com/${REPO}`;
const API = `https://api.github.com/repos/${REPO}`;

let manifesto = null;
let principais = null;
let outros = null;
let juris = null;
let recentes = null;
let indicePalavras = null;

async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Não foi possível carregar ${url} (${r.status}).`);
  return r.json();
}

export async function carregarManifesto() {
  if (!manifesto) manifesto = await json("/dados/leg/manifesto.json");
  return manifesto;
}

async function carregarGrupo(grupo) {
  const m = await carregarManifesto();
  const partes = m.ficheiros.filter(f => f.grupo === grupo);
  const listas = await Promise.all(partes.map(p => json(`/dados/leg/${p.nome}?g=${encodeURIComponent(m.gerado)}`)));
  return listas.flat();
}

export async function carregarPrincipais() {
  if (!principais) {
    principais = await carregarGrupo("principal");
    indicePalavras = new Map(); // palavra -> Map(id -> máscara de campos: 1 título, 2 descritores, 4 sumário)
    principais.forEach((r, i) => {
      r._n = normalizar(`${r.c} ${r.t}`);
      r._m = normalizar((r.m || []).join(" "));
      r._r = normalizar(r.r);
      const juntar = (texto, bit) => {
        for (const p of new Set(texto.split(" "))) {
          if (p.length < 3) continue;
          let m = indicePalavras.get(p);
          if (!m) { m = new Map(); indicePalavras.set(p, m); }
          m.set(i, (m.get(i) || 0) | bit);
        }
      };
      juntar(r._n, 1); juntar(r._m, 2); juntar(r._r, 4);
    });
  }
  return principais;
}

export async function carregarOutros() {
  if (!outros) {
    outros = await carregarGrupo("outros");
    outros.forEach(r => { r._n = normalizar(`${r.c} ${r.t}`); r._m = normalizar((r.m || []).join(" ")); r._r = normalizar(r.r); });
  }
  return outros;
}

export async function carregarJurisprudenciaDR() {
  if (!juris) {
    juris = await carregarGrupo("juris");
    juris.forEach(r => { r._n = normalizar(`${r.c} ${r.t}`); r._m = normalizar((r.m || []).join(" ")); r._r = normalizar(r.r); });
  }
  return juris;
}

const TIPOS = {
  "lei": "Lei", "lei-organica": "Lei Orgânica", "lei-constitucional": "Lei Constitucional", "decreto-lei": "Decreto-Lei",
  "decreto-legislativo-regional": "Decreto Legislativo Regional", "decreto-regulamentar": "Decreto Regulamentar",
  "decreto-regulamentar-regional": "Decreto Regulamentar Regional", "portaria": "Portaria", "despacho-normativo": "Despacho Normativo",
  "resolucao-conselho-ministros": "Resolução do Conselho de Ministros", "resolucao-assembleia-republica": "Resolução da Assembleia da República",
  "decreto": "Decreto", "declaracao-rectificacao": "Declaração de Retificação", "decreto-aprovacao-constituicao": "Constituição",
  "acordao-doutrinario": "Acórdão doutrinário", "assento": "Assento", "acordao": "Acórdão",
};
export const nomeTipo = k => TIPOS[k] || (k ? k[0].toUpperCase() + k.slice(1).replace(/-/g, " ") : "Diploma");

export function designacao(r) {
  if (r.k === "decreto-aprovacao-constituicao") return "Constituição da República Portuguesa";
  const ano = (r.d || "").slice(0, 4);
  if (!r.n) return nomeTipo(r.k);
  return r.n.includes("/") ? `${nomeTipo(r.k)} n.º ${r.n}` : `${nomeTipo(r.k)} n.º ${r.n}/${ano}`;
}

export const ESTADOS = { in_force: "Em vigor", repealed: "Revogado", partially_repealed: "Parcialmente revogado", expired: "Caducado" };

// Códigos e diplomas mais citados, com as abreviaturas usadas na prática.
export const ABREVIATURAS = {
  "cc": { k: "decreto-lei", n: "47344", ano: "1966", nome: "Código Civil" },
  "ccivil": { k: "decreto-lei", n: "47344", ano: "1966", nome: "Código Civil" },
  "codigo civil": { k: "decreto-lei", n: "47344", ano: "1966", nome: "Código Civil" },
  "cpc": { procurar: "codigo de processo civil", nome: "Código de Processo Civil" },
  "codigo de processo civil": { procurar: "codigo de processo civil", nome: "Código de Processo Civil" },
  "ct": { procurar: "codigo do trabalho", nome: "Código do Trabalho" },
  "codigo do trabalho": { procurar: "codigo do trabalho", nome: "Código do Trabalho" },
  "cp": { procurar: "codigo penal", nome: "Código Penal" },
  "codigo penal": { procurar: "codigo penal", nome: "Código Penal" },
  "cpp": { procurar: "codigo de processo penal", nome: "Código de Processo Penal" },
  "codigo de processo penal": { procurar: "codigo de processo penal", nome: "Código de Processo Penal" },
  "crp": { k: "decreto-aprovacao-constituicao", nome: "Constituição da República Portuguesa" },
  "constituicao": { k: "decreto-aprovacao-constituicao", nome: "Constituição da República Portuguesa" },
  "cpa": { procurar: "codigo do procedimento administrativo", nome: "Código do Procedimento Administrativo" },
  "codigo do procedimento administrativo": { procurar: "codigo do procedimento administrativo", nome: "Código do Procedimento Administrativo" },
  "ccp": { procurar: "codigo dos contratos publicos", nome: "Código dos Contratos Públicos" },
  "codigo dos contratos publicos": { procurar: "codigo dos contratos publicos", nome: "Código dos Contratos Públicos" },
  "cpta": { procurar: "codigo de processo nos tribunais administrativos", nome: "Código de Processo nos Tribunais Administrativos" },
  "csc": { procurar: "codigo das sociedades comerciais", nome: "Código das Sociedades Comerciais" },
  "cire": { procurar: "codigo da insolvencia e da recuperacao de empresas", nome: "Código da Insolvência e da Recuperação de Empresas" },
  "cpt": { procurar: "codigo de processo do trabalho", nome: "Código de Processo do Trabalho" },
  "cppt": { procurar: "codigo de procedimento e de processo tributario", nome: "Código de Procedimento e de Processo Tributário" },
  "lgt": { procurar: "lei geral tributaria", nome: "Lei Geral Tributária" },
  "cirs": { procurar: "codigo do imposto sobre o rendimento das pessoas singulares", nome: "Código do IRS" },
  "circ": { procurar: "codigo do imposto sobre o rendimento das pessoas coletivas", nome: "Código do IRC" },
  "civa": { procurar: "codigo do imposto sobre o valor acrescentado", nome: "Código do IVA" },
  "cestrada": { procurar: "codigo da estrada", nome: "Código da Estrada" },
  "ce": { procurar: "codigo da estrada", nome: "Código da Estrada" },
  "codigo da estrada": { procurar: "codigo da estrada", nome: "Código da Estrada" },
  "nrau": { procurar: "novo regime do arrendamento urbano", nome: "Novo Regime do Arrendamento Urbano" },
  "rgco": { procurar: "regime geral das contraordenacoes", nome: "Regime Geral das Contraordenações" },
  "ltfp": { procurar: "lei geral do trabalho em funcoes publicas", nome: "Lei Geral do Trabalho em Funções Públicas" },
  "lgtfp": { procurar: "lei geral do trabalho em funcoes publicas", nome: "Lei Geral do Trabalho em Funções Públicas" },
  "rcp": { procurar: "regulamento das custas processuais", nome: "Regulamento das Custas Processuais" },
  "cnot": { procurar: "codigo do notariado", nome: "Código do Notariado" },
  "crpredial": { procurar: "codigo do registo predial", nome: "Código do Registo Predial" },
  "rgpd": { externo: "Regulamento (UE) 2016/679", nome: "Regulamento Geral sobre a Proteção de Dados" },
};

// Encontra um diploma pela designação (abreviatura, nome do código ou "Lei n.º 7/2009").
export async function encontrarDiploma(texto) {
  const lista = await carregarPrincipais();
  const t = normalizar(texto).replace(/\./g, "");
  const abrev = ABREVIATURAS[t] || ABREVIATURAS[t.replace(/\s/g, "")];
  if (abrev?.externo) return { externo: abrev.externo, nome: abrev.nome };
  if (abrev?.k && abrev.n) return lista.find(r => r.k === abrev.k && r.n === abrev.n && r.d.startsWith(abrev.ano)) || null;
  if (abrev?.k) return lista.filter(r => r.k === abrev.k).sort((a, b) => b.a.localeCompare(a.a))[0] || null;
  if (abrev?.procurar) {
    const alvo = abrev.procurar;
    const candidatos = lista.filter(r => r._n.includes(alvo));
    // Prefere o diploma consolidado e em vigor, cujo título abreviado é o próprio código.
    candidatos.sort((a, b) => pontuarCodigo(b, alvo) - pontuarCodigo(a, alvo));
    return candidatos[0] || null;
  }
  const t2 = t.replace(/decreto[\s-]lei/g, "decreto-lei").replace(/\bdl\b/g, "decreto-lei");
  const m = /(lei organica|lei constitucional|decreto-lei|decreto legislativo regional|decreto regulamentar|portaria|lei|decreto)\s*(?:n\.?\s*)?(\d+(?:-[a-z])?)\s*(?:\/\s*|,?\s*de\s+(?:\d{1,2}\s+de\s+[a-z]+\s+de\s+)?)(\d{4}|\d{2})\b/.exec(t2);
  if (m) {
    const k = m[1].replace(/\s/g, "-");
    const numero = m[2];
    let ano = m[3];
    if (ano.length === 2) ano = (Number(ano) > 30 ? "19" : "20") + ano;
    let lst = [...lista];
    if (k === "portaria") lst = lst.concat(await carregarOutros());
    const igual = r => {
      const n = r.n.toLowerCase();
      return n === numero || n === `${numero}/${ano}` || n.split("/")[0] === numero;
    };
    return lst.filter(r => r.k === k && igual(r) && r.d.startsWith(ano))
      .sort((a, b) => (b.v - a.v) || ((b.s === "in_force") - (a.s === "in_force")))[0] || null;
  }
  return null;
}

function pontuarCodigo(r, alvo) {
  let p = 0;
  if (normalizar(r.c).startsWith(alvo)) p += 10;
  if (r.v) p += 5;
  if (r.s === "in_force") p += 4;
  if (/aprova/i.test(r.t)) p += 2;
  p += Math.min(r.x || 0, 2000) / 400;
  return p;
}

// Temas frequentes e os diplomas de referência (pesquisa sem IA).
const TEMAS = [
  { re: /despedim|contrato de trabalho|trabalhador|empregador|retribui|f[eé]rias|trabalho suplementar|justa causa|ass[eé]dio no trabalho|parentalidade|lay.?off|teletrabalho|comiss[aã]o de servi[cç]o/, d: ["ct", "cpt"] },
  { re: /fun[cç][oõ]es p[uú]blicas|funcion[aá]rio p[uú]blico|trabalhador em fun[cç][oõ]es/, d: ["ltfp"] },
  { re: /arrend|renda|senhori|inquilin|despejo|locat[aá]ri/, d: ["nrau", "cc"] },
  { re: /empreit|defeito|compra e venda|responsabilidade civil|indemniz|incumprimento|contrato.promessa|usucapi|propriedade horizontal|servid[aã]o|heran[cç]a|testament|div[oó]rcio|responsabilidades parentais|alimentos|m[uú]tuo|fian[cç]a|enriquecimento sem causa|abuso d[oe] direito|prescri[cç][aã]o/, d: ["cc"] },
  { re: /recurso de apela|revista|penhora|execu[cç][aã]o|provid[eê]ncia cautelar|cita[cç][aã]o|nulidade da senten[cç]a|prova testemunhal|caso julgado|in[eé]pcia|litig[aâ]ncia de m[aá].f[eé]/, d: ["cpc"] },
  { re: /custas|taxa de justi[cç]a/, d: ["rcp", "cpc"] },
  { re: /crime|arguido|\bpena\b|furto|roubo|burla|homic[ií]dio|ofensa [aà] integridade|viol[eê]ncia dom[eé]stica|pris[aã]o preventiva|abuso de confian[cç]a|falsifica[cç][aã]o|difama[cç][aã]o|inj[uú]ria/, d: ["cp", "cpp"] },
  { re: /contrata[cç][aã]o p[uú]blica|concurso p[uú]blico|proposta|adjudica|caderno de encargos|j[uú]ri do procedimento|anormalmente baix|ajuste direto|consulta pr[eé]via|contrato p[uú]blico|empreitada de obras p[uú]blicas/, d: ["ccp", "cpta"] },
  { re: /ato administrativo|acto administrativo|audi[eê]ncia pr[eé]via|procedimento administrativo|fundamenta[cç][aã]o do a[ct]?to|deferimento t[aá]cito|impugna[cç][aã]o administrativa/, d: ["cpa", "cpta"] },
  { re: /insolv|plano de recupera|processo especial de revitaliza|administrador judicial/, d: ["cire"] },
  { re: /sociedade|gerente|s[oó]cio|quota|assembleia geral|delibera[cç][aã]o social|administrador da sociedade/, d: ["csc"] },
  { re: /dados pessoais|rgpd|videovigil|prote[cç][aã]o de dados/, d: ["lei 58/2019"] },
  { re: /\birs\b|\birc\b|\biva\b|imposto|tribut[aá]ri|inspe[cç][aã]o tribut|liquida[cç][aã]o adicional|execu[cç][aã]o fiscal/, d: ["lgt", "cppt"] },
  { re: /acidente de via[cç][aã]o|c[oó]digo da estrada|condu[cç][aã]o|seguro autom[oó]vel/, d: ["ce", "cc"] },
  { re: /consumidor|bens de consumo|garantia legal|cl[aá]usulas contratuais gerais/, d: ["decreto-lei 84/2021", "decreto-lei 446/85"] },
  { re: /inconstitucional|direitos fundamentais|princ[ií]pio da igualdade|princ[ií]pio da proporcionalidade/, d: ["crp"] },
  { re: /contraordena[cç]/, d: ["rgco"] },
  { re: /registo predial|hipoteca|penhora de im[oó]vel/, d: ["crpredial", "cc"] },
];

export async function diplomasDeReferencia(texto) {
  const t = texto.toLowerCase();
  const pedidos = [];
  for (const tema of TEMAS) if (tema.re.test(t)) for (const d of tema.d) if (!pedidos.includes(d)) pedidos.push(d);
  const lista = [];
  for (const d of pedidos.slice(0, 5)) {
    const r = await encontrarDiploma(d).catch(() => null);
    if (r && !r.externo && !lista.some(x => x.p === r.p)) lista.push(r);
  }
  return lista;
}

const ALTERACAO = /^(altera|procede [aà]|primeira|segunda|terceira|quarta|quinta|sexta|s[eé]tima|oitava|nona|d[eé]cima|prorroga|ratifica|aprova, para|autoriza|suspende|revoga|adita|republica|regulamenta o artigo)/i;

// Pesquisa no índice: título, descritores e sumário do Diário da República, com peso inverso à frequência dos termos.
export async function pesquisarLegislacao(texto, { incluirOutros = false, max = 30, desde = "" } = {}) {
  const lista = await carregarPrincipais();
  const termos = palavrasChave(texto, 10);
  if (!termos.length) return [];
  const N = lista.length;
  const pontos = new Map();
  for (const termo of termos) {
    const prefixo = termo.length > 6 ? termo.slice(0, termo.length - 2) : termo;
    const campos = new Map();
    for (const [palavra, ids] of indicePalavras) {
      if (!palavra.startsWith(prefixo)) continue;
      for (const [i, m] of ids) campos.set(i, (campos.get(i) || 0) | m);
    }
    if (!campos.size) continue;
    const idf = Math.log(1 + N / campos.size);
    for (const [i, m] of campos) {
      const p = idf * ((m & 1 ? 4 : 0) + (m & 2 ? 3 : 0) + (m & 4 ? 1.2 : 0));
      const atual = pontos.get(i) || { p: 0, n: 0 };
      atual.p += p; atual.n += 1;
      pontos.set(i, atual);
    }
  }
  const total = termos.length;
  let res = [...pontos.entries()].map(([i, v]) => {
    const r = lista[i];
    let p = v.p * Math.pow(v.n / total, 1.4);
    if (r.s === "in_force") p *= 1.5; else if (r.s === "repealed") p *= 0.45;
    if (r.v) p *= 1.6;
    if (/^c[oó]digo|regime jur[ií]dico|regime geral/i.test(r.c || r.t)) p *= 1.8;
    if (ALTERACAO.test(r.t.replace(/^[^—]*—\s*/, "")) || ALTERACAO.test(r.r)) p *= 0.55;
    if (r.k === "decreto" || r.k.startsWith("resolucao") || r.k === "declaracao-rectificacao") p *= 0.5;
    return { ...r, _p: p, _t: v.n };
  });
  if (desde) res = res.filter(r => r.d >= desde);
  if (incluirOutros) {
    const extra = await carregarOutros();
    for (const r of extra) {
      if (desde && r.d < desde) continue;
      const alvo = `${r._n} ${r._m} ${r._r}`;
      const enc = termos.filter(t => alvo.includes(t.length > 6 ? t.slice(0, -2) : t));
      if (enc.length >= Math.min(2, termos.length)) res.push({ ...r, _p: enc.length * 2, _t: enc.length });
    }
  }
  const minimo = Math.max(Math.min(2, total), Math.ceil(total * 0.5));
  return res.filter(r => r._t >= minimo).sort((a, b) => b._p - a._p).slice(0, max);
}

// Diplomas publicados recentemente sobre o tema (separador do Diário da República).
export async function publicacoesRecentes(texto, meses = 24) {
  if (!recentes) {
    recentes = await carregarGrupo("recentes");
    recentes.forEach(r => { r._n = normalizar(`${r.c} ${r.t}`); r._m = normalizar((r.m || []).join(" ")); r._r = normalizar(r.r); });
  }
  const d = new Date(); d.setMonth(d.getMonth() - meses);
  const desde = d.toISOString().slice(0, 10);
  const termos = palavrasChave(texto, 10).map(t => (t.length > 6 ? t.slice(0, -2) : t));
  if (!termos.length) return [];
  const minimo = Math.max(Math.min(2, termos.length), Math.ceil(termos.length * 0.5));
  return recentes.filter(r => r.d >= desde && r.k !== "declaracao-rectificacao").map(r => {
    const alvo = `${r._n} ${r._m} ${r._r}`;
    return { ...r, _t: termos.filter(t => alvo.includes(t)).length };
  }).filter(r => r._t >= minimo).sort((a, b) => b._t - a._t || b.d.localeCompare(a.d)).slice(0, 25).sort((a, b) => b.d.localeCompare(a.d));
}

// Acórdãos publicados na 1.ª série: uniformização de jurisprudência e força obrigatória geral.
export async function alertasJurisprudencia(texto) {
  const lista = await carregarJurisprudenciaDR();
  const termos = palavrasChave(texto, 10).map(t => (t.length > 6 ? t.slice(0, -2) : t));
  if (!termos.length) return [];
  return lista.map(r => {
    const alvo = `${r._n} ${r._m} ${r._r}`;
    const n = termos.filter(t => alvo.includes(t)).length;
    return { ...r, _t: n };
  }).filter(r => /acordao|assento/.test(r.k) && r._t >= Math.max(Math.min(2, termos.length), Math.ceil(termos.length * 0.6)))
    .sort((a, b) => b._t - a._t || b.d.localeCompare(a.d)).slice(0, 6);
}

// ---------- Texto e versões ----------

const cacheVersoes = new Map();

// Lista as versões de um diploma (cada versão = data de entrada em vigor).
export async function versoes(caminho) {
  if (cacheVersoes.has(caminho)) return cacheVersoes.get(caminho);
  const r = await fetch(`${API}/commits?path=${encodeURIComponent(caminho)}&per_page=100`, { headers: { Accept: "application/vnd.github+json" } });
  if (r.status === 403 || r.status === 429) throw new Error("O limite de consultas de versões foi atingido. Tente novamente dentro de alguns minutos.");
  if (!r.ok) throw new Error("Não foi possível obter as versões do diploma.");
  const lista = (await r.json()).map(c => ({ sha: c.sha, data: c.commit.author.date.slice(0, 10), nota: c.commit.message.split("\n")[0] }));
  cacheVersoes.set(caminho, lista);
  return lista;
}

export function versaoNaData(lista, data) {
  if (!data) return lista[0];
  const ord = [...lista].sort((a, b) => b.data.localeCompare(a.data));
  return ord.find(v => v.data <= data) || null;
}

const cacheTextos = new Map();
export async function textoDiploma(caminho, sha = "main") {
  const chave = `${sha}:${caminho}`;
  if (cacheTextos.has(chave)) return cacheTextos.get(chave);
  const r = await fetch(`${RAW}/${sha}/${caminho.split("/").map(encodeURIComponent).join("/")}`);
  if (!r.ok) throw new Error("Não foi possível obter o texto do diploma.");
  const t = await r.text();
  cacheTextos.set(chave, t);
  return t;
}

// Divide o texto em artigos: { numero, epigrafe, texto }.
export function artigos(markdown) {
  const corpo = markdown.replace(/^---[\s\S]*?\n---\n/, "");
  const partes = corpo.split(/^(#{2,6} .*)$/m);
  const lista = [];
  let contexto = [];
  for (let i = 1; i < partes.length; i += 2) {
    const titulo = partes[i].replace(/^#+\s*/, "").trim();
    const texto = (partes[i + 1] || "").trim();
    const m = /^Artigo\s+([\dA-Za-z.º°-]+)(?:\s*[—–-]\s*\(?(.*?)\)?)?$/i.exec(titulo);
    if (m) {
      lista.push({ indice: lista.length, numero: m[1].replace(/[º°.]+$/, "").replace(/º/g, ""), rotulo: `Artigo ${m[1]}`, epigrafe: (m[2] || "").replace(/^\(|\)$/g, ""), texto, contexto: contexto.filter(Boolean).join(", ") });
    } else {
      const nivel = (partes[i].match(/^#+/) || [""])[0].length;
      contexto = contexto.slice(0, Math.max(0, nivel - 2));
      contexto[nivel - 2] = titulo;
    }
  }
  return lista;
}

// Nos códigos, o diploma de aprovação tem os seus próprios artigos 1.º, 2.º...; o artigo citado é o do código (o último).
export function encontrarArtigo(lista, numero, preferirUltimo = true) {
  const alvo = String(numero).toLowerCase().replace(/[º°.\s]/g, "");
  const iguais = lista.filter(a => a.numero.toLowerCase().replace(/[º°.\s]/g, "") === alvo);
  if (!iguais.length) return null;
  return preferirUltimo ? iguais[iguais.length - 1] : iguais[0];
}

// Endereço oficial do diploma no Diário da República.
export const ligacaoOficial = r => r.e || r.o || "https://diariodarepublica.pt";
