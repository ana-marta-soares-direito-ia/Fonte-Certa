// Exploração das bases da DGSI e de outras fontes. Corre no GitHub Actions.
import fs from "node:fs";
const UA = { "User-Agent": "Mozilla/5.0 (Fonte Certa; pesquisa jurisprudencial)" };
const out = {};
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
const bases = ["jstj","jsta","jtrl","jtrp","jtrc","jtrg","jtre","jtca","jtcn","jcon","atco1","cajp","jdgpj"];
for (const b of bases) {
  const r = await get(`https://www.dgsi.pt/${b}.nsf?OpenDatabase`);
  const views = [...new Set([...r.txt.matchAll(/href="\/?(?:[a-z0-9]+\.nsf\/)?([0-9a-f]{32})\??[^"]*"/gi)].map(m => m[1]))];
  const named = [...new Set([...r.txt.matchAll(/href="([^"]*\.nsf\/[^"?]*)\?OpenView[^"]*"/gi)].map(m => m[1]))].slice(0, 12);
  const frames = [...r.txt.matchAll(/<frame[^>]+src="([^"]+)"/gi)].map(m => m[1]);
  out[b] = { status: r.status, ms: r.ms, final: r.final, views: views.slice(0, 10), named, frames, inicio: r.txt.slice(0, 1500) };
}
fs.mkdirSync("saida", { recursive: true });
fs.writeFileSync("saida/bases.json", JSON.stringify(out, null, 1));
