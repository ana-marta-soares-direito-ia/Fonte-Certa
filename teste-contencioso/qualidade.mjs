// Teste de qualidade com o modelo real (Qwen3 4B num servidor local compatível) na app publicada.
// Uso: node ferramentas/qualidade.mjs <url-base> <codigo> <caso> <servidor> <saida.md>
const { chromium } = await import("playwright").catch(() => import("/opt/npm-tools/node_modules/playwright/index.mjs"));
import fs from "fs";
const [BASE, CODIGO, CASO, SERVIDOR, SAIDA, MODELO = "", CONTEXTO = ""] = process.argv.slice(2);
const caso = JSON.parse(fs.readFileSync(new URL("./casos/casos.json", import.meta.url)))[CASO];
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const erros = []; p.on("pageerror", e => erros.push(e.message));
const estat = []; p.on("console", m => { if (m.text().startsWith("[ia]")) estat.push(m.text()); });
// Os pedidos ao modelo local passam pelo Node (evita as restrições do navegador a endereços locais e os limites de tempo)
import http from "http";
const pedirLocal = (url, corpo) => new Promise((ok, falha) => {
  const u = new URL(url);
  const r = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: "POST", headers: { "Content-Type": "application/json" }, timeout: 0 }, res => { let d = ""; res.on("data", c => d += c); res.on("end", () => ok({ status: res.statusCode, d })); });
  r.on("error", falha); r.setTimeout(0); r.end(corpo);
});
await p.route(/127\.0\.0\.1:(11434|8080)/, async route => {
  const req = route.request();
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST" } });
  try { const x = await pedirLocal(req.url(), req.postData()); await route.fulfill({ status: x.status, body: x.d, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } }); }
  catch (e) { await route.fulfill({ status: 502, body: JSON.stringify({ erro: String(e) }) }); }
});
await p.goto(`${BASE}/app/?teste&semsw${SERVIDOR ? "&servidor=" + encodeURIComponent(SERVIDOR) : ""}${MODELO ? "&modelo=" + encodeURIComponent(MODELO) : ""}${CONTEXTO ? "&contexto=" + CONTEXTO : ""}`); await p.waitForTimeout(1500);
await p.click(`#jurisdicoes .chip[data-id="${caso.jurisdicao}"]`);
for (const [k, v] of Object.entries(caso)) {
  if (["jurisdicao", "equipa", "agentes"].includes(k)) continue;
  const sel = `#ficha [name="${k}"]`;
  const tipo = await p.$eval(sel, e => e.tagName + ":" + (e.type || "")).catch(() => null);
  if (!tipo) continue;
  if (tipo.startsWith("SELECT")) { if (v) await p.selectOption(sel, v); }
  else if (tipo.endsWith("checkbox")) { if (v) await p.check(sel); }
  else await p.fill(sel, String(v));
}
if (caso.equipa) await p.click(`.equipa-btn:nth-child(${["avaliar", "propor", "defender", "audiencia", "recorrer", "completa"].indexOf(caso.equipa) + 1})`);
else await p.evaluate((ids) => { window.equipa.estado.selecionados = new Set(ids); }, caso.agentes);
await p.waitForTimeout(500);
const motor = await p.textContent("#motor");
const t0 = Date.now();
await p.evaluate(() => window.equipa.reunir());
await p.waitForSelector("#exportar:not([hidden])", { timeout: 5400000 });
const r = await p.evaluate(() => ({ res: window.equipa.estado.resultados, ver: window.equipa.estado.verificacao }));
const min = ((Date.now() - t0) / 60000).toFixed(1);
let md = `# Caso ${CASO}, modelo ${SERVIDOR ? (MODELO || "4B") : "nuvem"} (${min} min)\n\n## Ficha\n\`\`\`\n${JSON.stringify(caso, null, 1)}\n\`\`\`\n\n## Motor\n${motor}\n\n`;
for (const x of r.res) md += `\n---\n# AGENTE: ${x.nome}\n\n${x.texto}\n`;
md += `\n---\n# VERIFICAÇÃO\n${r.ver.map(v => `- ${v.estado}: ${v.tipo === "artigo" ? v.sigla + " " + v.numero : v.processo} (${v.agentes?.join(", ")})`).join("\n")}\n\nErros JS: ${erros.join(" | ") || "nenhum"}\n\n# ESTATÍSTICAS DO MODELO\n${estat.join("\n")}\n`;
fs.writeFileSync(SAIDA, md);
await b.close();
console.log("concluído", CASO, min, "min");
