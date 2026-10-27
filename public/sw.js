// Funcionamento offline da app: guarda a interface e o índice de legislação.
const VERSAO = "fc-v1";
const NUCLEO = ["/", "/index.html", "/estilos.css?v=1", "/js/app.js?v=1", "/js/app.js", "/js/util.js", "/js/rotas.js", "/js/estado.js", "/js/motor.js",
  "/js/citacoes.js", "/js/fontes/dgsi.js", "/js/fontes/legislacao.js", "/js/ia/gemini.js", "/js/ia/analise.js", "/js/ia/anonimizar.js",
  "/js/vistas/pesquisa.js", "/js/vistas/acordao.js", "/js/vistas/diploma.js", "/js/vistas/verificar.js", "/js/vistas/outras.js",
  "/manifest.webmanifest", "/icones/icone.svg", "/fontes/instrument-sans-latin-wght-normal.woff2", "/fontes/newsreader-latin-opsz-normal.woff2",
  "/fontes/newsreader-latin-opsz-italic.woff2", "/dados/descritores.json"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(NUCLEO)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO && k !== "fc-dados").map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  if (u.pathname.startsWith("/api/")) return; // fontes oficiais: sempre em rede
  if (u.pathname.startsWith("/dados/leg/")) {
    // Índice de legislação: o endereço muda quando há nova versão, por isso guarda-se o que foi pedido.
    if (u.pathname.endsWith("manifesto.json")) { e.respondWith(fetch(e.request).catch(() => caches.match(e.request))); return; }
    e.respondWith(caches.open("fc-dados").then(async c => {
      const g = await c.match(e.request);
      if (g) return g;
      const r = await fetch(e.request);
      if (r.ok) {
        // Retira versões anteriores do mesmo ficheiro.
        for (const k of await c.keys()) if (new URL(k.url).pathname === u.pathname && k.url !== e.request.url) c.delete(k);
        c.put(e.request, r.clone());
      }
      return r;
    }));
    return;
  }
  // Interface: rede primeiro, para receber actualizações; sem rede, usa a cópia guardada.
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copia = r.clone(); caches.open(VERSAO).then(c => c.put(e.request, copia)); }
    return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match("/index.html"))));
});
