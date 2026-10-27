// Constrói o índice de legislação a partir do repositório legalize-pt
// (texto oficial do Diário da República, 1.ª série, com versões datadas).
// Uso: node indice-legislacao.mjs <pasta-legalize> <pasta-saida>
import fs from "node:fs";
import path from "node:path";
const [, , origem, destino] = process.argv;
fs.mkdirSync(destino, { recursive: true });

function frontmatter(txt) {
  if (!txt.startsWith("---")) return null;
  const fim = txt.indexOf("\n---", 3);
  if (fim < 0) return null;
  const o = {};
  for (const linha of txt.slice(4, fim).split("\n")) {
    const m = /^([a-z_]+):\s*(.*)$/.exec(linha);
    if (!m) continue;
    let v = m[2].trim();
    try { v = JSON.parse(v); } catch { v = v.replace(/^"|"$/g, ""); }
    o[m[1]] = v;
  }
  o.__corpo = fim + 4;
  return o;
}
function* ficheiros(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* ficheiros(p);
    else if (e.name.endsWith(".md")) yield p;
  }
}
const registos = [];
const estat = {};
for (const pasta of ["pt", "pt-20", "pt-30"]) {
  const base = path.join(origem, pasta);
  if (!fs.existsSync(base)) continue;
  for (const f of ficheiros(base)) {
    const txt = fs.readFileSync(f, "utf8");
    const fm = frontmatter(txt);
    if (!fm) continue;
    const rel = path.relative(origem, f).split(path.sep).join("/");
    const corpo = txt.slice(fm.__corpo);
    const artigos = (corpo.match(/^#{2,6} Artigo /gm) || []).length;
    const r = {
      i: fm.identifier || path.basename(f, ".md"),
      p: rel,
      t: fm.title || "",
      c: fm.short_title || "",
      k: fm.rank || "",
      n: fm.official_number || "",
      d: fm.publication_date || "",
      a: (fm.last_updated || "").slice(0, 10),
      s: fm.status || "",
      v: fm.surface === "cons" ? 1 : 0,
      r: (fm.summary || "").slice(0, 400),
      m: Array.isArray(fm.subjects) ? fm.subjects.slice(0, 25) : [],
      e: fm.consolidated_url || (fm.dre_link ? "https://diariodarepublica.pt" + fm.dre_link : ""),
      o: fm.source || "",
      x: artigos,
      z: Buffer.byteLength(txt),
    };
    registos.push(r);
    const chave = `${r.k}|${r.s}`;
    estat[chave] = (estat[chave] || 0) + 1;
  }
}
registos.sort((a, b) => (b.d || "").localeCompare(a.d || ""));
// Índice principal: diplomas em vigor (ou sem estado) — pesquisa de legislação aplicável.
const emVigor = registos.filter(r => r.s !== "repealed" && r.s !== "revoked" && r.s !== "expired");
const recentes = registos.filter(r => r.d >= "2024-01-01");
const enxuto = r => ({ i: r.i, p: r.p, t: r.t, c: r.c, k: r.k, n: r.n, d: r.d, a: r.a, s: r.s, v: r.v, r: r.r, m: r.m, e: r.e, x: r.x });
fs.writeFileSync(path.join(destino, "em-vigor.json"), JSON.stringify(emVigor.map(enxuto)));
fs.writeFileSync(path.join(destino, "recentes.json"), JSON.stringify(recentes.map(enxuto)));
// Acórdãos com força obrigatória geral e de uniformização publicados na 1.ª série.
const juris = registos.filter(r => /acordao|acórdão|ac-?tc|tribunal|uniformiz/i.test(r.k + " " + r.t));
fs.writeFileSync(path.join(destino, "jurisprudencia-dr.json"), JSON.stringify(juris.map(enxuto)));
fs.writeFileSync(path.join(destino, "estatisticas.json"), JSON.stringify({ total: registos.length, emVigor: emVigor.length, recentes: recentes.length, juris: juris.length, porTipoEstado: estat, gerado: new Date().toISOString() }, null, 1));
console.log(JSON.stringify({ total: registos.length, emVigor: emVigor.length, recentes: recentes.length, juris: juris.length }));
