const ALVOS = {
  dgsi_robots: "https://www.dgsi.pt/robots.txt",
  dgsi_pesquisa_stj: "https://www.dgsi.pt/jstj.nsf/954f0ce6ad9dd8b980256b5f003fa814?SearchView&Query=extin%C3%A7%C3%A3o+posto+trabalho&SearchOrder=4&Count=10",
  dgsi_pesquisa_sta: "https://www.dgsi.pt/jsta.nsf/35fbbbf22e1bb1e680256f8e003ea931?SearchView&Query=contrata%C3%A7%C3%A3o+p%C3%BAblica&SearchOrder=4&Count=10",
  dgsi_doc: "https://www.dgsi.pt/jstj.nsf/954f0ce6ad9dd8b980256b5f003fa814/089cbe5224feb4e780258e1a00325135?OpenDocument",
  dre_robots: "https://diariodarepublica.pt/robots.txt",
  dre_codigo_trabalho: "https://diariodarepublica.pt/dr/legislacao-consolidada/lei/2009-34546475",
  tc_robots: "https://www.tribunalconstitucional.pt/robots.txt",
  tc_acordaos: "https://www.tribunalconstitucional.pt/tc/acordaos/",
  curia_robots: "https://curia.europa.eu/robots.txt",
  eurlex_robots: "https://eur-lex.europa.eu/robots.txt",
}
export async function onRequest({ request: req }) {
  const u = new URL(req.url);
  const so = u.searchParams.get("alvo");
  const url = u.searchParams.get("url");
  const lista = url ? { livre: url } : so ? { [so]: ALVOS[so] } : ALVOS;
  const full = false;
  const out = {};
  await Promise.all(Object.entries(lista).map(async ([k, v]) => {
    const t = Date.now();
    try {
      const r = await fetch(v, { headers: { "User-Agent": "Mozilla/5.0 (pesquisa jurisprudencial; contacto martastsoares)" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
      const buf = new Uint8Array(await r.arrayBuffer());
      const ct = r.headers.get("content-type") || "";
      const cs = /charset=([^;]+)/i.exec(ct)?.[1] || "utf-8";
      let txt = "";
      try { txt = new TextDecoder(cs.trim()).decode(buf); } catch { txt = new TextDecoder("latin1").decode(buf); }
      out[k] = { status: r.status, ms: Date.now() - t, ct, final: r.url, bytes: buf.length, body: full ? txt : txt.slice(0, 3000) };
    } catch (e) { out[k] = { erro: String(e), ms: Date.now() - t }; }
  }));
  return Response.json(out);
}
