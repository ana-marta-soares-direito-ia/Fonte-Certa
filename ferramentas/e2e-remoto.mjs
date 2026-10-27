// Teste completo da app numa publicação real (corre no GitHub Actions).
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire("/tmp/pw/node_modules/");
const { chromium } = require("playwright-core");

const [, , base, pasta] = process.argv;
fs.mkdirSync(pasta, { recursive: true });
const rel = { inicio: new Date().toISOString(), erros: [], pesquisas: {}, acordao: null, diploma: null, verificar: null };
const browser = await chromium.launch({ channel: "chrome" });

async function nova(largura = 1360, altura = 900) {
  const ctx = await browser.newContext({ viewport: { width: largura, height: altura }, locale: "pt-PT" });
  const p = await ctx.newPage();
  p.on("console", m => { if (m.type() === "error") rel.erros.push("consola: " + m.text().slice(0, 300)); });
  p.on("pageerror", e => rel.erros.push("página: " + e.message));
  p.on("response", r => { if (r.status() >= 400) rel.erros.push(`resposta ${r.status()}: ${r.url().slice(0, 220)}`); });
  p.on("requestfailed", r => rel.erros.push("pedido falhado: " + r.url().slice(0, 160) + " " + (r.failure()?.errorText || "")));
  return p;
}

const p = await nova();
await p.goto(base + "/#/", { waitUntil: "networkidle" });
await p.screenshot({ path: `${pasta}/01-inicio.png`, fullPage: true });

const perguntas = {
  laboral: "Despedimento por extinção do posto de trabalho sem critérios de selecção",
  arrendamento: "Resolução do contrato de arrendamento por falta de pagamento de rendas",
  publica: "Exclusão de proposta por preço anormalmente baixo sem audiência prévia do concorrente",
  civil: "Responsabilidade do empreiteiro por defeitos da obra",
};
let n = 2;
for (const [k, q] of Object.entries(perguntas)) {
  const t0 = Date.now();
  await p.goto(base + "/#/", { waitUntil: "networkidle" });
  await p.fill("#pergunta", q);
  await p.click("#botao-pesquisar");
  try { await p.waitForSelector(".titulo-resultados", { timeout: 120000 }); } catch (e) { rel.erros.push(`pesquisa ${k}: ${e.message}`); }
  const dados = await p.evaluate(async () => {
    const { estado } = await import("/js/estado.js");
    const r = estado.ultimaPesquisa;
    if (!r) return null;
    return {
      consultas: r.consultas, bases: r.bases,
      juris: r.juris.slice(0, 12).map(j => ({ base: j.base, data: j.data, processo: j.processo, desc: j.descritores.slice(0, 5), sumario: (j.sumarioCurto || "").slice(0, 160) })),
      nJuris: r.juris.length, nLeg: r.legislacao.length, normas: r.normas.map(x => `${x.diploma.c || x.diploma.t}: ${x.artigos.map(a => a.numero).join(", ")}`),
      leg: r.legislacao.slice(0, 6).map(x => x.c || x.t.slice(0, 80)), recentes: r.recentes.slice(0, 5).map(x => `${x.d} ${(x.c || x.t).slice(0, 80)}`),
      alertas: r.alertas.map(x => `${x.d} ${x.t.slice(0, 90)}`),
    };
  });
  rel.pesquisas[k] = { pergunta: q, segundos: Math.round((Date.now() - t0) / 1000), ...dados };
  await p.screenshot({ path: `${pasta}/${String(n++).padStart(2, "0")}-resultados-${k}.png`, fullPage: true });
}

// Acórdão: abre o primeiro resultado da pesquisa laboral.
try {
  await p.goto(base + "/#/", { waitUntil: "networkidle" });
  await p.fill("#pergunta", perguntas.laboral);
  await p.click("#botao-pesquisar");
  await p.waitForSelector(".acordao-ligacao", { timeout: 120000 });
  await p.click(".acordao-ligacao >> nth=0");
  await p.waitForSelector(".cabecalho-acordao", { timeout: 60000 });
  rel.acordao = await p.evaluate(() => ({ url: location.hash, sumario: document.querySelectorAll(".paragrafos.sumario li").length, texto: document.querySelectorAll(".bloco-texto .paragrafos li").length, titulo: document.querySelector(".cabecalho-acordao h1")?.textContent, meta: [...document.querySelectorAll(".metadados div")].map(d => d.textContent).join(" | ") }));
  await p.screenshot({ path: `${pasta}/10-acordao.png`, fullPage: false });
  await p.evaluate(() => window.scrollTo(0, 1400));
  await p.screenshot({ path: `${pasta}/11-acordao-texto.png`, fullPage: false });
} catch (e) { rel.erros.push("acórdão: " + e.message); }

// Diploma: Código do Trabalho, art. 368.º, na versão de 1 de Janeiro de 2015.
try {
  const r = await p.evaluate(async () => {
    const L = await import("/js/fontes/legislacao.js");
    const d = await L.encontrarDiploma("CT");
    return d?.p;
  });
  await p.goto(base + `/#/diploma?p=${encodeURIComponent(r)}&art=368&data=2015-01-01`, { waitUntil: "networkidle" });
  await p.waitForSelector(".artigo", { timeout: 60000 });
  await p.waitForTimeout(800);
  rel.diploma = await p.evaluate(() => ({ versao: document.querySelector(".versao-aplicavel")?.textContent, artigos: document.querySelectorAll(".artigo").length, pedido: document.querySelector(".artigo.pedido h2")?.textContent, texto: document.querySelector(".artigo.pedido")?.textContent.slice(0, 400), versoes: document.querySelectorAll(".lista-versoes li").length }));
  await p.screenshot({ path: `${pasta}/12-diploma.png`, fullPage: false });
} catch (e) { rel.erros.push("diploma: " + e.message); }

// Verificador de citações.
try {
  await p.goto(base + "/#/verificar", { waitUntil: "networkidle" });
  await p.fill("#texto-peca", "Como decidiu o Ac. do STJ de 10.03.2025, proc. 4048/22.6T8GMR.G1.S1, o despedimento por extinção do posto de trabalho exige critérios objectivos, nos termos do artigo 368.º do Código do Trabalho e do art. 798.º do CC. O Acórdão do Tribunal Constitucional n.º 1/2024 é aqui irrelevante, tal como o Acórdão do Tribunal Constitucional n.º 9876/2024. Invoca a ré o Ac. da Relação de Lisboa no proc. 9999/99.9TBXYZ.L1-4, bem como o artigo 9999.º do Código Civil.");
  await p.fill("#data-factos", "2023-05-10");
  await p.click(".form-verificar button[type=submit]");
  await p.waitForFunction(() => !document.querySelector(".citacao.a-verificar"), null, { timeout: 120000 });
  rel.verificar = await p.evaluate(() => [...document.querySelectorAll(".citacao")].map(li => ({ classe: li.className, alvo: li.querySelector(".citacao-alvo")?.textContent, detalhe: li.querySelector(".citacao-detalhe")?.textContent.slice(0, 220) })));
  await p.screenshot({ path: `${pasta}/13-verificar.png`, fullPage: true });
} catch (e) { rel.erros.push("verificar: " + e.message); }

// ---------- Análise com IA (modelo incluído) ----------
rel.ia = {};
try {
  await p.goto(base + "/#/", { waitUntil: "networkidle" });
  rel.ia.sondaModelos = await p.evaluate(async () => {
    const out = {};
    for (const modelo of ["principal", "alternativo"]) {
      const t0 = performance.now();
      const r = await fetch("/api/ia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sistema: "Responde só com JSON.", mensagem: 'Devolve {"ok": true, "lingua": "português europeu", "frase": "uma frase curta sobre o princípio da boa-fé"}', maxTokens: 300, modelo }) });
      out[modelo] = { estado: r.status, ms: Math.round(performance.now() - t0), corpo: (await r.text()).slice(0, 400) };
    }
    return out;
  });
  // Ficha do caso
  await p.click(".caso-detalhes summary");
  await p.selectOption("#c-posicao", "Trabalhador");
  await p.selectOption("#c-instancia", "1.ª instância");
  await p.fill("#c-meio", "acção de impugnação judicial da regularidade e licitude do despedimento");
  await p.fill("#c-data", "2024-02-15");
  await p.fill("#c-factos", "A trabalhadora Maria Fernanda Costa, NIF 234567890, residente na Rua do Carmo, n.º 5, 1200-093 Lisboa, era uma de três técnicas administrativas da empresa Logística Atlântica, Lda., com funções idênticas. A empresa extinguiu o posto de trabalho dela alegando redução de encomendas, mas na comunicação não indicou os critérios usados para escolher o seu posto e não o das outras duas colegas, uma das quais tinha menor antiguidade. A compensação foi paga e devolvida pela trabalhadora no prazo de dez dias.");
  await p.fill("#c-pretensao", "declaração de ilicitude do despedimento, reintegração e retribuições intercalares");
  await p.click(".form-caso button[type=submit]");
  await p.waitForSelector("#c-anonimizado");
  rel.ia.anonimizado = await p.inputValue("#c-anonimizado");
  await p.screenshot({ path: `${pasta}/30-anonimizacao.png`, fullPage: true });
  await p.click("text=Confirmar texto");
  // Pesquisa com plano feito pela IA
  const t0 = Date.now();
  await p.fill("#pergunta", "Despedimento por extinção do posto de trabalho sem indicação dos critérios de selecção entre trabalhadores com funções idênticas");
  await p.click("#botao-pesquisar");
  await p.waitForSelector(".titulo-resultados", { timeout: 180000 });
  rel.ia.pesquisa = await p.evaluate(async () => {
    const { estado } = await import("/js/estado.js");
    const r = estado.ultimaPesquisa;
    return { plano: r.plano, consultas: r.consultas, normas: r.normas.map(n => `${n.diploma.c || n.diploma.t}: ${n.artigos.map(a => a.numero + " " + a.epigrafe).join("; ")}`), primeiros: r.juris.slice(0, 6).map(j => `${j.base} ${j.data} ${j.processo} ${j.descritores.slice(0, 3).join("; ")}`) };
  });
  rel.ia.pesquisa.segundos = Math.round((Date.now() - t0) / 1000);
  await p.screenshot({ path: `${pasta}/31-pesquisa-ia.png`, fullPage: true });
  // Mapa de correntes
  const tm = Date.now();
  await p.click("text=Mapa de correntes");
  await p.waitForSelector(".mapa, .aviso-erro", { timeout: 180000 });
  rel.ia.mapa = { segundos: Math.round((Date.now() - tm) / 1000), texto: (await p.textContent("#mapa-correntes"))?.slice(0, 1500), erro: await p.textContent(".aviso-erro").catch(() => null) };
  await p.screenshot({ path: `${pasta}/32-mapa.png`, fullPage: false });
  // Parecer do primeiro acórdão com texto integral
  await p.click(".acordao-ligacao >> nth=0");
  await p.waitForSelector(".cabecalho-acordao", { timeout: 60000 });
  const tp = Date.now();
  await p.click("text=Analisar face ao caso");
  await p.waitForSelector(".parecer, .aviso-erro", { timeout: 240000 });
  rel.ia.parecer = {
    segundos: Math.round((Date.now() - tp) / 1000),
    acordao: await p.textContent(".cabecalho-acordao h1"),
    texto: (await p.textContent(".lateral-parecer"))?.slice(0, 3000),
    favoraveis: await p.locator(".ponto-favoravel").count(),
    desfavoraveis: await p.locator(".ponto-desfavoravel").count(),
    marcas: await p.locator("mark").count(),
    erro: await p.textContent(".aviso-erro").catch(() => null),
  };
  await p.screenshot({ path: `${pasta}/33-parecer.png`, fullPage: false });
  if (rel.ia.parecer.favoraveis + rel.ia.parecer.desfavoraveis) {
    await p.click(".ponto .ref >> nth=0");
    await p.waitForTimeout(900);
    await p.screenshot({ path: `${pasta}/34-parecer-salto.png`, fullPage: false });
  }
  // Confirmação de uma citação
  await p.goto(base + "/#/verificar", { waitUntil: "networkidle" });
  await p.fill("#texto-peca", "Como decidiu o STJ no proc. 4048/22.6T8GMR.G1.S1, a comunicação do despedimento por extinção do posto de trabalho tem de indicar os motivos e os critérios de selecção, sob pena de ilicitude.");
  await p.click(".form-verificar button[type=submit]");
  await p.waitForSelector("text=Confirmar se sustenta a afirmação", { timeout: 120000 });
  const tc = Date.now();
  await p.click("text=Confirmar se sustenta a afirmação >> nth=0");
  await p.waitForSelector(".confirmacao, .aviso-erro", { timeout: 180000 });
  rel.ia.confirmacao = { segundos: Math.round((Date.now() - tc) / 1000), texto: (await p.textContent(".confirmacao").catch(() => ""))?.slice(0, 800), erro: await p.textContent(".aviso-erro").catch(() => null) };
  await p.screenshot({ path: `${pasta}/35-confirmacao.png`, fullPage: true });
} catch (e) { rel.erros.push("ia: " + e.message); await p.screenshot({ path: `${pasta}/39-ia-erro.png`, fullPage: true }).catch(() => {}); }

// Telemóvel.
const m = await nova(390, 844);
await m.goto(base + "/#/", { waitUntil: "networkidle" });
await m.screenshot({ path: `${pasta}/20-movel-inicio.png` });
await m.fill("#pergunta", perguntas.arrendamento);
await m.click("#botao-pesquisar");
await m.waitForSelector(".titulo-resultados", { timeout: 120000 }).catch(() => {});
await m.screenshot({ path: `${pasta}/21-movel-resultados.png`, fullPage: true });

rel.fim = new Date().toISOString();
fs.writeFileSync(`${pasta}/relatorio.json`, JSON.stringify(rel, null, 1));
await browser.close();
