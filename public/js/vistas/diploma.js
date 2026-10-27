import { el, aviso, dataPT, normalizar } from "../util.js";
import { lerCaso, guardados } from "../estado.js";
import { carregarPrincipais, carregarOutros, versoes, versaoNaData, textoDiploma, artigos, encontrarArtigo, designacao, ESTADOS, ligacaoOficial } from "../fontes/legislacao.js";
import { ligarDiploma } from "../rotas.js";

export async function vistaDiploma(raiz, params) {
  const caminho = params.get("p");
  const pedidoArtigo = params.get("art") || "";
  const caso = lerCaso();
  const dataPedida = params.get("data") || caso?.dataFactos || "";
  raiz.replaceChildren(el("p", { class: "a-carregar" }, "A abrir o diploma…"));
  let meta = (await carregarPrincipais()).find(r => r.p === caminho);
  if (!meta) meta = (await carregarOutros()).find(r => r.p === caminho);
  if (!meta) { raiz.replaceChildren(el("p", { class: "erro" }, "Diploma não encontrado no índice do Diário da República.")); return; }
  document.title = `${meta.c || designacao(meta)} · Fonte Certa`;

  let lista = [];
  try { lista = await versoes(caminho); } catch (e) { aviso(e.message, "erro", 8000); }
  const versao = dataPedida && lista.length ? versaoNaData(lista, dataPedida) : lista[0] || null;
  let md;
  try {
    md = await textoDiploma(caminho, dataPedida && versao ? versao.sha : "main");
  } catch (e) {
    raiz.replaceChildren(el("div", { class: "vazio" }, el("p", {}, e.message), el("p", {}, el("a", { href: ligacaoOficial(meta), target: "_blank", rel: "noopener" }, "Abrir no Diário da República"))));
    return;
  }
  const arts = artigos(md);
  const alvoPedido = pedidoArtigo ? encontrarArtigo(arts, pedidoArtigo, /^c[oó]digo|constitui/i.test(meta.c || meta.t)) : null;
  const id = "dip:" + caminho;

  const seletorData = el("input", { type: "date", value: dataPedida, "aria-label": "Data de referência", onchange: e => { location.hash = ligarDiploma(caminho, pedidoArtigo, e.target.value); } });
  const filtro = el("input", { type: "search", placeholder: "Procurar artigo (n.º ou palavra)", "aria-label": "Procurar artigo", oninput: () => filtrar() });
  const listaArtigos = el("ol", { class: "artigos" });

  const avisoVersao = !lista.length ? el("p", { class: "nota" }, "Não foi possível obter o histórico de versões; é apresentada a versão em vigor.")
    : dataPedida && !versao ? el("p", { class: "erro" }, `O diploma ainda não estava em vigor a ${dataPT(dataPedida)}. É apresentada a versão mais antiga disponível.`)
    : dataPedida ? el("p", { class: "versao-aplicavel" }, `Versão em vigor a ${dataPT(dataPedida)}: redacção iniciada em ${dataPT(versao.data)}.`, lista[0] && versao.sha !== lista[0].sha ? el("span", { class: "alterado" }, ` Este diploma foi alterado depois dessa data (última versão: ${dataPT(lista[0].data)}).`) : null)
    : el("p", { class: "versao-aplicavel" }, `Versão em vigor, actualizada em ${dataPT(lista[0].data)}.`);

  const botaoGuardar = el("button", { type: "button", class: "botao botao-discreto", onclick: () => {
    guardados.juntar({ id: id + (pedidoArtigo ? "#" + pedidoArtigo : ""), tipo: "diploma", caminho, artigo: pedidoArtigo, data: dataPedida, titulo: `${meta.c || designacao(meta)}${pedidoArtigo ? `, art. ${pedidoArtigo}.º` : ""}`, resumo: meta.r });
    aviso("Guardado neste navegador.", "sucesso");
  } }, "Guardar");

  raiz.replaceChildren(el("div", { class: "pagina-diploma" },
    el("p", { class: "voltar" }, el("a", { href: "#/", onclick: e => { if (history.length > 1) { e.preventDefault(); history.back(); } } }, "Voltar")),
    el("header", { class: "cabecalho-diploma" },
      el("p", { class: "tribunal-extenso" }, designacao(meta)),
      el("h1", {}, meta.c ? meta.c.replace(/\s*-\s*[A-Z]{2,6}$/, "") : meta.t),
      el("p", { class: "estado-diploma" },
        el("span", { class: `etiqueta ${meta.s === "in_force" ? "em-vigor" : "revogado"}` }, ESTADOS[meta.s] || "Estado não indicado"),
        meta.v ? el("span", { class: "etiqueta" }, "Versão consolidada") : null,
        el("span", { class: "data" }, `Publicado em ${dataPT(meta.d)}`)),
      meta.r && el("p", { class: "sumario-diploma" }, meta.r),
      el("div", { class: "controlos-diploma" },
        el("label", {}, "Versão em vigor em", seletorData),
        dataPedida && el("button", { type: "button", class: "ligacao-texto", onclick: () => { location.hash = ligarDiploma(caminho, pedidoArtigo, ""); } }, "ver versão actual")),
      avisoVersao,
      el("div", { class: "accoes-acordao" },
        el("a", { class: "botao", href: ligacaoOficial(meta), target: "_blank", rel: "noopener" }, "Abrir no Diário da República"),
        botaoGuardar)),
    lista.length > 1 ? el("details", { class: "historico" }, el("summary", {}, `Histórico: ${lista.length} versões`),
      el("ol", { class: "lista-versoes" }, lista.map(v => el("li", { class: versao && v.sha === versao.sha ? "atual" : "" },
        el("a", { href: ligarDiploma(caminho, pedidoArtigo, v.data) }, dataPT(v.data)))))) : null,
    arts.length ? el("div", { class: "barra-artigos" }, filtro, el("span", { class: "nota" }, `${arts.length} artigos`)) : el("p", { class: "nota" }, "Texto sem divisão em artigos."),
    listaArtigos,
    !arts.length && el("pre", { class: "texto-corrido" }, md.replace(/^---[\s\S]*?\n---\n/, "").slice(0, 60000)),
  ));

  function desenhar(itens) {
    listaArtigos.replaceChildren(...itens.map(a => el("li", { id: `art-${a.indice}`, class: "artigo" + (alvoPedido && a.indice === alvoPedido.indice ? " pedido" : "") },
      el("h2", {}, a.rotulo, a.epigrafe && el("span", { class: "epigrafe" }, a.epigrafe)),
      a.contexto && el("p", { class: "contexto" }, a.contexto),
      ...a.texto.split(/\n{2,}/).map(t => el("p", {}, t.replace(/\n/g, " "))))));
  }
  function filtrar() {
    const q = normalizar(filtro.value);
    if (!q) return desenhar(arts);
    const porNumero = arts.filter(a => normalizar(a.numero) === q.replace(/\.$/, ""));
    desenhar(porNumero.length ? porNumero : arts.filter(a => normalizar(`${a.epigrafe} ${a.texto}`).includes(q)));
  }
  desenhar(arts);
  if (pedidoArtigo) {
    const alvo = alvoPedido;
    if (alvo) setTimeout(() => document.getElementById(`art-${alvo.indice}`)?.scrollIntoView({ block: "start" }), 60);
    else aviso(`O artigo ${pedidoArtigo}.º não existe nesta versão do diploma.`, "erro", 7000);
  }
}
