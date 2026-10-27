import fs from "node:fs";
const UA = { "User-Agent": "Mozilla/5.0 (Fonte Certa; pesquisa jurisprudencial)" };
async function get(url) {
  const t = Date.now();
  try {
    const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(40000) });
    const buf = new Uint8Array(await r.arrayBuffer());
    const ct = r.headers.get("content-type") || "";
    const cs = (/charset=([^;]+)/i.exec(ct)?.[1] || "utf-8").trim();
    let txt; try { txt = new TextDecoder(cs).decode(buf); } catch { txt = new TextDecoder("latin1").decode(buf); }
    return { status: r.status, ms: Date.now() - t, ct, final: r.url, txt };
  } catch (e) { return { status: 0, erro: String(e), ms: Date.now() - t, txt: "" }; }
}
const V = {jstj:"954f0ce6ad9dd8b980256b5f003fa814",jsta:"35fbbbf22e1bb1e680256f8e003ea931",jtrl:"33182fc732316039802565fa00497eec",jtrp:"56a6e7121657f91e80257cda00381fdf",jtrc:"8fe0e606d8f56b22802576c0005637dc",jtrg:"86c25a698e4e7cb7802579ec004d3832",jtre:"134973db04f39bf2802579bf005f080b",jtca:"170589492546a7fb802575c3004c6d7d",jtcn:"89d1c0288c2dd49c802575c8003279c7",jcon:"35fbbbf22e1bb1e680256f8e003ea931",cajp:"954f0ce6ad9dd8b980256b5f003fa814",atco1:"904714e45043f49b802565fa004a5fd7"};
const out = { bases: {}, testes: {} };
fs.mkdirSync("saida", { recursive: true });
for (const [b, v] of Object.entries(V)) {
  const q = encodeURIComponent(b.startsWith("jt") && (b==="jtca"||b==="jtcn") ? "acto administrativo" : "responsabilidade civil");
  const r = await get(`https://www.dgsi.pt/${b}.nsf/${v}?SearchView&Query=${q}&SearchOrder=1&Count=3`);
  fs.writeFileSync(`saida/pesq-${b}.html`, r.txt);
  const link = /href="(\/[a-z0-9]+\.nsf\/[0-9a-f]{32}\/[0-9a-f]{32})\?OpenDocument/i.exec(r.txt)?.[1];
  let doc = null;
  if (link) {
    const d = await get(`https://www.dgsi.pt${link}?OpenDocument`);
    fs.writeFileSync(`saida/doc-${b}.html`, d.txt);
    doc = { status: d.status, ms: d.ms, bytes: d.txt.length, link };
  }
  out.bases[b] = { status: r.status, ms: r.ms, found: /(\d+) documents returned; (\d+) found/.exec(r.txt)?.slice(1), doc };
}
const T = {
  campo_descritor: `https://www.dgsi.pt/jstj.nsf/${V.jstj}?SearchView&Query=${encodeURIComponent("[DESCRITORES] CONTAINS \"EXTINÇÃO DO POSTO DE TRABALHO\"")}&SearchOrder=1&Count=5`,
  campo_processo: `https://www.dgsi.pt/jstj.nsf/${V.jstj}?SearchView&Query=${encodeURIComponent("[PROCESSO] CONTAINS \"4048/22.6T8GMR.G1.S1\"")}&SearchOrder=1&Count=5`,
  frase: `https://www.dgsi.pt/jstj.nsf/${V.jstj}?SearchView&Query=${encodeURIComponent("\"abuso do direito\" AND arrendamento")}&SearchOrder=1&Count=5`,
  data: `https://www.dgsi.pt/jstj.nsf/${V.jstj}?SearchView&Query=${encodeURIComponent("despedimento AND [DATA] >= 01/01/2024")}&SearchOrder=1&Count=5`,
  data2: `https://www.dgsi.pt/jstj.nsf/${V.jstj}?SearchView&Query=${encodeURIComponent("despedimento AND FIELD DATA > 01-01-2024")}&SearchOrder=1&Count=5`,
  ordem4: `https://www.dgsi.pt/jstj.nsf/${V.jstj}?SearchView&Query=despedimento&SearchOrder=4&Count=5`,
  start: `https://www.dgsi.pt/jstj.nsf/${V.jstj}?SearchView&Query=despedimento&SearchOrder=1&Count=5&Start=6`,
  tc_pesquisa: `https://www.tribunalconstitucional.pt/tc/acordaos/`,
  tc_exemplo: `https://www.tribunalconstitucional.pt/tc/acordaos/20240001.html`,
};
for (const [k, u] of Object.entries(T)) {
  const r = await get(u);
  fs.writeFileSync(`saida/t-${k}.html`, r.txt);
  out.testes[k] = { status: r.status, ms: r.ms, final: r.final, found: /(\d+) documents returned; (\d+) found/.exec(r.txt)?.slice(1), bytes: r.txt.length };
}
fs.writeFileSync("saida/resumo.json", JSON.stringify(out, null, 1));
