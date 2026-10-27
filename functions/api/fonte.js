// Ponte para as fontes oficiais. Só reencaminha pedidos para sítios públicos
// autorizados; não guarda nem regista conteúdos, e não recebe dados do caso.
const PERMITIDOS = new Set([
  "www.dgsi.pt", "dgsi.pt",
  "www.tribunalconstitucional.pt", "tribunalconstitucional.pt",
]);

export async function onRequest({ request }) {
  const pedido = new URL(request.url);
  const alvo = pedido.searchParams.get("u");
  if (!alvo) return new Response("Falta o endereço da fonte.", { status: 400 });
  let u;
  try { u = new URL(alvo); } catch { return new Response("Endereço inválido.", { status: 400 }); }
  if (u.protocol !== "https:" || !PERMITIDOS.has(u.hostname)) {
    return new Response("Fonte não autorizada.", { status: 403 });
  }
  const metodo = request.method === "POST" ? "POST" : "GET";
  const init = {
    method: metodo,
    headers: { "User-Agent": "Mozilla/5.0 (compatible; FonteCerta/1.0; pesquisa jurídica)", "Accept-Language": "pt-PT,pt;q=0.9" },
    redirect: "follow",
    // A rede da Cloudflare guarda a página durante 6 horas, o que reduz os pedidos às fontes oficiais.
    cf: metodo === "GET" ? { cacheEverything: true, cacheTtl: 21600, cacheTtlByStatus: { "200-299": 21600, "400-599": 0 } } : undefined,
  };
  if (metodo === "POST") {
    init.body = await request.text();
    init.headers["Content-Type"] = request.headers.get("Content-Type") || "application/x-www-form-urlencoded";
  }
  let r = null;
  for (let tentativa = 0; tentativa < 2 && !r; tentativa++) {
    try {
      const resp = await fetch(u.toString(), init);
      if (resp.status >= 500 && tentativa === 0) { await new Promise(t => setTimeout(t, 600)); continue; }
      r = resp;
    } catch (e) {
      if (tentativa === 1) return new Response("A fonte oficial não respondeu.", { status: 502 });
      await new Promise(t => setTimeout(t, 600));
    }
  }
  if (!r) return new Response("A fonte oficial não respondeu.", { status: 502 });
  const h = new Headers();
  h.set("Content-Type", r.headers.get("Content-Type") || "text/html");
  h.set("Cache-Control", r.ok ? "public, max-age=21600" : "no-store");
  h.set("X-Fonte-Estado", String(r.status));
  return new Response(r.body, { status: r.status, headers: h });
}
