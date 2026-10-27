// Verificador de citações: encontra acórdãos e artigos citados num texto e confirma-os nas fontes oficiais.
import { procurarProcesso, basesPorProcesso, lerAcordao, ponte } from "./fontes/dgsi.js";
import { encontrarDiploma, versoes, versaoNaData, textoDiploma, artigos, encontrarArtigo, designacao } from "./fontes/legislacao.js";
import { normalizar } from "./util.js";

const RE_PROCESSO = /\b(?:proc(?:esso)?\.?\s*(?:n\.?\s*º?\s*)?)?(\d{1,6}\/\d{2}\.\d{1,2}[A-Z]{1,6}[A-Z0-9]*(?:[.-][A-Z0-9]{1,8})*)\b/g;
const RE_PROCESSO_ANTIGO = /\bproc(?:esso)?\.?\s*(?:n\.?\s*º?\s*)?(\d{2}[A-Z]\d{3,5}|0\d{5,6})\b/gi;
const RE_TC = /\bAc(?:órdão|\.)?\s*(?:do\s+)?(?:Tribunal\s+Constitucional|TC)\s*(?:n\.?\s*º?\s*)?(\d{1,4})\/(\d{2,4})|\bAc(?:órdão|\.)?\s*(?:n\.?\s*º?\s*)?(\d{1,4})\/(\d{2,4})\s*(?:,?\s*do\s+)?(?:Tribunal\s+Constitucional|TC)\b/gi;
const RE_ECLI = /\bECLI:PT:[A-Z]+:\d{4}:[A-Z0-9.]+/g;

const DIPLOMAS = "(?:CC|C\\.?\\s?Civil|CPC|CT|C\\.?\\s?Trabalho|CP|CPP|CRP|CPA|CCP|CPTA|CSC|CIRE|CPT|CPPT|LGT|CIRS|CIRC|CIVA|CE|NRAU|RGCO|LTFP|LGTFP|RCP|" +
  "Código\\s+(?:Civil|Penal|do\\s+Trabalho|de\\s+Processo\\s+(?:Civil|Penal|do\\s+Trabalho|nos\\s+Tribunais\\s+Administrativos)|do\\s+Procedimento\\s+Administrativo|dos\\s+Contratos\\s+Públicos|das\\s+Sociedades\\s+Comerciais|da\\s+Estrada|da\\s+Insolvência\\s+e\\s+da\\s+Recuperação\\s+de\\s+Empresas)|" +
  "Constituição(?:\\s+da\\s+República(?:\\s+Portuguesa)?)?|" +
  "(?:Lei(?:\\s+Orgânica)?|Decreto-Lei|DL|Decreto\\s+Regulamentar|Portaria)\\s+n\\.?\\s*º?\\s*\\d+[A-Z]?(?:-[A-Z])?\\/\\d{2,4})";
const RE_ARTIGO = new RegExp(`\\b(?:artigos?|arts?\\.)\\s+(\\d+[.º°]*(?:-[A-Z])?)\\s*(?:\\.\\s*º|º)?(?:\\s*,?\\s*(?:n\\.?\\s*º?\\s*\\d+|alínea\\s+[a-z]\\)|al\\.\\s*[a-z]\\)))*\\s*,?\\s*(?:do|da|dos|das)?\\s*(${DIPLOMAS})`, "gi");

function fraseEnvolvente(texto, pos) {
  const inicio = Math.max(texto.lastIndexOf(".", pos - 1), texto.lastIndexOf("\n", pos - 1)) + 1;
  let fim = texto.slice(pos).search(/[.;\n](\s|$)/);
  fim = fim < 0 ? texto.length : pos + fim + 1;
  return texto.slice(inicio, fim).trim().slice(0, 600);
}

export function extrairCitacoes(texto) {
  const lista = [];
  const vistos = new Set();
  const juntar = (tipo, chave, dados, pos) => {
    const k = tipo + "|" + chave;
    if (vistos.has(k)) return;
    vistos.add(k);
    lista.push({ tipo, chave, ...dados, frase: fraseEnvolvente(texto, pos), pos });
  };
  for (const m of texto.matchAll(RE_PROCESSO)) juntar("acordao", m[1], { processo: m[1] }, m.index);
  for (const m of texto.matchAll(RE_PROCESSO_ANTIGO)) juntar("acordao", m[1], { processo: m[1] }, m.index);
  for (const m of texto.matchAll(RE_TC)) {
    const num = m[1] || m[3]; let ano = m[2] || m[4];
    if (ano.length === 2) ano = (Number(ano) > 50 ? "19" : "20") + ano;
    juntar("tc", `${num}/${ano}`, { numero: num, ano }, m.index);
  }
  for (const m of texto.matchAll(RE_ECLI)) juntar("ecli", m[0], { ecli: m[0] }, m.index);
  for (const m of texto.matchAll(RE_ARTIGO)) {
    const artigo = m[1].replace(/[.º°]+$/, "");
    const diploma = m[2].replace(/\s+/g, " ").trim();
    juntar("artigo", `${artigo}|${normalizar(diploma)}`, { artigo, diploma }, m.index);
  }
  return lista.sort((a, b) => a.pos - b.pos);
}

// Verifica uma citação. Devolve { estado: "confirmada" | "nao-encontrada" | "a-confirmar", ... }.
export async function verificar(c, { dataFactos = "" } = {}) {
  if (c.tipo === "acordao") {
    const bases = basesPorProcesso(c.processo);
    const r = await procurarProcesso(c.processo, bases);
    if (!r.resultados.length) return { estado: "nao-encontrada", nota: "Não existe nas bases da DGSI nenhum acórdão com este número de processo. Pode não estar publicado na DGSI ou o número pode estar errado." };
    return { estado: "confirmada", acordaos: r.resultados, nota: r.resultados.length > 1 ? `Existem ${r.resultados.length} decisões com este número de processo.` : "" };
  }
  if (c.tipo === "tc") {
    const url = `https://www.tribunalconstitucional.pt/tc/acordaos/${c.ano}${String(c.numero).padStart(4, "0")}.html`;
    const resp = await ponte(url);
    const texto = resp.ok ? normalizar(new DOMParser().parseFromString(resp.texto, "text/html").body?.textContent || "") : "";
    // O sítio do Tribunal devolve uma página mesmo quando o acórdão não existe: confirma-se pelo título.
    const existe = new RegExp(`ac[oó]rd[aã]o\\s*n\\s*\\.?\\s*${c.numero}\\s*/\\s*${c.ano}`).test(texto);
    if (existe) return { estado: "confirmada", url, nota: "Acórdão encontrado no sítio do Tribunal Constitucional." };
    return { estado: "nao-encontrada", url, nota: "O Tribunal Constitucional não tem publicado um acórdão com este número e ano." };
  }
  if (c.tipo === "ecli") {
    return { estado: "a-confirmar", url: `https://e-justice.europa.eu/ecli/${encodeURIComponent(c.ecli)}`, nota: "Identificador ECLI reconhecido. Confirme no Portal Europeu da Justiça." };
  }
  if (c.tipo === "artigo") {
    const d = await encontrarDiploma(c.diploma);
    if (!d) return { estado: "a-confirmar", nota: `Não foi possível identificar o diploma "${c.diploma}" no índice do Diário da República.` };
    if (d.externo) return { estado: "a-confirmar", nota: `${d.nome}: diploma da União Europeia, a confirmar no EUR-Lex.` };
    let sha = "main", aplicavel = null;
    if (dataFactos) {
      try {
        const vs = await versoes(d.p);
        aplicavel = versaoNaData(vs, dataFactos);
        if (aplicavel) sha = aplicavel.sha;
      } catch { /* usa a versão em vigor */ }
    }
    const md = await textoDiploma(d.p, sha);
    const art = encontrarArtigo(artigos(md), c.artigo, /^c[oó]digo|constitui/i.test(d.c || d.t));
    if (!art) return { estado: "nao-encontrada", diploma: d, nota: `O ${designacao(d)} não tem artigo ${c.artigo}.º${dataFactos ? " na versão em vigor à data indicada" : ""}.` };
    const revogado = /^\s*\(?revogad[oa]\)?\.?\s*$/i.test(art.texto) || /^\s*\[?revogad/i.test(art.texto);
    return {
      estado: revogado ? "nao-encontrada" : "confirmada", diploma: d, artigo: art, versao: aplicavel,
      nota: revogado ? "O artigo existe, mas está revogado na versão consultada." : "",
    };
  }
  return { estado: "a-confirmar", nota: "" };
}

export async function abrirAcordaoCitado(resultado) {
  return lerAcordao(resultado.url);
}
