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
const testes = {
  ponte_pesq: P + encodeURIComponent("https://www.dgsi.pt/jstj.nsf/954f0ce6ad9dd8b980256b5f003fa814?SearchView&Query=despedimento&SearchOrder=4&Count=5"),
  ponte_doc: P + encodeURIComponent("https://www.dgsi.pt/jstj.nsf/954f0ce6ad9dd8b980256b5f003fa814/089cbe5224feb4e780258e1a00325135?OpenDocument"),
  ponte_tc: P + encodeURIComponent("https://www.tribunalconstitucional.pt/tc/acordaos/20240001.html"),
  ponte_proibido: P + encodeURIComponent("https://example.com/"),
  pesq_100: "https://www.dgsi.pt/jtrl.nsf/33182fc732316039802565fa00497eec?SearchView&Query=" + encodeURIComponent("despedimento AND justa AND causa") + "&SearchOrder=4&Count=100",
  pesq_or: "https://www.dgsi.pt/jtrp.nsf/56a6e7121657f91e80257cda00381fdf?SearchView&Query=" + encodeURIComponent("(arrendamento OR locação) AND despejo") + "&SearchOrder=4&Count=20",
  pesq_wild: "https://www.dgsi.pt/jstj.nsf/954f0ce6ad9dd8b980256b5f003fa814?SearchView&Query=" + encodeURIComponent("empreit* AND defeit*") + "&SearchOrder=4&Count=20",
  pesq_field_ano: "https://www.dgsi.pt/jstj.nsf/954f0ce6ad9dd8b980256b5f003fa814?SearchView&Query=" + encodeURIComponent("despedimento AND [DTAC] >= 01/01/2024") + "&SearchOrder=4&Count=5",
  pesq_frase: "https://www.dgsi.pt/jstj.nsf/954f0ce6ad9dd8b980256b5f003fa814?SearchView&Query=" + encodeURIComponent("\"abuso do direito\"") + "&SearchOrder=4&Count=5",
  pesq_rel: "https://www.dgsi.pt/jstj.nsf/954f0ce6ad9dd8b980256b5f003fa814?SearchView&Query=" + encodeURIComponent("abuso direito arrendamento") + "&SearchOrder=1&SearchMax=50&Count=10",
};
for (const [k, u] of Object.entries(testes)) {
  const r = await get(u);
  fs.writeFileSync(`saida/t-${k}.html`, r.txt);
  out[k] = { status: r.status, ms: r.ms, ct: r.ct, found: /(\d+) documents? (?:returned; (\d+) )?found/.exec(r.txt)?.slice(1), bytes: r.txt.length, inicio: r.txt.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 300) };
}
// Pesquisa do Tribunal Constitucional (formulário POST)
const form = new URLSearchParams({ pesquisatipo: "1", pesquisa: "arrendamento", acnum: "", acano: "", procnum: "", procano: "", seccao: "", especie: "", relator: "", datadia: "", datames: "", dataano: "", datadia2: "", datames2: "", dataano2: "", prepesquisa: "", submit: "Pesquisar" });
const tc = await get("https://www.tribunalconstitucional.pt/tc/acordaos/", { method: "POST", body: form, headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" } });
fs.writeFileSync("saida/t-tc_post.html", tc.txt);
out.tc_post = { status: tc.status, ms: tc.ms, bytes: tc.txt.length, links: [...new Set([...tc.txt.matchAll(/href="([^"]*acordaos\/\d{8}\.html)"/g)].map(m => m[1]))].slice(0, 8) };
const tcg = await get("https://www.tribunalconstitucional.pt/tc/acordaos/?pesquisa=arrendamento");
out.tc_get = { status: tcg.status, links: [...new Set([...tcg.txt.matchAll(/href="([^"]*acordaos\/\d{8}\.html)"/g)].map(m => m[1]))].slice(0, 8) };
fs.writeFileSync("saida/resumo.json", JSON.stringify(out, null, 1));
