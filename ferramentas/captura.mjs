// Capturas de ecrã de páginas públicas (corre no GitHub Actions).
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire("/tmp/pw/node_modules/");
const { chromium } = require("playwright-core");
const pasta = "saida-captura";
fs.mkdirSync(pasta, { recursive: true });
const b = await chromium.launch({ channel: "chrome" });
const alvos = [
  ["prompts-computador", "https://ana-marta-soares-direito-ia.github.io/construtor-prompts/", 1360, 900],
  ["prompts-movel", "https://ana-marta-soares-direito-ia.github.io/construtor-prompts/", 390, 844],
];
const info = {};
for (const [nome, url, w, h] of alvos) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: "pt-PT", deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  try {
    await p.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    await p.waitForTimeout(2500);
    await p.screenshot({ path: `${pasta}/${nome}.png` });
    await p.screenshot({ path: `${pasta}/${nome}-completo.png`, fullPage: true });
    info[nome] = { titulo: await p.title(), texto: (await p.textContent("body")).replace(/\s+/g, " ").slice(0, 3000), botoes: await p.locator("button, a").allTextContents() };
  } catch (e) { info[nome] = { erro: String(e) }; }
  await ctx.close();
}
fs.writeFileSync(`${pasta}/info.json`, JSON.stringify(info, null, 1));
await b.close();
