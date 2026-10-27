import { el, aviso, dataPT, emParalelo, plural } from "../util.js";
import { lerCaso } from "../estado.js";
import { extrairCitacoes, verificar } from "../citacoes.js";
import { lerAcordao, BASES } from "../fontes/dgsi.js";
import { designacao } from "../fontes/legislacao.js";
import { confirmarCitacao } from "../ia/analise.js";
import { temIA as temChave } from "../ia/gemini.js";
import { ligarAcordao, ligarDiploma } from "../rotas.js";

let ultimoTexto = "";

export function vistaVerificar(raiz) {
  const caso = lerCaso();
  const texto = el("textarea", { id: "texto-peca", rows: 12, placeholder: "Cole aqui a peça processual, o parecer ou o excerto a verificar." }, ultimoTexto);
  const data = el("input", { type: "date", id: "data-factos", value: caso?.dataFactos || "" });
  const resultados = el("section", { class: "resultados-verificacao", "aria-live": "polite" });
  const botao = el("button", { type: "submit", class: "botao botao-principal" }, "Verificar citações");

  raiz.replaceChildren(el("div", { class: "pagina-verificar" },
    el("h1", {}, "Verificar citações"),
    el("p", { class: "introducao" }, "Confirma se cada acórdão e cada artigo citado existem nas fontes oficiais e, com a data dos factos, se o artigo tinha essa redacção nessa data. Útil para a sua peça e para a peça da parte contrária."),
    el("form", { class: "form-verificar", onsubmit: async e => {
      e.preventDefault();
      ultimoTexto = texto.value;
      const citacoes = extrairCitacoes(texto.value);
      if (!citacoes.length) { resultados.replaceChildren(el("p", { class: "vazio" }, "Não foram encontradas citações de acórdãos (número de processo ou acórdão do Tribunal Constitucional) nem de artigos com indicação do diploma.")); return; }
      botao.disabled = true; botao.textContent = "A verificar…";
      const lista = el("ol", { class: "lista-citacoes" });
      resultados.replaceChildren(el("p", { class: "nota" }, `${plural(citacoes.length, "citação encontrada", "citações encontradas")}.`), lista);
      const linhas = citacoes.map(c => { const li = linhaCitacao(c); lista.append(li); return li; });
      const contagem = { confirmada: 0, "nao-encontrada": 0, "a-confirmar": 0 };
      await emParalelo(citacoes, 3, async (c, i) => {
        try {
          const r = await verificar(c, { dataFactos: data.value });
          contagem[r.estado]++;
          preencher(linhas[i], c, r);
        } catch (err) {
          contagem["a-confirmar"]++;
          preencher(linhas[i], c, { estado: "a-confirmar", nota: err.message });
        }
      });
      resultados.firstChild.textContent = `${plural(citacoes.length, "citação", "citações")}: ${contagem.confirmada} confirmadas, ${contagem["nao-encontrada"]} não encontradas, ${contagem["a-confirmar"]} por confirmar.`;
      botao.disabled = false; botao.textContent = "Verificar citações";
    } },
      el("label", { for: "texto-peca", class: "rotulo-pergunta" }, "Texto a verificar"), texto,
      el("div", { class: "pesquisa-accoes" }, el("label", { class: "rotulo-linha" }, "Data dos factos (opcional)", data), botao)),
    resultados));
}

function descrever(c) {
  if (c.tipo === "acordao") return `Acórdão, processo ${c.processo}`;
  if (c.tipo === "tc") return `Acórdão do Tribunal Constitucional n.º ${c.numero}/${c.ano}`;
  if (c.tipo === "ecli") return c.ecli;
  if (c.tipo === "artigo") return `Artigo ${c.artigo}.º, ${c.diploma}`;
  return c.chave;
}

function linhaCitacao(c) {
  return el("li", { class: "citacao a-verificar" },
    el("p", { class: "citacao-alvo" }, el("span", { class: "estado" }, "A verificar"), descrever(c)),
    c.frase && el("p", { class: "citacao-frase" }, c.frase));
}

function preencher(li, c, r) {
  li.className = `citacao ${r.estado}`;
  const nomes = { confirmada: "Confirmada", "nao-encontrada": "Não encontrada", "a-confirmar": "Por confirmar" };
  li.querySelector(".estado").textContent = nomes[r.estado];
  const detalhe = el("div", { class: "citacao-detalhe" });
  if (r.nota) detalhe.append(el("p", { class: "nota" }, r.nota));
  if (r.acordaos) {
    detalhe.append(el("ul", {}, r.acordaos.map(a => el("li", {},
      el("a", { href: ligarAcordao(a.url) }, `${BASES[a.base]?.curto}, ${dataPT(a.data)}, proc. ${a.processo}`), a.relator ? `, relator ${a.relator}` : "",
      temChave() && c.frase && el("button", { type: "button", class: "ligacao-texto", onclick: e => confirmar(e.currentTarget, c, a) }, "Confirmar se sustenta a afirmação")))));
  }
  if (r.url && c.tipo !== "acordao") detalhe.append(el("p", {}, el("a", { href: r.url, target: "_blank", rel: "noopener" }, "Abrir a fonte oficial")));
  if (r.artigo) {
    detalhe.append(el("p", {}, el("a", { href: ligarDiploma(r.diploma.p, r.artigo.numero, r.versao?.data ? "" : "") }, `${designacao(r.diploma)}, ${r.artigo.rotulo}${r.artigo.epigrafe ? ` (${r.artigo.epigrafe})` : ""}`),
      r.versao ? `, na redacção em vigor desde ${dataPT(r.versao.data)}` : ""),
      el("blockquote", { class: "texto-artigo" }, r.artigo.texto.slice(0, 700) + (r.artigo.texto.length > 700 ? "…" : "")));
  }
  li.append(detalhe);
}

async function confirmar(botao, c, a) {
  botao.disabled = true; botao.textContent = "A confirmar…";
  try {
    const ac = await lerAcordao(a.url);
    const r = await confirmarCitacao(c.frase, ac);
    botao.replaceWith(el("div", { class: `confirmacao sustenta-${r.sustenta.replace(" ", "-").replace("ã", "a")}` },
      el("p", {}, el("strong", {}, `Sustenta a afirmação: ${r.sustenta}. `), r.explicacao),
      r.prova && el("blockquote", {}, "“", r.prova.trecho, "”", el("a", { href: ligarAcordao(a.url) }, ` ${r.prova.ref}`))));
  } catch (e) {
    aviso(e.message, "erro", 8000);
    botao.disabled = false; botao.textContent = "Confirmar se sustenta a afirmação";
  }
}
