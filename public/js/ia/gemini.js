// Ligação ao Gemini (Google), com a chave do próprio utilizador.
// A chave fica guardada apenas neste navegador e o pedido segue directamente para a Google.
import { local, espera } from "../util.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export const temChave = () => !!local.ler("gemini.chave");
export const obterChave = () => local.ler("gemini.chave", "");
export function definirChave(chave) {
  local.gravar("gemini.chave", (chave || "").trim());
  local.apagar("gemini.modelo");
}

function versaoDoNome(nome) {
  const m = /gemini-(\d+(?:\.\d+)?)/.exec(nome);
  return m ? parseFloat(m[1]) : 0;
}

// Escolhe o modelo "Flash" mais recente disponível para a chave (a lista muda com o tempo).
export async function escolherModelo(forcar = false) {
  const guardado = local.ler("gemini.modelo");
  if (guardado && !forcar && Date.now() - guardado.quando < 86400000) return guardado.nome;
  const r = await fetch(`${BASE}/models?pageSize=200&key=${encodeURIComponent(obterChave())}`);
  if (r.status === 400 || r.status === 403) throw new Error("A chave do Gemini não é válida. Confirme-a nas Definições.");
  if (!r.ok) throw new Error("Não foi possível contactar o Gemini.");
  const dados = await r.json();
  const candidatos = (dados.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map(m => m.name.replace(/^models\//, ""))
    .filter(n => /^gemini-\d/.test(n) && /flash/.test(n) && !/(image|tts|audio|live|vision|embedding|8b|exp-0|thinking-exp)/.test(n));
  if (!candidatos.length) throw new Error("A chave não tem acesso a nenhum modelo Gemini Flash.");
  candidatos.sort((a, b) => {
    const lite = n => (/lite/.test(n) ? 1 : 0);
    const prev = n => (/preview|exp/.test(n) ? 1 : 0);
    return versaoDoNome(b) - versaoDoNome(a) || lite(a) - lite(b) || prev(a) - prev(b) || a.length - b.length;
  });
  const nome = candidatos[0];
  local.gravar("gemini.modelo", { nome, quando: Date.now(), todos: candidatos.slice(0, 8) });
  return nome;
}

export const modeloAtual = () => local.ler("gemini.modelo")?.nome || "";

// Pede uma resposta em JSON. Repete em caso de limite temporário de pedidos.
export async function pedirJSON({ sistema, mensagem, temperatura = 0.1, maxTokens = 8192 }) {
  if (!temChave()) throw new Error("Para esta análise é necessária a chave gratuita do Gemini (Definições).");
  let modelo = await escolherModelo();
  const corpo = {
    systemInstruction: { parts: [{ text: sistema }] },
    contents: [{ role: "user", parts: [{ text: mensagem }] }],
    generationConfig: { temperature: temperatura, maxOutputTokens: maxTokens, responseMimeType: "application/json" },
  };
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const r = await fetch(`${BASE}/models/${modelo}:generateContent?key=${encodeURIComponent(obterChave())}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
    });
    if (r.status === 429 || r.status === 503) {
      const espere = Number(r.headers.get("Retry-After")) || [8, 20, 40, 60][tentativa];
      await espera(espere * 1000);
      continue;
    }
    if (r.status === 404) { modelo = await escolherModelo(true); continue; }
    if (!r.ok) {
      let msg = "";
      try { msg = (await r.json()).error?.message || ""; } catch {}
      throw new Error("O Gemini recusou o pedido" + (msg ? `: ${msg}` : "."));
    }
    const dados = await r.json();
    const texto = (dados.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
    if (!texto) throw new Error("O Gemini não devolveu resposta. Tente novamente.");
    return lerJSON(texto);
  }
  throw new Error("O limite gratuito de pedidos ao Gemini foi atingido. Aguarde um minuto e tente de novo.");
}

function lerJSON(texto) {
  const limpo = texto.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try { return JSON.parse(limpo); }
  catch {
    const i = limpo.indexOf("{"), j = limpo.lastIndexOf("}");
    if (i >= 0 && j > i) return JSON.parse(limpo.slice(i, j + 1));
    throw new Error("A resposta do Gemini veio incompleta. Tente novamente.");
  }
}

export async function testarChave() {
  const modelo = await escolherModelo(true);
  return modelo;
}
