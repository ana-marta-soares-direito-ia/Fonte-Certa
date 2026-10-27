// Acesso às bases jurídico-documentais da DGSI (IGFEJ), através da ponte da app.
import { normalizar, emParalelo } from "../util.js";

export const BASES = {
  jstj:  { nome: "Supremo Tribunal de Justiça", curto: "STJ", vista: "954f0ce6ad9dd8b980256b5f003fa814", nivel: 3, jurisdicao: "comum" },
  jsta:  { nome: "Supremo Tribunal Administrativo", curto: "STA", vista: "35fbbbf22e1bb1e680256f8e003ea931", nivel: 3, jurisdicao: "administrativa" },
  jcon:  { nome: "Tribunal dos Conflitos", curto: "T. Conflitos", vista: "35fbbbf22e1bb1e680256f8e003ea931", nivel: 3, jurisdicao: "ambas" },
  jtrl:  { nome: "Tribunal da Relação de Lisboa", curto: "TRL", vista: "33182fc732316039802565fa00497eec", nivel: 2, jurisdicao: "comum" },
  jtrp:  { nome: "Tribunal da Relação do Porto", curto: "TRP", vista: "56a6e7121657f91e80257cda00381fdf", nivel: 2, jurisdicao: "comum" },
  jtrc:  { nome: "Tribunal da Relação de Coimbra", curto: "TRC", vista: "8fe0e606d8f56b22802576c0005637dc", nivel: 2, jurisdicao: "comum" },
  jtrg:  { nome: "Tribunal da Relação de Guimarães", curto: "TRG", vista: "86c25a698e4e7cb7802579ec004d3832", nivel: 2, jurisdicao: "comum" },
  jtre:  { nome: "Tribunal da Relação de Évora", curto: "TRE", vista: "134973db04f39bf2802579bf005f080b", nivel: 2, jurisdicao: "comum" },
  jtca:  { nome: "Tribunal Central Administrativo Sul", curto: "TCA Sul", vista: "170589492546a7fb802575c3004c6d7d", nivel: 2, jurisdicao: "administrativa" },
  jtcn:  { nome: "Tribunal Central Administrativo Norte", curto: "TCA Norte", vista: "89d1c0288c2dd49c802575c8003279c7", nivel: 2, jurisdicao: "administrativa" },
  cajp:  { nome: "Julgados de Paz", curto: "Julgados de Paz", vista: "954f0ce6ad9dd8b980256b5f003fa814", nivel: 1, jurisdicao: "comum" },
  atco1: { nome: "Tribunal Constitucional (até 1998)", curto: "TC", vista: "904714e45043f49b802565fa004a5fd7", nivel: 3, jurisdicao: "constitucional" },
};

export const GRUPOS_BASES = {
  comum: ["jstj", "jtrl", "jtrp", "jtrc", "jtrg", "jtre"],
  administrativa: ["jsta", "jtca", "jtcn"],
  todas: ["jstj", "jsta", "jtrl", "jtrp", "jtrc", "jtrg", "jtre", "jtca", "jtcn", "jcon"],
};

// Ordenação da DGSI (Domino): 1 relevância, 3 data mais recente primeiro.
export const ORDEM = { relevancia: 1, recentes: 3 };

export async function ponte(url, opcoes = {}) {
  const r = await fetch("/api/fonte?u=" + encodeURIComponent(url), opcoes);
  const buf = await r.arrayBuffer();
  const ct = r.headers.get("Content-Type") || "";
  let cs = (/charset=([^;]+)/i.exec(ct)?.[1] || "utf-8").trim().toLowerCase();
  if (cs === "us-ascii") cs = "utf-8";
  let texto;
  try { texto = new TextDecoder(cs).decode(buf); } catch { texto = new TextDecoder("windows-1252").decode(buf); }
  return { estado: r.status, ok: r.ok, texto, url };
}

// Converte datas da DGSI: aparece como dd-mm-aaaa ou mm/dd/aaaa conforme o idioma do pedido.
export function dataDGSI(s) {
  s = (s || "").trim();
  let m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[1]}-${m[2]}`;
  return "";
}

const html2txt = h => {
  const d = document.createElement("div");
  d.innerHTML = h;
  return d.textContent.replace(/\s+/g, " ").trim();
};

function lerTabelaResultados(html, base) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const total = /(\d+)\s+documents?\s+(?:returned;\s+(\d+)\s+)?found/i.exec(doc.body?.textContent || "");
  const resultados = [];
  let cabecalho = null;
  for (const tr of doc.querySelectorAll("tr")) {
    const celulas = [...tr.cells].map(c => c.textContent.replace(/\s+/g, " ").trim());
    const ligacao = tr.querySelector('a[href*="OpenDocument"]');
    if (!ligacao) {
      if (celulas.some(c => /^PROCESSO$/i.test(c))) cabecalho = celulas.map(c => c.toUpperCase());
      continue;
    }
    const href = ligacao.getAttribute("href").replace(/&amp;/g, "&").split("&Highlight")[0].split("?")[0];
    const m = /\/([a-z0-9]+)\.nsf\/([0-9a-f]{32})\/([0-9a-f]{32})/i.exec(href);
    if (!m) continue;
    const r = { base, id: m[3], url: `https://www.dgsi.pt/${m[1]}.nsf/${m[2]}/${m[3]}?OpenDocument`, data: "", processo: "", relator: "", descritores: [] };
    const pegar = nome => {
      if (!cabecalho) return "";
      const i = cabecalho.findIndex(c => c.startsWith(nome));
      return i >= 0 ? celulas[i] || "" : "";
    };
    r.data = dataDGSI(pegar("SESS") || celulas.find(c => /^\d{2}[-/]\d{2}[-/]\d{4}$/.test(c)) || "");
    r.processo = pegar("PROCESSO") || celulas.find(c => /\d/.test(c) && /[/.]/.test(c)) || "";
    r.relator = pegar("RELATOR");
    // Os descritores vêm separados por quebras de linha na célula própria.
    const iDesc = cabecalho ? cabecalho.findIndex(c => c.startsWith("DESCRITOR")) : -1;
    if (iDesc >= 0 && tr.cells[iDesc]) {
      r.descritores = tr.cells[iDesc].innerHTML.split(/<br\s*\/?>|\n/i).map(html2txt).filter(Boolean);
    }
    resultados.push(r);
  }
  return { total: total ? Number(total[2] || total[1]) : resultados.length, resultados };
}

// Pesquisa numa base. A DGSI devolve no máximo 500 documentos por pesquisa.
export async function pesquisarBase(base, consulta, { ordem = ORDEM.recentes, n = 40, inicio = 1 } = {}) {
  const b = BASES[base];
  const url = `https://www.dgsi.pt/${base}.nsf/${b.vista}?SearchView&Query=${encodeURIComponent(consulta)}&SearchOrder=${ordem}&Count=${n}` + (inicio > 1 ? `&Start=${inicio}` : "");
  const r = await ponte(url);
  if (r.estado === 404 && /Something Went Wrong/i.test(r.texto)) throw new Error("A DGSI recusou a forma da pesquisa.");
  if (!r.ok && r.estado !== 404) throw new Error(`A DGSI respondeu com o estado ${r.estado}.`);
  return lerTabelaResultados(r.texto, base);
}

// Pesquisa em várias bases, com limite de pedidos simultâneos para não sobrecarregar a DGSI.
export async function pesquisar(bases, consulta, opcoes = {}) {
  const res = await emParalelo(bases, 4, async b => ({ base: b, ...(await pesquisarBase(b, consulta, opcoes)) }));
  const lista = [];
  const porBase = {};
  const erros = [];
  for (const r of res) {
    if (!r || r.erro) { erros.push(r?.erro?.message || "erro"); continue; }
    porBase[r.base] = r.total;
    lista.push(...r.resultados);
  }
  // Retira duplicados (o mesmo acórdão pode aparecer duas vezes).
  const vistos = new Set();
  const unicos = lista.filter(r => (vistos.has(r.id) ? false : vistos.add(r.id)));
  return { resultados: unicos, porBase, erros };
}

// Lê um acórdão completo e devolve os campos e o texto dividido em parágrafos numerados.
export async function lerAcordao(url) {
  const r = await ponte(url);
  if (!r.ok) throw new Error(`Não foi possível abrir o acórdão (estado ${r.estado}).`);
  const doc = new DOMParser().parseFromString(r.texto, "text/html");
  const campos = {};
  const camposHtml = {};
  for (const tr of doc.querySelectorAll("tr")) {
    if (tr.cells.length < 2) continue;
    const rotulo = tr.cells[0].textContent.replace(/\s+/g, " ").replace(/:\s*$/, "").trim();
    if (!rotulo || rotulo.length > 60) continue;
    if (campos[rotulo]) continue;
    camposHtml[rotulo] = tr.cells[1].innerHTML;
    campos[rotulo] = tr.cells[1].textContent.replace(/ /g, " ").replace(/[ \t]+/g, " ").trim();
  }
  const titulo = doc.querySelector("title")?.textContent.trim() || "";
  const base = /\/([a-z0-9]+)\.nsf\//i.exec(url)?.[1] || "";
  const textoHtml = camposHtml["Decisão Texto Integral"] || camposHtml["Texto Integral"] || "";
  const sumarioHtml = camposHtml["Sumário"] || camposHtml["Sumário "] || "";
  const ac = {
    base, url, titulo,
    tribunal: BASES[base]?.nome || titulo.replace(/^Acórdão d[oa]s?\s+/i, ""),
    processo: campos["Processo"] || "",
    relator: campos["Relator"] || "",
    data: dataDGSI(campos["Data do Acordão"] || campos["Data do Acórdão"] || campos["Data da sentença"] || ""),
    votacao: campos["Votação"] || "",
    meio: campos["Meio Processual"] || "",
    decisao: campos["Decisão"] || "",
    seccao: campos["Nº Convencional"] && /SEC/i.test(campos["Nº Convencional"]) ? campos["Nº Convencional"] : (campos["Secção"] || campos["Tribunal"] || ""),
    descritores: (camposHtml["Descritores"] || "").split(/<br\s*\/?>|\n/i).map(h => html2txt(h)).filter(Boolean),
    legislacao: campos["Legislação Nacional"] || "",
    jurisprudenciaCitada: campos["Jurisprudência Nacional"] || "",
    tribunalRecorrido: campos["Tribunal Recurso"] || campos["Tribunal Recorrido"] || campos["Objecto"] || "",
    sumario: paragrafos(sumarioHtml),
    texto: paragrafos(textoHtml),
    textoIntegral: !!textoHtml && html2txt(textoHtml).length > 200,
    campos,
  };
  if (!ac.descritores.length && campos["Descritores"]) ac.descritores = campos["Descritores"].split(/\s{2,}|;/).filter(Boolean);
  return ac;
}

// Divide um bloco HTML em parágrafos, unindo as linhas partidas a meio da frase.
export function paragrafos(html) {
  if (!html) return [];
  const bruto = html
    .replace(/<\/(p|div|li|h\d|tr)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  const d = document.createElement("textarea");
  d.innerHTML = bruto;
  const linhas = d.value.replace(/ /g, " ").split("\n").map(l => l.replace(/[ \t]+/g, " ").trim());
  const blocos = [];
  let atual = "";
  for (const l of linhas) {
    if (!l) { if (atual) { blocos.push(atual); atual = ""; } continue; }
    if (!atual) { atual = l; continue; }
    const terminou = /[.:;!?»”)]$/.test(atual);
    const novoItem = /^([IVXLC]+\s*[-–.)]|\d+[.)º]|[a-z]\)|[-–•])\s/.test(l);
    if (terminou || novoItem) { blocos.push(atual); atual = l; }
    else atual += " " + l;
  }
  if (atual) blocos.push(atual);
  return blocos.filter(b => b.length > 1);
}

// Procura um processo pelo número, nas bases indicadas.
export async function procurarProcesso(numero, bases) {
  const consulta = `[PROCESSO] CONTAINS "${numero.replace(/"/g, "")}"`;
  const r = await pesquisar(bases, consulta, { ordem: ORDEM.recentes, n: 10 });
  const alvo = normalizar(numero).replace(/\s/g, "");
  r.resultados = r.resultados.filter(x => normalizar(x.processo).replace(/\s/g, "").includes(alvo));
  return r;
}

// Sugere as bases a partir do sufixo do número de processo (ex.: .S1 = STJ, .L1 = Relação de Lisboa).
export function basesPorProcesso(numero) {
  const n = numero.toUpperCase();
  const bases = new Set();
  if (/\.S\d/.test(n)) bases.add("jstj");
  if (/\.L\d/.test(n)) bases.add("jtrl");
  if (/\.P\d/.test(n)) bases.add("jtrp");
  if (/\.C\d/.test(n)) bases.add("jtrc");
  if (/\.G\d/.test(n)) bases.add("jtrg");
  if (/\.E\d/.test(n)) bases.add("jtre");
  if (/BE[A-Z]{2,4}|BC[A-Z]{2,4}|BU[A-Z]{2,4}/.test(n)) ["jsta", "jtca", "jtcn"].forEach(b => bases.add(b));
  if (!bases.size) GRUPOS_BASES.todas.forEach(b => bases.add(b));
  return [...bases];
}
