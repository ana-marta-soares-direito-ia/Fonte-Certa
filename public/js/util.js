// Utilitários comuns.
export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

export function el(tag, atributos = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(atributos || {})) {
    if (v === false || v == null) continue;
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, "");
    else e.setAttribute(k, v);
  }
  for (const f of filhos.flat(Infinity)) {
    if (f == null || f === false) continue;
    e.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return e;
}

export const escapar = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Normaliza para comparação: minúsculas, sem acentos, espaços simples.
export function normalizar(s) {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[º°ª]/g, "").replace(/[^a-z0-9/.\- ]+/g, " ").replace(/\s+/g, " ").trim();
}

export const PALAVRAS_VAZIAS = new Set(("a o os as um uma uns umas de do da dos das d em no na nos nas num numa por pelo pela pelos pelas " +
  "para pra com sem sob sobre entre ate desde contra e ou nem mas que se ja nao sim mais menos muito pouco ser estar ter haver " +
  "foi era sao e esta este esse essa isto isso aquilo ao aos à às lhe lhes me te nos vos seu sua seus suas meu minha qual quais " +
  "quando onde como porque pois qualquer quaisquer caso questao pode podem deve devem quem cujo cuja tambem so apenas ainda " +
  "sido sendo tem teve tinha houve ha havia faz fazer feito outro outra outros outras mesmo mesma todo toda todos todas cada " +
  "jurisprudencia acordao acordaos acordaos sentenca tribunal tribunais lei leis artigo artigos sobre relativamente aplicavel " +
  "quero saber procuro preciso existe existem direito").split(" "));

export function palavrasChave(texto, max = 8) {
  const vistos = new Set();
  const lista = [];
  for (const p of normalizar(texto).split(" ")) {
    if (p.length < 3 || PALAVRAS_VAZIAS.has(p) || /^\d+$/.test(p) || vistos.has(p)) continue;
    vistos.add(p); lista.push(p);
    if (lista.length >= max) break;
  }
  return lista;
}

// Radical simples para pesquisa com asterisco na DGSI.
export function radical(p) {
  if (p.length <= 5) return p;
  const corte = p.length >= 10 ? p.length - 3 : p.length >= 7 ? p.length - 2 : p.length - 1;
  return p.slice(0, Math.max(5, corte));
}

export function dataPT(iso) {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return d && m ? `${d}/${m}/${a}` : a;
}

export function hoje() { return new Date().toISOString().slice(0, 10); }

export const espera = ms => new Promise(r => setTimeout(r, ms));

export function aviso(texto, tipo = "info", ms = 5000) {
  const zona = document.getElementById("avisos");
  if (!zona) return;
  const a = el("div", { class: `aviso aviso-${tipo}` }, texto);
  zona.append(a);
  setTimeout(() => a.classList.add("a-sair"), ms);
  setTimeout(() => a.remove(), ms + 400);
}

// Armazenamento local protegido (o navegador pode recusar o acesso).
export const local = {
  ler(chave, omissao = null) {
    try { const v = localStorage.getItem("fc." + chave); return v == null ? omissao : JSON.parse(v); }
    catch { return omissao; }
  },
  gravar(chave, valor) {
    try { localStorage.setItem("fc." + chave, JSON.stringify(valor)); return true; } catch { return false; }
  },
  apagar(chave) { try { localStorage.removeItem("fc." + chave); } catch {} },
  limparTudo() {
    try { Object.keys(localStorage).filter(k => k.startsWith("fc.")).forEach(k => localStorage.removeItem(k)); } catch {}
  },
};

// Limita o número de tarefas simultâneas.
export async function emParalelo(itens, limite, fn) {
  const resultados = new Array(itens.length);
  let i = 0;
  const trabalhadores = Array.from({ length: Math.min(limite, itens.length) }, async () => {
    while (i < itens.length) {
      const atual = i++;
      try { resultados[atual] = await fn(itens[atual], atual); }
      catch (e) { resultados[atual] = { erro: e }; }
    }
  });
  await Promise.all(trabalhadores);
  return resultados;
}

export function plural(n, um, varios) { return `${n} ${n === 1 ? um : varios}`; }

// Neutraliza as diferenças entre a grafia anterior e posterior ao Acordo Ortográfico (acção/ação, selecção/seleção).
export const semAO = s => s.replace(/cc(?=[aoi])/g, "c").replace(/c(?=t)/g, "").replace(/p(?=[ct])/g, "");
