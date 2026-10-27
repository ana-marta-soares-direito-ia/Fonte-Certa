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
  const cache = caches.default;
  const chave = new Request(u.toString() + (metodo === "POST" ? "#" + (await request.clone().text()) : ""), { method: "GET" });
  if (metodo === "GET") {
    const guardado = await cache.match(chave);
    if (guardado) return guardado;
  }
  const init = {
    method: metodo,
    headers: { "User-Agent": "Mozilla/5.0 (compatible; FonteCerta/1.0; pesquisa jurídica)", "Accept-Language": "pt-PT,pt;q=0.9" },
    redirect: "follow",
    cf: { cacheTtl: 0 },
  };
  if (metodo === "POST") {
    init.body = await request.text();
    init.headers["Content-Type"] = request.headers.get("Content-Type") || "application/x-www-form-urlencoded";
  }
  let r;
  try { r = await fetch(u.toString(), init); }
  catch (e) { return new Response("A fonte oficial não respondeu.", { status: 502 }); }
  const h = new Headers();
  h.set("Content-Type", r.headers.get("Content-Type") || "text/html");
  h.set("Cache-Control", r.ok ? "public, max-age=21600" : "no-store");
  h.set("X-Fonte-Estado", String(r.status));
  const resp = new Response(r.body, { status: r.status, headers: h });
  if (metodo === "GET" && r.ok) {
    const [a, b] = resp.body.tee();
    const paraCache = new Response(b, { status: resp.status, headers: h });
    await cache.put(chave, paraCache);
    return new Response(a, { status: resp.status, headers: h });
  }
  return resp;
}
