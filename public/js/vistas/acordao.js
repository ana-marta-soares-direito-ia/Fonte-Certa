import { el, $, aviso, dataPT, escapar, normalizar } from "../util.js";
import { estado, lerCaso, casoPreenchido, guardados } from "../estado.js";
import { lerAcordao, BASES } from "../fontes/dgsi.js";
import { parecerAcordao } from "../ia/analise.js";
import { temIA as temChave } from "../ia/gemini.js";
import { repor } from "../ia/anonimizar.js";

export function citacao(ac) {
  const b = BASES[ac.base];
  const d = ac.data ? ac.data.split("-").reverse().join(".") : "";
  const relator = ac.relator ? `, relator ${ac.relator.toLowerCase().replace(/(^|\s)\S/g, s => s.toUpperCase()).replace(/\b(De|Da|Do|Dos|Das|E)\b/g, s => s.toLowerCase())}` : "";
  return `Ac. ${b ? (b.curto === "TC" ? "do TC" : `do ${b.curto}`) : ""} de ${d}, proc. ${ac.processo}${relator}, disponível em www.dgsi.pt`.replace(/\s+/g, " ");
}

export async function vistaAcordao(raiz, params) {
  const url = params.get("u");
  if (!url || !/^https:\/\/www\.dgsi\.pt\//.test(url)) { raiz.replaceChildren(el("p", { class: "erro" }, "Endereço de acórdão inválido.")); return; }
  raiz.replaceChildren(el("p", { class: "a-carregar" }, "A abrir o acórdão na DGSI…"));
  let ac = estado.acordaos.get(url);
  try {
    if (!ac) { ac = await lerAcordao(url); estado.acordaos.set(url, ac); }
  } catch (e) {
    raiz.replaceChildren(el("div", { class: "vazio" }, el("p", {}, e.message), el("p", {}, el("a", { href: url, target: "_blank", rel: "noopener" }, "Abrir directamente na DGSI"))));
    return;
  }
  document.title = `${BASES[ac.base]?.curto || ""} ${dataPT(ac.data)}, proc. ${ac.processo} | Fonte Certa Ana Marta Soares`;
  const caso = lerCaso();
  const id = "ac:" + url;
  const leitor = el("article", { class: "leitor" });
  const lateral = el("aside", { class: "lateral-parecer", "aria-label": "Análise face ao caso" });

  const botaoGuardar = el("button", { type: "button", class: "botao botao-discreto", "aria-pressed": guardados.tem(id) ? "true" : "false", onclick: () => {
    if (guardados.tem(id)) { guardados.retirar(id); botaoGuardar.setAttribute("aria-pressed", "false"); botaoGuardar.textContent = "Guardar"; aviso("Retirado dos guardados."); }
    else { guardados.juntar({ id, tipo: "acordao", url, titulo: `${BASES[ac.base]?.curto || ac.tribunal}, ${dataPT(ac.data)}, proc. ${ac.processo}`, resumo: ac.sumario.join(" ").slice(0, 300), citacao: citacao(ac) }); botaoGuardar.setAttribute("aria-pressed", "true"); botaoGuardar.textContent = "Guardado"; aviso("Acórdão guardado neste navegador.", "sucesso"); }
  } }, guardados.tem(id) ? "Guardado" : "Guardar");

  leitor.append(
    el("p", { class: "voltar" }, el("a", { href: "#/", onclick: e => { if (history.length > 1) { e.preventDefault(); history.back(); } } }, "Voltar aos resultados")),
    el("header", { class: "cabecalho-acordao" },
      el("p", { class: "tribunal-extenso" }, ac.tribunal),
      el("h1", {}, `Acórdão de ${dataPT(ac.data)}`),
      el("dl", { class: "metadados" },
        campo("Processo", ac.processo), campo("Relator", ac.relator), campo("Votação", ac.votacao),
        campo("Meio processual", ac.meio), campo("Decisão", ac.decisao), campo("Secção", ac.seccao), campo("Tribunal recorrido", ac.tribunalRecorrido)),
      ac.descritores.length ? el("p", { class: "descritores" }, ac.descritores.join(" | ")) : null,
      el("div", { class: "accoes-acordao" },
        el("a", { class: "botao", href: url, target: "_blank", rel: "noopener" }, "Abrir na DGSI"),
        el("button", { type: "button", class: "botao botao-discreto", onclick: async () => { try { await navigator.clipboard.writeText(citacao(ac)); aviso("Citação copiada: " + citacao(ac), "sucesso", 6000); } catch { aviso(citacao(ac), "info", 10000); } } }, "Copiar citação"),
        botaoGuardar)),
  );
  if (ac.sumario.length) {
    leitor.append(el("section", { class: "bloco-sumario" }, el("h2", {}, "Sumário"),
      el("ol", { class: "paragrafos sumario" }, ac.sumario.map((p, i) => el("li", { id: `S${i + 1}`, "data-ref": `S${i + 1}` }, el("span", { class: "num" }, `S${i + 1}`), el("p", {}, p))))));
  }
  if (ac.texto.length) {
    leitor.append(el("section", { class: "bloco-texto" }, el("h2", {}, "Texto integral"),
      el("ol", { class: "paragrafos" }, ac.texto.map((p, i) => el("li", { id: `P${i + 1}`, "data-ref": `§${i + 1}` }, el("span", { class: "num" }, `§ ${i + 1}`), el("p", {}, p))))));
  } else {
    leitor.append(el("p", { class: "nota" }, "A DGSI não disponibiliza o texto integral deste acórdão; a análise usa apenas o sumário."));
  }
  if (ac.legislacao) leitor.append(el("section", {}, el("h2", {}, "Legislação citada"), el("p", { class: "nota-campo" }, ac.legislacao)));
  if (ac.jurisprudenciaCitada) leitor.append(el("section", {}, el("h2", {}, "Jurisprudência citada"), el("p", { class: "nota-campo" }, ac.jurisprudenciaCitada)));

  raiz.replaceChildren(el("div", { class: "pagina-acordao" }, leitor, lateral));
  desenharLateral(lateral, ac, caso);
}

function campo(rotulo, valor) {
  if (!valor) return null;
  return el("div", {}, el("dt", {}, rotulo), el("dd", {}, valor));
}

function desenharLateral(lateral, ac, caso) {
  const existente = estado.pareceres.get(ac.url);
  if (existente) { mostrarParecer(lateral, ac, existente, caso); return; }
  if (!casoPreenchido(caso)) {
    lateral.replaceChildren(el("div", { class: "cartao-lateral" }, el("h2", {}, "Este acórdão serve o seu caso?"),
      el("p", {}, "Preencha a ficha do caso na página de pesquisa para obter a análise: semelhança dos factos, onde o acórdão o favorece, onde o prejudica e como o afastar se for invocado contra si."),
      el("a", { class: "botao", href: "#/" }, "Preencher a ficha do caso")));
    return;
  }
  const botao = el("button", { type: "button", class: "botao botao-principal" }, "Analisar face ao caso");
  botao.addEventListener("click", async () => {
    botao.disabled = true; botao.textContent = "A analisar o acórdão…";
    try {
      const p = await parecerAcordao({ texto: caso.anonimizado, posicao: caso.posicao, pretensao: caso.pretensao }, ac);
      estado.pareceres.set(ac.url, p);
      mostrarParecer(lateral, ac, p, caso);
    } catch (e) {
      aviso(e.message, "erro", 9000);
      botao.disabled = false; botao.textContent = "Analisar face ao caso";
    }
  });
  lateral.replaceChildren(el("div", { class: "cartao-lateral" }, el("h2", {}, "Análise face ao caso"),
    el("p", { class: "caso-linha" }, [caso.posicao, caso.meio].filter(Boolean).join(", ")),
    el("p", {}, "Só é enviado o texto anonimizado da ficha do caso e o texto público do acórdão."),
    botao));
}

function mostrarParecer(lateral, ac, p, caso) {
  const rep = t => repor(t, caso?.correspondencias);
  const ponto = (item, tipo) => el("li", { class: `ponto ponto-${tipo}` },
    el("p", {}, rep(item.ponto)),
    el("blockquote", {}, el("p", {}, "“", item.trecho, "”"),
      el("button", { type: "button", class: "ref", onclick: () => irPara(item, ac) }, `${item.ref.startsWith("S") ? "Sumário, " : ""}${item.ref.replace(/^§/, "§ ")}`)));
  const classe = { "favorável": "favoravel", "neutro": "neutro", "desfavorável": "desfavoravel" }[p.classificacao];
  lateral.replaceChildren(el("div", { class: "cartao-lateral parecer" },
    el("p", { class: `classificacao ${classe}` }, `Para o seu caso: ${p.classificacao}`),
    p.sintese && el("p", { class: "sintese" }, rep(p.sintese)),
    el("h3", {}, `Semelhança dos factos: ${p.semelhanca.grau}`),
    (p.semelhanca.coincidencias || []).length ? el("ul", { class: "lista-simples" }, p.semelhanca.coincidencias.map(x => el("li", {}, rep(x)))) : null,
    (p.semelhanca.diferencas || []).length ? el("div", {}, el("p", { class: "subtitulo" }, "Diferenças"), el("ul", { class: "lista-simples" }, p.semelhanca.diferencas.map(x => el("li", {}, rep(x))))) : null,
    el("h3", {}, "Onde o favorece"),
    p.favoravel.length ? el("ul", { class: "pontos" }, p.favoravel.map(i => ponto(i, "favoravel"))) : el("p", { class: "nota" }, "Não foram encontrados trechos favoráveis ao seu caso."),
    el("h3", {}, "Onde o prejudica"),
    p.desfavoravel.length ? el("ul", { class: "pontos" }, p.desfavoravel.map(i => ponto(i, "desfavoravel"))) : el("p", { class: "nota" }, "Não foram encontrados trechos desfavoráveis ao seu caso."),
    p.distincoes.length ? el("div", {}, el("h3", {}, "Como afastá-lo, se for invocado contra si"), el("ul", { class: "lista-simples" }, p.distincoes.map(x => el("li", {}, rep(x))))) : null,
    el("p", { class: "verificacao" }, `Cada trecho foi confirmado, palavra por palavra, no texto do acórdão.${p.descartados ? ` ${p.descartados === 1 ? "Foi descartado 1 ponto" : `Foram descartados ${p.descartados} pontos`} cujo trecho não constava do texto.` : ""}`),
  ));
  marcarTrechos(ac, p);
}

function marcarTrechos(ac, p) {
  for (const item of [...p.favoravel, ...p.desfavoravel]) {
    const li = document.getElementById(item.tipo === "sumario" ? `S${item.indice + 1}` : `P${item.indice + 1}`);
    if (!li) continue;
    li.classList.add(item.tipo === "sumario" ? "citado" : "citado", p.favoravel.includes(item) ? "citado-favoravel" : "citado-desfavoravel");
    const par = li.querySelector("p");
    const original = par.textContent;
    const pos = localizar(original, item.trecho);
    if (pos) par.innerHTML = escapar(original.slice(0, pos[0])) + `<mark class="${p.favoravel.includes(item) ? "marca-favoravel" : "marca-desfavoravel"}">` + escapar(original.slice(pos[0], pos[1])) + "</mark>" + escapar(original.slice(pos[1]));
  }
}

// Localiza o trecho no parágrafo, tolerando diferenças de espaços, hífenes, pontuação e acentuação.
const limparCar = ch => normalizar(ch.normalize("NFKC").replace(/[\u2010-\u2015\u2212.\-]/g, " "));
function localizar(texto, trecho) {
  const mapa = [];
  let norm = "";
  for (let i = 0; i < texto.length; i++) {
    const c = limparCar(texto[i]);
    if (!c) { if (norm && norm[norm.length - 1] !== " ") { norm += " "; mapa.push(i); } continue; }
    for (const ch of c) { norm += ch; mapa.push(i); }
  }
  const alvo = trecho.split("").map(limparCar).map(c => c || " ").join("").replace(/\s+/g, " ").trim();
  let i = norm.indexOf(alvo);
  let comprimento = alvo.length;
  if (i < 0) {
    // Marca do início ao fim do trecho quando só a pontuação interior difere.
    const pal = alvo.split(" ");
    const ini = pal.slice(0, 5).join(" "), fim = pal.slice(-5).join(" ");
    const a = norm.indexOf(ini), b = a >= 0 ? norm.indexOf(fim, a) : -1;
    if (a < 0 || b < 0) return null;
    i = a; comprimento = b + fim.length - a;
  }
  return [mapa[i], (mapa[i + comprimento - 1] ?? texto.length - 1) + 1];
}

function irPara(item, ac) {
  const li = document.getElementById(item.tipo === "sumario" ? `S${item.indice + 1}` : `P${item.indice + 1}`);
  if (!li) return;
  li.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  li.classList.remove("destaque"); void li.offsetWidth; li.classList.add("destaque");
  li.setAttribute("tabindex", "-1"); li.focus({ preventScroll: true });
}
