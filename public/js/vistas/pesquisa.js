import { el, $, aviso, dataPT, plural, normalizar } from "../util.js";
import { estado, lerCaso, gravarCaso, apagarCaso, casoPreenchido } from "../estado.js";
import { pesquisarTudo } from "../motor.js";
import { BASES, GRUPOS_BASES } from "../fontes/dgsi.js";
import { designacao, nomeTipo, ESTADOS } from "../fontes/legislacao.js";
import { anonimizar, resumoAnonimizacao } from "../ia/anonimizar.js";
import { temChave } from "../ia/gemini.js";
import { mapaCorrentes } from "../ia/analise.js";
import { ligarAcordao, ligarDiploma } from "../rotas.js";

const POSICOES = ["Autor", "Réu", "Recorrente", "Recorrido", "Arguido", "Assistente", "Ofendido", "Requerente", "Requerido",
  "Exequente", "Executado", "Trabalhador", "Empregador", "Entidade adjudicante", "Concorrente", "Administração", "Particular", "Outra"];

const EXEMPLOS = [
  "Despedimento por extinção do posto de trabalho sem critérios de selecção entre trabalhadores com funções idênticas",
  "Responsabilidade do empreiteiro por defeitos da obra denunciados depois da recepção provisória",
  "Exclusão de proposta por preço anormalmente baixo sem audiência prévia do concorrente",
  "Abuso do direito na resolução do contrato de arrendamento por falta de pagamento de rendas",
];

export function vistaPesquisa(raiz) {
  const caso = lerCaso();
  const ultima = estado.ultimaPesquisa;
  const campo = el("textarea", { id: "pergunta", class: "pergunta", rows: 2, maxlength: 600, placeholder: "Escreva a questão jurídica, como a explicaria a um colega", "aria-label": "Questão jurídica" });
  if (ultima) campo.value = ultima.pergunta;
  campo.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });

  const seletorBases = el("select", { id: "bases", "aria-label": "Tribunais a pesquisar" },
    el("option", { value: "" }, "Escolha automática dos tribunais"),
    el("option", { value: "comum" }, "Tribunais judiciais (STJ e Relações)"),
    el("option", { value: "administrativa" }, "Tribunais administrativos e fiscais (STA e TCA)"),
    el("option", { value: "todas" }, "Todos os tribunais superiores"),
    ...Object.entries(BASES).map(([k, b]) => el("option", { value: k }, b.nome)));

  const form = el("form", { class: "caixa-pesquisa", role: "search", onsubmit: async e => { e.preventDefault(); await executar(); } },
    el("label", { for: "pergunta", class: "rotulo-pergunta" }, "Que questão jurídica quer resolver?"),
    campo,
    el("div", { class: "pesquisa-accoes" },
      seletorBases,
      el("button", { type: "submit", class: "botao botao-principal", id: "botao-pesquisar" }, "Pesquisar"),
    ),
  );

  const zonaCaso = el("section", { class: "ficha-caso", "aria-labelledby": "titulo-caso" });
  const zonaEstado = el("div", { class: "progresso", role: "status", "aria-live": "polite" });
  const zonaResultados = el("section", { class: "resultados", "aria-label": "Resultados" });

  raiz.replaceChildren(
    el("div", { class: "pagina-pesquisa" },
      el("div", { class: "coluna-pesquisa" },
        !ultima && el("div", { class: "abertura" },
          el("h1", {}, "A jurisprudência e a lei aplicáveis, tiradas das fontes oficiais."),
          el("p", {}, "Cada acórdão e cada artigo apresentados existem e têm ligação para a publicação oficial. Com a ficha do caso, a Fonte Certa indica onde cada acórdão o favorece e onde o prejudica, sempre com o parágrafo que o demonstra.")),
        form,
        zonaCaso,
        !ultima && el("div", { class: "exemplos" }, el("p", { class: "exemplos-titulo" }, "Por exemplo"),
          el("ul", {}, EXEMPLOS.map(t => el("li", {}, el("button", { type: "button", class: "ligacao-texto", onclick: () => { campo.value = t; form.requestSubmit(); } }, t))))),
        zonaEstado,
      ),
      zonaResultados,
    ),
  );
  desenharCaso(zonaCaso);
  if (ultima) desenharResultados(zonaResultados, ultima);

  async function executar() {
    const pergunta = campo.value.trim();
    if (pergunta.length < 8) { aviso("Descreva a questão com um pouco mais de detalhe.", "erro"); campo.focus(); return; }
    const botao = $("#botao-pesquisar");
    botao.disabled = true; botao.textContent = "A pesquisar…";
    zonaResultados.replaceChildren();
    const passos = el("ol", { class: "passos" });
    zonaEstado.replaceChildren(passos);
    const marcar = texto => {
      passos.querySelectorAll("li").forEach(li => li.classList.add("feito"));
      passos.append(el("li", { class: "em-curso" }, texto));
    };
    try {
      const v = seletorBases.value;
      const bases = !v ? null : GRUPOS_BASES[v] || [v];
      const c = lerCaso();
      const res = await pesquisarTudo(pergunta, { caso: casoPreenchido(c) ? { texto: c.anonimizado } : null, bases, progresso: marcar });
      estado.ultimaPesquisa = res;
      zonaEstado.replaceChildren();
      document.querySelector(".abertura")?.remove();
      document.querySelector(".exemplos")?.remove();
      desenharResultados(zonaResultados, res);
      zonaResultados.querySelector("h2")?.focus();
    } catch (e) {
      zonaEstado.replaceChildren(el("p", { class: "erro" }, "A pesquisa não foi concluída: ", e.message));
    } finally {
      botao.disabled = false; botao.textContent = "Pesquisar";
    }
  }
}

// ---------- Ficha do caso ----------

function desenharCaso(zona) {
  const caso = lerCaso();
  if (casoPreenchido(caso) && !zona.dataset.editar) {
    zona.replaceChildren(
      el("div", { class: "caso-resumo" },
        el("h2", { id: "titulo-caso" }, "Ficha do caso"),
        el("p", { class: "caso-linha" }, [caso.posicao, caso.meio, caso.instancia, caso.dataFactos && `factos de ${dataPT(caso.dataFactos)}`].filter(Boolean).join(", ")),
        el("p", { class: "caso-factos" }, caso.anonimizado.slice(0, 260) + (caso.anonimizado.length > 260 ? "…" : "")),
        el("div", { class: "caso-accoes" },
          el("button", { type: "button", class: "botao botao-discreto", onclick: () => { zona.dataset.editar = "1"; desenharCaso(zona); } }, "Editar"),
          el("button", { type: "button", class: "botao botao-discreto", onclick: () => { apagarCaso(); desenharCaso(zona); aviso("A ficha do caso foi apagada."); } }, "Apagar")),
      ));
    return;
  }
  const aberto = !!zona.dataset.editar;
  const det = el("details", { class: "caso-detalhes", open: aberto });
  const c = caso || {};
  const posicao = el("select", { id: "c-posicao" }, el("option", { value: "" }, "Escolha"), POSICOES.map(p => el("option", { value: p, selected: c.posicao === p }, p)));
  const meio = el("input", { id: "c-meio", type: "text", value: c.meio || "", placeholder: "Ex.: acção de impugnação de despedimento" });
  const instancia = el("select", { id: "c-instancia" }, ["", "1.ª instância", "Recurso para a Relação ou TCA", "Recurso para o STJ ou STA"].map(v => el("option", { value: v, selected: c.instancia === v }, v || "Escolha")));
  const data = el("input", { id: "c-data", type: "date", value: c.dataFactos || "" });
  const factos = el("textarea", { id: "c-factos", rows: 6, placeholder: "Descreva os factos essenciais. Pode escrever nomes e números: antes de qualquer análise, são substituídos por marcadores." }, c.factosOriginais || "");
  const pretensao = el("input", { id: "c-pretensao", type: "text", value: c.pretensao || "", placeholder: "Ex.: declaração de ilicitude do despedimento e reintegração" });
  const previa = el("div", { class: "previa-anonimizacao" });

  const formCaso = el("form", { class: "form-caso", onsubmit: e => {
    e.preventDefault();
    if (factos.value.trim().length < 20) { aviso("Descreva os factos com um pouco mais de detalhe.", "erro"); return; }
    const a = anonimizar(`${factos.value.trim()}\nPretensão: ${pretensao.value.trim()}`);
    previa.replaceChildren(
      el("h3", {}, "Texto que será usado na análise"),
      el("p", { class: "nota" }, a.correspondencias.length ? `Foram substituídos ${resumoAnonimizacao(a.correspondencias)}. Reveja e corrija o texto antes de confirmar; nada é enviado sem a sua confirmação.` : "Não foram detectados nomes nem números identificativos. Reveja o texto antes de confirmar."),
      el("textarea", { id: "c-anonimizado", rows: 7 }, a.texto),
      el("div", { class: "caso-accoes" },
        el("button", { type: "button", class: "botao botao-principal", onclick: () => {
          gravarCaso({ posicao: posicao.value, meio: meio.value.trim(), instancia: instancia.value, dataFactos: data.value, pretensao: pretensao.value.trim(),
            factosOriginais: factos.value.trim(), anonimizado: $("#c-anonimizado").value.trim(), correspondencias: a.correspondencias });
          delete zona.dataset.editar;
          desenharCaso(zona);
          aviso("Ficha do caso confirmada. Pode agora analisar cada acórdão face ao caso.", "sucesso");
        } }, "Confirmar texto"),
        el("button", { type: "button", class: "botao botao-discreto", onclick: () => previa.replaceChildren() }, "Voltar a editar")));
    previa.querySelector("textarea").focus();
  } },
    el("div", { class: "grelha-campos" },
      el("label", {}, "Posição processual", posicao),
      el("label", {}, "Instância", instancia),
      el("label", { class: "largo" }, "Tipo de acção ou procedimento", meio),
      el("label", {}, "Data dos factos", data, el("span", { class: "ajuda" }, "Define a versão da lei a aplicar.")),
      el("label", { class: "largo" }, "Factos essenciais", factos),
      el("label", { class: "largo" }, "Pretensão", pretensao)),
    el("div", { class: "caso-accoes" },
      el("button", { type: "submit", class: "botao" }, "Preparar ficha"),
      aberto && el("button", { type: "button", class: "botao botao-discreto", onclick: () => { delete zona.dataset.editar; desenharCaso(zona); } }, "Cancelar")),
    previa);
  det.append(el("summary", { id: "titulo-caso" }, el("span", { class: "caso-titulo" }, "Ficha do caso"), el("span", { class: "caso-sub" }, "opcional, para saber onde cada acórdão o favorece")), formCaso);
  zona.replaceChildren(det);
}

// ---------- Resultados ----------

function desenharResultados(zona, res) {
  const separadores = [
    { id: "juris", nome: "Jurisprudência", n: res.juris.length },
    { id: "leg", nome: "Legislação", n: res.legislacao.length + res.normas.length },
    { id: "dr", nome: "Diário da República", n: res.recentes.length },
  ];
  const painel = el("div", { class: "painel-resultados" });
  const lista = el("div", { role: "tablist", class: "separadores", "aria-label": "Tipo de resultado" },
    separadores.map((s, i) => el("button", { role: "tab", id: `sep-${s.id}`, "aria-selected": i === 0 ? "true" : "false", "aria-controls": "painel-resultados", tabindex: i === 0 ? "0" : "-1",
      onclick: e => escolher(s.id, e.currentTarget),
      onkeydown: e => {
        const botoes = [...lista.children]; const i = botoes.indexOf(e.currentTarget);
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") { const n = botoes[(i + (e.key === "ArrowRight" ? 1 : -1) + botoes.length) % botoes.length]; n.focus(); n.click(); }
      } }, s.nome, el("span", { class: "contagem" }, String(s.n)))));
  painel.id = "painel-resultados";
  painel.setAttribute("role", "tabpanel");

  zona.replaceChildren(...[
    el("h2", { class: "titulo-resultados", tabindex: "-1" }, res.plano?.questao || res.pergunta),
    res.alertas.length ? blocoAlertas(res.alertas) : null,
    lista, painel].filter(Boolean));
  escolher("juris", lista.children[0]);

  function escolher(id, botao) {
    [...lista.children].forEach(b => { const s = b === botao; b.setAttribute("aria-selected", s ? "true" : "false"); b.tabIndex = s ? 0 : -1; });
    painel.setAttribute("aria-labelledby", botao.id);
    if (id === "juris") painel.replaceChildren(...listaJuris(res));
    if (id === "leg") painel.replaceChildren(...listaLegislacao(res));
    if (id === "dr") painel.replaceChildren(...listaDR(res));
  }
}

function blocoAlertas(alertas) {
  return el("aside", { class: "alertas", "aria-label": "Jurisprudência obrigatória ou uniformizada" },
    el("h3", {}, "Publicado na 1.ª série do Diário da República sobre este tema"),
    el("ul", {}, alertas.slice(0, 4).map(a => el("li", {},
      el("a", { href: ligarDiploma(a.p) }, a.c || a.t), " ", el("span", { class: "data" }, dataPT(a.d)),
      a.r && el("p", {}, a.r.slice(0, 220) + (a.r.length > 220 ? "…" : ""))))),
    el("p", { class: "nota" }, "Os acórdãos de uniformização de jurisprudência e as declarações de inconstitucionalidade com força obrigatória geral prevalecem sobre a jurisprudência comum."));
}

function listaJuris(res) {
  const caso = lerCaso();
  const blocos = [];
  if (!res.juris.length) {
    blocos.push(el("div", { class: "vazio" }, el("p", {}, "A DGSI não devolveu acórdãos para esta questão."), el("p", {}, "Reformule com os termos que os tribunais usam (por exemplo, \"resolução do contrato\" em vez de \"rescisão\") ou escolha outros tribunais.")));
    return blocos;
  }
  const barra = el("div", { class: "barra-juris" },
    el("p", { class: "nota" }, `${plural(res.juris.length, "acórdão", "acórdãos")} de ${res.bases.map(b => BASES[b]?.curto).join(", ")}${res.usarIA ? ", ordenados por pertinência" : ", ordenados por actualidade e coincidência de descritores"}.`));
  if (temChave() && res.juris.filter(j => j.sumarioCurto).length >= 3) {
    barra.append(el("button", { type: "button", class: "botao", onclick: e => abrirMapa(e.currentTarget, res) }, "Mapa de correntes"));
  }
  blocos.push(barra);
  if (!casoPreenchido(caso)) blocos.push(el("p", { class: "dica" }, "Preencha a ficha do caso para ver, em cada acórdão, onde o favorece e onde o prejudica."));
  else if (!temChave()) blocos.push(el("p", { class: "dica" }, "Para a análise face ao caso, active a chave gratuita do Gemini nas ", el("a", { href: "#/definicoes" }, "Definições"), "."));
  blocos.push(el("div", { id: "mapa-correntes" }));
  const lista = el("ol", { class: "lista-acordaos" }, res.juris.slice(0, 15).map(r => itemAcordao(r)));
  blocos.push(lista);
  if (res.juris.length > 15) {
    const mais = el("button", { type: "button", class: "botao mais-resultados", onclick: () => {
      lista.append(...res.juris.slice(15).map(r => itemAcordao(r)));
      mais.remove();
    } }, `Mostrar os restantes ${res.juris.length - 15} acórdãos`);
    blocos.push(mais);
  }
  return blocos;
}

export function itemAcordao(r) {
  const b = BASES[r.base];
  return el("li", { class: "acordao-item" },
    el("article", {},
      el("header", {},
        el("a", { href: ligarAcordao(r.url), class: "acordao-ligacao" },
          el("span", { class: "tribunal" }, b?.curto || r.base),
          el("span", { class: "data" }, dataPT(r.data)),
          el("span", { class: "processo" }, `Proc. ${r.processo}`)),
        r.pertinencia != null && el("span", { class: `pertinencia p${Math.round(r.pertinencia / 3.4)}`, title: "Pertinência estimada para a questão" }, `Pertinência ${r.pertinencia}/10`)),
      r.relator && el("p", { class: "relator" }, `Relator: ${r.relator}${r.votacao ? `. ${r.votacao.toLowerCase().replace(/^./, c => c.toUpperCase())}` : ""}`),
      r.descritores?.length ? el("p", { class: "descritores" }, r.descritores.slice(0, 6).join(" | ")) : null,
      r.sumarioCurto && el("p", { class: "sumario-curto" }, r.sumarioCurto.slice(0, 380) + (r.sumarioCurto.length > 380 ? "…" : "")),
    ));
}

async function abrirMapa(botao, res) {
  const zona = document.getElementById("mapa-correntes");
  const comSumario = res.juris.filter(j => j.sumarioCurto).slice(0, 20);
  botao.disabled = true; botao.textContent = "A identificar correntes…";
  try {
    const m = await mapaCorrentes(res.plano?.questao || res.pergunta, comSumario);
    if (!m.correntes.length) { zona.replaceChildren(el("p", { class: "nota" }, "Os acórdãos encontrados não permitem identificar correntes sobre esta questão.")); return; }
    const anos = comSumario.map(a => Number(a.data.slice(0, 4))).filter(Boolean);
    const min = Math.min(...anos), max = Math.max(...anos);
    zona.replaceChildren(el("section", { class: "mapa" },
      el("h3", {}, "Mapa de correntes"),
      m.correntes.map((c, ci) => el("div", { class: `corrente corrente-${ci % 4}` },
        el("p", { class: "tese" }, c.tese),
        c.fundamento && el("p", { class: "fundamento" }, c.fundamento),
        el("div", { class: "linha-tempo", "aria-label": `Acórdãos desta corrente entre ${min} e ${max}` },
          c.indices.map(i => {
            const a = comSumario[i]; const ano = Number(a.data.slice(0, 4));
            const pos = max > min ? ((ano - min) / (max - min)) * 100 : 50;
            return el("a", { href: ligarAcordao(a.url), class: "ponto-tempo", style: `left:${pos}%`, title: `${BASES[a.base]?.curto} ${dataPT(a.data)}, proc. ${a.processo}` }, el("span", { class: "invisivel" }, `${BASES[a.base]?.curto} ${dataPT(a.data)}`));
          }),
          el("span", { class: "ano-ini" }, String(min)), el("span", { class: "ano-fim" }, String(max))),
        el("ul", { class: "corrente-acordaos" }, c.indices.map(i => { const a = comSumario[i]; return el("li", {}, el("a", { href: ligarAcordao(a.url) }, `${BASES[a.base]?.curto}, ${dataPT(a.data)}, proc. ${a.processo}`)); })))),
      m.observacao && el("p", { class: "nota" }, m.observacao),
      el("p", { class: "nota" }, "Agrupamento feito a partir dos sumários. Confirme a tese de cada acórdão no respectivo texto.")));
    zona.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    aviso(e.message, "erro", 8000);
  } finally {
    botao.disabled = false; botao.textContent = "Mapa de correntes";
  }
}

function itemDiploma(r, extra = null) {
  return el("li", { class: "diploma-item" },
    el("a", { href: ligarDiploma(r.p, extra?.artigo), class: "diploma-ligacao" },
      el("span", { class: "designacao" }, designacao(r)),
      r.c && r.c !== r.t && el("span", { class: "nome-curto" }, r.c.replace(/\s*-\s*[A-Z]{2,6}$/, ""))),
    el("p", { class: "estado-diploma" },
      el("span", { class: `etiqueta ${r.s === "in_force" ? "em-vigor" : "revogado"}` }, ESTADOS[r.s] || "Estado não indicado"),
      r.v ? el("span", { class: "etiqueta" }, "Versão consolidada") : null,
      el("span", { class: "data" }, `Publicado em ${dataPT(r.d)}`)),
    r.r && el("p", { class: "sumario-curto" }, r.r.slice(0, 260) + (r.r.length > 260 ? "…" : "")));
}

function listaLegislacao(res) {
  const caso = lerCaso();
  const blocos = [];
  if (res.normas.length) {
    blocos.push(el("section", { class: "normas" },
      el("h3", {}, "Diplomas e normas de referência"),
      caso?.dataFactos && el("p", { class: "nota" }, `Os artigos abrem na versão em vigor a ${dataPT(caso.dataFactos)}, data dos factos.`),
      el("ul", { class: "lista-normas" }, res.normas.map(n => el("li", {},
        el("span", { class: "norma-diploma" }, n.diploma.c ? n.diploma.c.replace(/\s*-\s*[A-Z]{2,6}$/, "") : designacao(n.diploma)),
        n.artigos.length ? n.artigos.map(a => el("a", { href: ligarDiploma(n.diploma.p, a), class: "norma-artigo" }, `art. ${a}.º`)) : el("a", { href: ligarDiploma(n.diploma.p), class: "norma-artigo" }, "abrir")))),
      el("p", { class: "nota" }, "Identificados a partir da questão e confirmados no índice oficial do Diário da República.")));
  }
  const outros = res.legislacao.filter(r => !res.normas.some(n => n.diploma.p === r.p));
  if (outros.length) blocos.push(el("h3", { class: "subtitulo-lista" }, "Outros diplomas sobre o tema"), el("ol", { class: "lista-diplomas" }, outros.map(r => itemDiploma(r))));
  if (!blocos.length) blocos.push(el("div", { class: "vazio" }, el("p", {}, "Não foram encontrados diplomas para estes termos."), el("p", {}, "Experimente o nome do diploma ou do instituto jurídico (por exemplo, \"arrendamento urbano\").")));
  return blocos;
}

function listaDR(res) {
  if (!res.recentes.length) return [el("div", { class: "vazio" }, el("p", {}, "Não há publicações na 1.ª série do Diário da República sobre este tema nos últimos dois anos."))];
  return [el("p", { class: "nota" }, "Diplomas publicados na 1.ª série nos últimos dois anos, do mais recente para o mais antigo."),
    el("ol", { class: "lista-diplomas" }, res.recentes.map(r => itemDiploma(r)))];
}
