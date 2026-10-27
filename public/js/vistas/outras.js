import { el, aviso, dataPT, local } from "../util.js";
import { guardados } from "../estado.js";
import { temChave, obterChave, definirChave, testarChave, modeloAtual } from "../ia/gemini.js";
import { ligarAcordao, ligarDiploma } from "../rotas.js";
import { carregarManifesto } from "../fontes/legislacao.js";

export function vistaGuardados(raiz) {
  const lista = guardados.todos();
  const desenhar = () => vistaGuardados(raiz);
  raiz.replaceChildren(el("div", { class: "pagina-texto" },
    el("h1", {}, "Guardados"),
    el("p", { class: "introducao" }, "Acórdãos e artigos que guardou. Ficam apenas neste navegador."),
    lista.length ? el("div", { class: "pesquisa-accoes" },
      el("button", { type: "button", class: "botao", onclick: () => exportar(lista) }, "Copiar lista de citações")) : null,
    lista.length ? el("ol", { class: "lista-guardados" }, lista.map(g => el("li", {},
      el("a", { href: g.tipo === "acordao" ? ligarAcordao(g.url) : ligarDiploma(g.caminho, g.artigo, g.data) }, g.titulo),
      g.citacao && el("p", { class: "citacao-guardada" }, g.citacao),
      g.resumo && el("p", { class: "sumario-curto" }, g.resumo.slice(0, 240) + (g.resumo.length > 240 ? "…" : "")),
      el("label", { class: "nota-guardado" }, "Nota", el("textarea", { rows: 2, onchange: e => guardados.nota(g.id, e.target.value) }, g.nota || "")),
      el("button", { type: "button", class: "ligacao-texto", onclick: () => { guardados.retirar(g.id); desenhar(); } }, "Retirar")))) :
      el("div", { class: "vazio" }, el("p", {}, "Ainda não guardou nenhum acórdão nem artigo."), el("p", {}, el("a", { href: "#/" }, "Fazer uma pesquisa")))));
}

async function exportar(lista) {
  const texto = lista.map(g => `${g.citacao || g.titulo}${g.nota ? `\n  Nota: ${g.nota}` : ""}`).join("\n");
  try { await navigator.clipboard.writeText(texto); aviso("Lista copiada.", "sucesso"); } catch { aviso("O navegador não permitiu copiar.", "erro"); }
}

export function vistaDefinicoes(raiz) {
  const campo = el("input", { type: "password", id: "chave", autocomplete: "off", spellcheck: "false", value: obterChave(), placeholder: "Cole aqui a chave" });
  const estadoChave = el("p", { class: "nota", role: "status" }, temChave() ? `Chave activa${modeloAtual() ? `, modelo ${modeloAtual()}` : ""}.` : "Sem chave própria: a análise usa o modelo incluído na Fonte Certa.");
  raiz.replaceChildren(el("div", { class: "pagina-texto" },
    el("h1", {}, "Definições"),
    el("section", { class: "bloco-definicao" },
      el("h2", {}, "Análise com IA"),
      el("p", {}, "A análise face ao caso, o mapa de correntes e a confirmação de citações funcionam de imediato com o modelo de linguagem incluído na Fonte Certa, alojado na Cloudflare, que não guarda os textos nem os usa para treino. Este modelo tem um limite diário de utilização partilhado por todos os utilizadores."),
      el("p", {}, "Para uso intensivo, pode activar uma chave gratuita do Gemini, da Google, em seu nome: passa a ter limites próprios e a ordenação dos acórdãos por pertinência. A chave fica guardada só neste navegador e os pedidos seguem directamente para a Google."),
      el("ol", { class: "passos-chave" },
        el("li", {}, "Entre em ", el("a", { href: "https://aistudio.google.com/apikey", target: "_blank", rel: "noopener" }, "aistudio.google.com/apikey"), " com a sua conta Google."),
        el("li", {}, "Carregue em \"Create API key\" e copie a chave."),
        el("li", {}, "Cole a chave abaixo e carregue em \"Guardar e testar\".")),
      el("p", { class: "aviso-privacidade" }, "No plano gratuito, a Google pode usar o conteúdo enviado para melhorar os seus produtos. Por isso, a Fonte Certa só envia o texto da ficha do caso depois de substituir os dados identificativos e de lhe pedir confirmação, e nunca envia o texto original."),
      el("form", { class: "form-chave", onsubmit: async e => {
        e.preventDefault();
        definirChave(campo.value);
        if (!campo.value.trim()) { estadoChave.textContent = "Chave removida."; return; }
        estadoChave.textContent = "A testar a chave…";
        try { const m = await testarChave(); estadoChave.textContent = `Chave válida. Modelo escolhido: ${m}.`; aviso("Análise com IA activada.", "sucesso"); }
        catch (err) { estadoChave.textContent = err.message; }
      } },
        el("label", { for: "chave" }, "Chave do Gemini"), campo,
        el("div", { class: "pesquisa-accoes" },
          el("button", { type: "submit", class: "botao botao-principal" }, "Guardar e testar"),
          temChave() && el("button", { type: "button", class: "botao botao-discreto", onclick: () => { definirChave(""); vistaDefinicoes(raiz); aviso("Chave removida."); } }, "Remover chave"))),
      estadoChave),
    el("section", { class: "bloco-definicao" },
      el("h2", {}, "Instalar a app"),
      el("p", {}, "No computador e no Android, use o botão \"Instalar a app\" ou o ícone de instalação na barra de endereço do navegador."),
      el("p", {}, "No iPhone e no iPad, abra a Fonte Certa no Safari, carregue em Partilhar e escolha \"Adicionar ao ecrã principal\".")),
    el("section", { class: "bloco-definicao" },
      el("h2", {}, "Dados neste navegador"),
      el("p", {}, "A ficha do caso apaga-se quando fecha o separador. Os guardados e a chave ficam até os apagar."),
      el("button", { type: "button", class: "botao botao-discreto", onclick: () => {
        if (!confirm("Apagar a chave, os guardados e a ficha do caso deste navegador?")) return;
        local.limparTudo(); try { sessionStorage.clear(); } catch {}
        aviso("Dados apagados."); vistaDefinicoes(raiz);
      } }, "Apagar todos os dados")),
  ));
}

export async function vistaSobre(raiz) {
  let m = null;
  try { m = await carregarManifesto(); } catch {}
  raiz.replaceChildren(el("div", { class: "pagina-texto" },
    el("h1", {}, "Fontes, metodologia e limitações"),
    el("h2", {}, "De onde vêm os resultados"),
    el("ul", { class: "lista-simples" },
      el("li", {}, el("strong", {}, "Jurisprudência: "), "bases jurídico-documentais da DGSI, geridas pelo IGFEJ (Supremo Tribunal de Justiça, Supremo Tribunal Administrativo, Tribunais da Relação, Tribunais Centrais Administrativos, Tribunal dos Conflitos, Julgados de Paz e Tribunal Constitucional até 1998), consultadas em tempo real em www.dgsi.pt."),
      el("li", {}, el("strong", {}, "Tribunal Constitucional: "), "acórdãos posteriores a 1998 confirmados no sítio oficial do Tribunal; as declarações de inconstitucionalidade com força obrigatória geral publicadas na 1.ª série do Diário da República."),
      el("li", {}, el("strong", {}, "Legislação: "), "1.ª série do Diário da República desde 1960, com o texto consolidado artigo a artigo e cada versão datada da sua entrada em vigor, a partir do repositório aberto legalize-pt, que reproduz o texto do Diário da República Electrónico (INCM).", m ? ` Índice actualizado em ${dataPT(m.gerado.slice(0, 10))}, com ${m.total.toLocaleString("pt-PT")} diplomas.` : ""),
      el("li", {}, el("strong", {}, "Descritores: "), "lista de descritores oficiais do projecto IRIS do Supremo Tribunal de Justiça e do INESC-ID.")),
    el("h2", {}, "Como a Fonte Certa evita erros"),
    el("ul", { class: "lista-simples" },
      el("li", {}, "Os acórdãos e os diplomas apresentados são sempre lidos na fonte oficial, nunca escritos pela IA."),
      el("li", {}, "As normas sugeridas pela análise só aparecem se o diploma existir no índice oficial."),
      el("li", {}, "Na análise face ao caso, cada ponto tem de vir acompanhado de um trecho do acórdão; a app confirma esse trecho palavra por palavra e descarta os que não constam do texto."),
      el("li", {}, "Os dados identificativos do caso são substituídos por marcadores antes de qualquer envio, e o texto só é enviado depois de confirmado por si.")),
    el("h2", {}, "Limitações"),
    el("ul", { class: "lista-simples" },
      el("li", {}, "A DGSI não publica todos os acórdãos, e cada pesquisa na DGSI devolve no máximo 500 documentos."),
      el("li", {}, "Os textos consolidados não têm valor legal: a versão que faz fé é a publicada no Diário da República."),
      el("li", {}, "A análise com IA é um auxiliar de trabalho e não substitui a leitura do acórdão nem o juízo profissional."),
      el("li", {}, "Não estão incluídos regulamentos municipais nem a 2.ª série do Diário da República.")),
    el("p", { class: "assinatura" }, "Ana Marta Soares, Especialista em IA aplicada ao Direito")));
}
