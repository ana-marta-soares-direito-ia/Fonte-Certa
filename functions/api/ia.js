// Análise com o modelo de linguagem incluído (Cloudflare Workers AI).
// Recebe apenas o texto já anonimizado e o texto público dos acórdãos; não guarda nada.
const MODELOS = {
  principal: "@cf/openai/gpt-oss-120b",
  alternativo: "@cf/openai/gpt-oss-20b",
};
const LIMITE = 140000; // caracteres por pedido

export async function onRequestPost({ request, env }) {
  if (!env.AI) return resposta({ erro: "O modelo incluído não está disponível nesta publicação." }, 503);
  let corpo;
  try { corpo = await request.json(); } catch { return resposta({ erro: "Pedido inválido." }, 400); }
  const sistema = String(corpo.sistema || "").slice(0, 6000);
  const mensagem = String(corpo.mensagem || "");
  if (!mensagem || mensagem.length > LIMITE) return resposta({ erro: "O texto a analisar é demasiado extenso." }, 413);
  const max = Math.min(Number(corpo.maxTokens) || 2048, 6000);
  const modelo = MODELOS[corpo.modelo] || MODELOS.principal;
  const entrada = {
    messages: [{ role: "system", content: sistema }, { role: "user", content: mensagem }],
    max_tokens: max,
    temperature: Number(corpo.temperatura ?? 0.1),
  };
  try {
    let r;
    if (modelo.includes("gpt-oss")) {
      // Os modelos gpt-oss usam o formato "responses".
      r = await env.AI.run(modelo, { instructions: sistema, input: mensagem, reasoning: { effort: "low" }, max_output_tokens: max });
    } else {
      r = await env.AI.run(modelo, entrada);
    }
    const texto = extrairTexto(r);
    if (!texto) return resposta({ erro: "O modelo não devolveu resposta.", detalhe: JSON.stringify(r).slice(0, 400) }, 502);
    return resposta({ texto, modelo });
  } catch (e) {
    const msg = String(e?.message || e);
    if (/4006|daily|neurons|quota|limit/i.test(msg)) return resposta({ erro: "limite", detalhe: "Foi atingido o limite diário da análise incluída." }, 429);
    return resposta({ erro: "Falha do modelo incluído.", detalhe: msg.slice(0, 300) }, 502);
  }
}

function extrairTexto(r) {
  if (!r) return "";
  if (typeof r === "string") return r;
  if (typeof r.response === "string") return r.response;
  if (r.response && typeof r.response === "object") return JSON.stringify(r.response);
  if (Array.isArray(r.output)) {
    const partes = [];
    for (const item of r.output) {
      if (item.type === "message" && Array.isArray(item.content)) for (const c of item.content) if (c.text) partes.push(c.text);
    }
    if (partes.length) return partes.join("");
  }
  if (r.output_text) return r.output_text;
  if (r.choices?.[0]?.message?.content) return r.choices[0].message.content;
  return "";
}

function resposta(obj, estado = 200) {
  return new Response(JSON.stringify(obj), { status: estado, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
