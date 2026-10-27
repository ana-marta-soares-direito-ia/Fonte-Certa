import fs from "node:fs";
const UA = { "User-Agent": "Mozilla/5.0 (Fonte Certa; pesquisa jurisprudencial)" };
async function get(url, init = {}) {
  const t = Date.now();
  try {
    const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(40000), ...init });
    const buf = new Uint8Array(await r.arrayBuffer());
    const ct = r.headers.get("content-type") || "";
    const cs = (/charset=([^;]+)/i.exec(ct)?.[1] || "utf-8").trim();
    let txt; try { txt = new TextDecoder(cs).decode(buf); } catch { txt = new TextDecoder("latin1").decode(buf); }
    return { status: r.status, ms: Date.now() - t, ct, final: r.url, txt, h: Object.fromEntries(r.headers) };
  } catch (e) { return { status: 0, erro: String(e), ms: Date.now() - t, txt: "" }; }
}
fs.mkdirSync("saida", { recursive: true });
const out = {};
const P = "https://fonte-certa.pages.dev/api/fonte?u=";
await new Promise(r => setTimeout(r, 100000));
const S = "https://www.dgsi.pt/jstj.nsf/954f0ce6ad9dd8b980256b5f003fa814?SearchView&Query=";
const testes = {
  ponte_pesq: P + encodeURIComponent(S + "despedimento&SearchOrder=3&Count=5"),
  ponte_doc: P + encodeURIComponent("https://www.dgsi.pt/jstj.nsf/954f0ce6ad9dd8b980256b5f003fa814/089cbe5224feb4e780258e1a00325135?OpenDocument"),
  ponte_proibido: P + encodeURIComponent("https://example.com/"),
  ordem2: S + encodeURIComponent("abuso do direito") + "&SearchOrder=2&Count=5",
  ordem3: S + encodeURIComponent("abuso do direito") + "&SearchOrder=3&Count=5",
  ordem3_frase: S + encodeURIComponent('"abuso do direito" AND arrendamento') + "&SearchOrder=3&Count=5",
  ou_sem_parenteses: S + encodeURIComponent("arrendamento OR locação") + "&SearchOrder=3&Count=5",
  e_minusculo: S + encodeURIComponent("arrendamento and despejo") + "&SearchOrder=3&Count=5",
  count250: S + encodeURIComponent("contrato") + "&SearchOrder=3&Count=250",
  start300: S + encodeURIComponent("contrato") + "&SearchOrder=3&Count=50&Start=300",
  searchmax: S + encodeURIComponent("contrato") + "&SearchOrder=3&SearchMax=2000&Count=10",
  campo_sumario: S + encodeURIComponent('[SUMÁRIO] CONTAINS "justa causa"') + "&SearchOrder=3&Count=5",
};
for (const [k, u] of Object.entries(testes)) {
  const r = await get(u);
  fs.writeFileSync(`saida/t-${k}.html`, r.txt);
  out[k] = { status: r.status, ms: r.ms, ct: r.ct, found: /(\d+) documents? (?:returned; (\d+) )?found/.exec(r.txt)?.slice(1), bytes: r.txt.length, inicio: r.txt.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 300) };
}
fs.writeFileSync("saida/resumo.json", JSON.stringify(out, null, 1));
