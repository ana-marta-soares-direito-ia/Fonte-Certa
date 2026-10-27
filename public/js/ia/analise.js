// Análises com IA. Regra de construção: nenhuma afirmação é apresentada sem o trecho exacto
// do acórdão que a sustenta; o que não for encontrado, palavra por palavra, no texto é descartado.
import { pedirJSON, fornecedorIA } from "./gemini.js";
import { normalizar } from "../util.js";
import { BASES } from "../fontes/dgsi.js";

const SISTEMA_BASE = `És um assistente de investigação jurídica para advogados e juristas portugueses.
Escreves em português europeu, em registo jurídico rigoroso e sóbrio, sem expressões coloquiais.
Nunca inventas acórdãos, números de processo, datas, normas ou citações.
Trabalhas apenas com os textos que te são fornecidos e, quando estes não permitem uma conclusão, dizes isso mesmo.
Respondes sempre e só com JSON válido, no formato pedido.`;

// 1. Plano de pesquisa a partir da pergunta em linguagem corrente.
export async function planearPesquisa(pergunta, caso) {
  const mensagem = `Pergunta do utilizador: """${pergunta}"""
${caso ? `Contexto do caso (anonimizado): """${caso}"""` : ""}

Prepara a pesquisa nas bases da DGSI (motor de pesquisa Lotus Domino) e na legislação portuguesa.
Regras para as consultas da DGSI:
- cada consulta tem 2 a 4 termos ligados por AND (em maiúsculas);
- podes usar o asterisco no fim de um radical (ex.: despedim*, empreit*);
- não uses parênteses, OR, nem aspas;
- usa a terminologia que os tribunais portugueses empregam nos descritores e sumários;
- a primeira consulta é a mais precisa, as seguintes alargam progressivamente.

Responde com:
{
 "consultas": ["termo1 AND termo2*", "..."],                       // 3 a 5 consultas
 "descritores": ["DESCRITOR OFICIAL", "..."],                       // 2 a 5 descritores prováveis, em maiúsculas
 "jurisdicao": "comum" | "administrativa" | "ambas",
 "tribunais": ["jstj","jtrl",...],                                  // subconjunto de: ${Object.keys(BASES).join(", ")}
 "area": "civil" | "penal" | "laboral" | "administrativo" | "fiscal" | "familia" | "comercial" | "constitucional" | "outra",
 "diplomas": [{"designacao": "Código Civil" ou "Lei n.º 7/2009", "artigos": ["798", "799"]}],   // normas provavelmente aplicáveis
 "termos_legislacao": "palavras para pesquisar a legislação aplicável",
 "questao": "a questão jurídica reformulada numa frase, em linguagem técnica"
}`;
  return pedirJSON({ sistema: SISTEMA_BASE, mensagem, temperatura: 0.2, maxTokens: 2048 });
}

// 2. Ordenação por pertinência para a questão, a partir dos descritores e sumários.
export async function ordenarPorPertinencia(questao, acordaos) {
  const lista = acordaos.map((a, i) => `[${i}] ${BASES[a.base]?.curto || a.base}, ${a.data}, proc. ${a.processo}. Descritores: ${(a.descritores || []).join("; ")}.${a.sumarioCurto ? " Sumário: " + a.sumarioCurto : ""}`).join("\n");
  const mensagem = `Questão jurídica: """${questao}"""

Acórdãos encontrados:
${lista}

Classifica a pertinência de cada acórdão para a questão, de 0 (nada pertinente) a 10 (decide exactamente esta questão).
Responde com: {"pontuacoes": [{"i": 0, "p": 7}, ...]}`;
  const r = await pedirJSON({ sistema: SISTEMA_BASE, mensagem, maxTokens: 2048 });
  return (r.pontuacoes || []).filter(x => Number.isInteger(x.i) && x.i >= 0 && x.i < acordaos.length);
}

// 3. Parecer do acórdão face ao caso, com verificação literal dos trechos.
export async function parecerAcordao(caso, ac) {
  const paragrafos = (ac.texto.length ? ac.texto : ac.sumario);
  const origem = ac.texto.length ? "texto integral" : "sumário";
  // Limita a dimensão: sumário completo e até cerca de 60 000 caracteres do texto.
  let total = 0;
  const limite = fornecedorIA() === "gemini" ? 60000 : 32000;
  const numerados = [];
  paragrafos.forEach((p, i) => { if (total < limite) { numerados.push(`§${i + 1}: ${p}`); total += p.length; } });
  const sumario = ac.sumario.map((p, i) => `S${i + 1}: ${p}`).join("\n");
  const mensagem = `CASO DO UTILIZADOR (anonimizado):
"""${caso.texto}"""
Posição processual do utilizador: ${caso.posicao || "não indicada"}.
Pretensão: ${caso.pretensao || "não indicada"}.

ACÓRDÃO: ${ac.tribunal}, ${ac.data}, processo ${ac.processo}, relator ${ac.relator}. Votação: ${ac.votacao || "não indicada"}. Decisão: ${ac.decisao || "não indicada"}.
Descritores: ${ac.descritores.join("; ")}
SUMÁRIO:
${sumario || "(sem sumário)"}
${origem.toUpperCase()} (parágrafos numerados):
${numerados.join("\n")}

Analisa a utilidade deste acórdão PARA O CASO DO UTILIZADOR, na posição processual indicada.
Para cada ponto, indica o parágrafo (§n ou Sn) e transcreve um trecho EXACTO desse parágrafo, copiado letra a letra, com 8 a 35 palavras.
Não incluas pontos que não consigas sustentar num trecho literal.

Responde com:
{
 "semelhanca": {"grau": "alta" | "média" | "baixa", "coincidencias": ["..."], "diferencas": ["..."]},
 "favoravel": [{"ponto": "como este trecho serve o caso e como usá-lo na peça", "ref": "§12", "trecho": "..."}],
 "desfavoravel": [{"ponto": "argumento que a parte contrária pode extrair", "ref": "§7", "trecho": "..."}],
 "distincoes": ["razões, assentes nos factos, para afastar o acórdão se for invocado contra o utilizador"],
 "classificacao": "favorável" | "neutro" | "desfavorável",
 "sintese": "duas a três frases com a apreciação global"
}`;
  const r = await pedirJSON({ sistema: SISTEMA_BASE, mensagem, temperatura: 0.1, maxTokens: 4096 });
  return verificarParecer(r, ac);
}

// Confirma que cada trecho existe literalmente no acórdão; corrige a referência se estiver noutro parágrafo.
export function verificarParecer(r, ac) {
  const fontes = [
    ...ac.sumario.map((p, i) => ({ ref: `S${i + 1}`, n: normalizar(p), i, tipo: "sumario" })),
    ...ac.texto.map((p, i) => ({ ref: `§${i + 1}`, n: normalizar(p), i, tipo: "texto" })),
  ];
  let descartados = 0;
  const confirmar = item => {
    if (!item || !item.trecho) { descartados++; return null; }
    const alvo = normalizar(item.trecho).replace(/\s*\.\.\.\s*/g, " ");
    if (alvo.split(" ").length < 4) { descartados++; return null; }
    let fonte = fontes.find(f => f.ref === item.ref && f.n.includes(alvo)) || fontes.find(f => f.n.includes(alvo));
    if (!fonte) {
      // Aceita pequenas diferenças de pontuação: procura os primeiros e últimos termos.
      const pal = alvo.split(" ");
      const inicio = pal.slice(0, 6).join(" "), fim = pal.slice(-6).join(" ");
      fonte = fontes.find(f => f.n.includes(inicio) && f.n.includes(fim));
    }
    if (!fonte) { descartados++; return null; }
    return { ...item, ref: fonte.ref, indice: fonte.i, tipo: fonte.tipo, verificado: true };
  };
  const favoravel = (r.favoravel || []).map(confirmar).filter(Boolean);
  const desfavoravel = (r.desfavoravel || []).map(confirmar).filter(Boolean);
  const classificacoes = ["favorável", "neutro", "desfavorável"];
  return {
    semelhanca: r.semelhanca || { grau: "baixa", coincidencias: [], diferencas: [] },
    favoravel, desfavoravel,
    distincoes: (r.distincoes || []).filter(x => typeof x === "string").slice(0, 5),
    classificacao: classificacoes.includes(r.classificacao) ? r.classificacao : "neutro",
    sintese: r.sintese || "",
    descartados,
  };
}

// 4. Mapa de correntes jurisprudenciais.
export async function mapaCorrentes(questao, acordaos) {
  const lista = acordaos.map((a, i) => `[${i}] ${BASES[a.base]?.curto || a.base}, ${a.data}, proc. ${a.processo}. Descritores: ${(a.descritores || []).join("; ")}. Sumário: ${(a.sumarioCurto || "").slice(0, 700)}`).join("\n");
  const mensagem = `Questão jurídica: """${questao}"""

Acórdãos (com sumário):
${lista}

Identifica as correntes (teses) jurisprudenciais sobre a questão. Agrupa os acórdãos por tese, usando apenas os índices fornecidos.
Um acórdão que não se pronuncia sobre a questão fica de fora. Se só houver uma tese, devolve uma corrente.
Responde com:
{
 "correntes": [{"tese": "enunciado da tese numa frase", "fundamento": "fundamento principal, numa frase", "indices": [0, 3]}],
 "observacao": "nota sobre a evolução temporal ou sobre a corrente maioritária, se os dados o permitirem"
}`;
  const r = await pedirJSON({ sistema: SISTEMA_BASE, mensagem, temperatura: 0.1, maxTokens: 3000 });
  const correntes = (r.correntes || []).map(c => ({
    tese: c.tese || "", fundamento: c.fundamento || "",
    indices: [...new Set((c.indices || []).filter(i => Number.isInteger(i) && i >= 0 && i < acordaos.length))],
  })).filter(c => c.tese && c.indices.length);
  return { correntes, observacao: r.observacao || "" };
}

// 5. Confirma se o acórdão citado sustenta a afirmação feita na peça.
export async function confirmarCitacao(frase, ac) {
  const sumario = ac.sumario.map((p, i) => `S${i + 1}: ${p}`).join("\n");
  const texto = ac.texto.slice(0, 120).map((p, i) => `§${i + 1}: ${p}`).join("\n").slice(0, 40000);
  const mensagem = `Numa peça processual afirma-se o seguinte, invocando este acórdão:
"""${frase}"""

ACÓRDÃO: ${ac.tribunal}, ${ac.data}, processo ${ac.processo}.
SUMÁRIO:
${sumario}
TEXTO:
${texto}

O acórdão sustenta a afirmação? Responde "sim" apenas se o acórdão decidir ou afirmar exactamente o que a peça lhe atribui; se tratar de outra questão, responde "não".
O trecho tem de mostrar directamente a resposta. Responde com:
{"sustenta": "sim" | "em parte" | "não", "explicacao": "uma a duas frases", "ref": "§n ou Sn", "trecho": "trecho exacto que fundamenta a resposta, 8 a 35 palavras"}`;
  const r = await pedirJSON({ sistema: SISTEMA_BASE, mensagem, maxTokens: 1024 });
  const v = verificarParecer({ favoravel: [{ ponto: r.explicacao, ref: r.ref, trecho: r.trecho }] }, ac);
  const prova = v.favoravel[0] || null;
  let sustenta = ["sim", "em parte", "não"].includes(r.sustenta) ? r.sustenta : "em parte";
  // Sem trecho confirmado no texto, não se pode afirmar que o acórdão sustenta a citação.
  if (!prova && sustenta !== "não") sustenta = "por confirmar";
  return { sustenta, explicacao: r.explicacao || "", prova };
}
