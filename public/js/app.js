import { lerRota } from "./rotas.js";
import { vistaPesquisa } from "./vistas/pesquisa.js";
import { vistaAcordao } from "./vistas/acordao.js";
import { vistaDiploma } from "./vistas/diploma.js";
import { vistaVerificar } from "./vistas/verificar.js";
import { vistaGuardados, vistaDefinicoes, vistaSobre } from "./vistas/outras.js";
import { el } from "./util.js";

const raiz = document.getElementById("principal");
const ROTAS = {
  "/": ["pesquisa", vistaPesquisa],
  "/acordao": ["pesquisa", vistaAcordao],
  "/diploma": ["pesquisa", vistaDiploma],
  "/verificar": ["verificar", vistaVerificar],
  "/guardados": ["guardados", vistaGuardados],
  "/definicoes": ["definicoes", vistaDefinicoes],
  "/sobre": ["", vistaSobre],
};

const posicoes = new Map();

async function navegar() {
  const { caminho, params } = lerRota();
  const [seccao, vista] = ROTAS[caminho] || ROTAS["/"];
  document.querySelectorAll("[data-rota]").forEach(a => {
    if (a.dataset.rota === seccao) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  if (caminho === "/") document.title = "Fonte Certa";
  document.body.dataset.vista = caminho.replace("/", "") || "pesquisa";
  try {
    await vista(raiz, params);
  } catch (e) {
    console.error(e);
    raiz.replaceChildren(el("div", { class: "vazio" }, el("p", {}, "Ocorreu um erro ao abrir esta página: ", e.message), el("p", {}, el("a", { href: "#/" }, "Voltar à pesquisa"))));
  }
  const y = posicoes.get(location.hash);
  if (y != null && caminho === "/") window.scrollTo(0, y); else if (caminho !== "/") window.scrollTo(0, 0);
}

window.addEventListener("hashchange", navegar);
window.addEventListener("scroll", () => { posicoes.set(location.hash, window.scrollY); }, { passive: true });
navegar();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

// Convite à instalação da app (computador e Android). No iPhone, explica-se o passo manual nas Definições.
let pedidoInstalacao = null;
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  pedidoInstalacao = e;
  if (document.querySelector(".instalar") || matchMedia("(display-mode: standalone)").matches) return;
  const b = el("button", { type: "button", class: "botao botao-principal instalar", onclick: async () => {
    b.remove();
    pedidoInstalacao.prompt();
    await pedidoInstalacao.userChoice.catch(() => {});
    pedidoInstalacao = null;
  } }, "Instalar a app");
  document.body.append(b);
});
window.addEventListener("appinstalled", () => document.querySelector(".instalar")?.remove());
