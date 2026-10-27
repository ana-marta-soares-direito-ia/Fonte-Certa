// Estado partilhado entre vistas. O caso fica só nesta sessão do navegador.
import { local } from "./util.js";

const CHAVE_CASO = "fc.caso";

export const estado = {
  ultimaPesquisa: null,     // resultado de pesquisarTudo
  acordaos: new Map(),      // cache de acórdãos lidos (url -> objecto)
  pareceres: new Map(),     // url -> parecer
};

export function lerCaso() {
  try { return JSON.parse(sessionStorage.getItem(CHAVE_CASO) || "null"); } catch { return null; }
}
export function gravarCaso(caso) {
  try { sessionStorage.setItem(CHAVE_CASO, JSON.stringify(caso)); } catch {}
  estado.pareceres.clear();
}
export function apagarCaso() {
  try { sessionStorage.removeItem(CHAVE_CASO); } catch {}
  estado.pareceres.clear();
}
export const casoPreenchido = c => !!(c && (c.anonimizado || "").trim().length > 20);

// Guardados: ficam neste navegador.
export const guardados = {
  todos: () => local.ler("guardados", []),
  tem: id => local.ler("guardados", []).some(g => g.id === id),
  juntar(item) {
    const l = local.ler("guardados", []).filter(g => g.id !== item.id);
    l.unshift({ ...item, quando: new Date().toISOString() });
    local.gravar("guardados", l.slice(0, 500));
  },
  retirar(id) { local.gravar("guardados", local.ler("guardados", []).filter(g => g.id !== id)); },
  nota(id, texto) { local.gravar("guardados", local.ler("guardados", []).map(g => (g.id === id ? { ...g, nota: texto } : g))); },
};
