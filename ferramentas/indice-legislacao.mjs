// Constrói o índice de legislação a partir do repositório legalize-pt
// (texto oficial do Diário da República, 1.ª série, com versões datadas).
// Uso: node indice-legislacao.mjs <pasta-legalize> <pasta-saida>
import fs from "node:fs";
import path from "node:path";
const [, , origem, destino, ficheiroHistorico] = process.argv;
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
// Os ficheiros publicados têm de ficar abaixo de 20 MB (limite do alojamento).
const PRIMARIOS = new Set(["lei", "lei-organica", "lei-constitucional", "decreto-lei", "decreto-legislativo-regional",
  "decreto-regulamentar", "decreto-regulamentar-regional", "decreto-aprovacao-constituicao", "decreto", "regimento",
  "acordao-doutrinario", "assento", "acordao"]);
const ehJuris = r => /acordao|assento|tribunal|uniformiz/i.test(r.k) || /^Acórdão|Tribunal Constitucional|uniformiza/i.test(r.t);
const enxuto = r => ({ i: r.i, p: r.p, t: r.t, c: r.c, k: r.k, n: r.n, d: r.d, a: r.a, s: r.s, v: r.v,
  r: (r.r || "").slice(0, 280), m: (r.m || []).slice(0, 12), e: r.e, x: r.x });
// Um registo por linha: o histórico do git guarda só as linhas alteradas em cada actualização.
const jsonPorLinhas = lista => "[\n" + lista.map(x => JSON.stringify(x)).join(",\n") + "\n]\n";
const escrever = (nome, lista) => {
  const json = jsonPorLinhas(lista.map(enxuto));
  fs.writeFileSync(path.join(destino, nome), json);
  return { nome, n: lista.length, mb: +(json.length / 1e6).toFixed(2) };
};
const ficheirosGerados = [];
// 1. Diplomas principais (leis, decretos-leis, códigos), em vigor ou revogados.
const principais = registos.filter(r => PRIMARIOS.has(r.k) || r.v === 1);
// Divide em partes de até 15 000 registos.
for (let i = 0, parte = 1; i < principais.length; i += 15000, parte++)
  ficheirosGerados.push({ grupo: "principal", ...escrever(`principal-${parte}.json`, principais.slice(i, i + 15000)) });
// 2. Restantes actos (portarias, despachos, resoluções, declarações) em vigor, por partes.
const outros = registos.filter(r => !PRIMARIOS.has(r.k) && r.v !== 1 && r.s === "in_force");
for (let i = 0, parte = 1; i < outros.length; i += 15000, parte++)
  ficheirosGerados.push({ grupo: "outros", ...escrever(`outros-${parte}.json`, outros.slice(i, i + 15000)) });
// 3. Publicações dos últimos 30 meses (todos os tipos), para o separador do Diário da República.
const limite = new Date(Date.now() - 913 * 86400000).toISOString().slice(0, 10);
ficheirosGerados.push({ grupo: "recentes", ...escrever("recentes.json", registos.filter(r => r.d >= limite)) });
// 4. Jurisprudência publicada na 1.ª série (força obrigatória geral, uniformização).
ficheirosGerados.push({ grupo: "juris", ...escrever("jurisprudencia-dr.json", registos.filter(ehJuris)) });
// 5. Versões de cada diploma (data de entrada em vigor e commit), divididas por pasta de ano.
if (ficheiroHistorico && fs.existsSync(ficheiroHistorico)) {
  const versoes = new Map();
  let sha = "", data = "";
  for (const linha of fs.readFileSync(ficheiroHistorico, "utf8").split("\n")) {
    if (!linha) continue;
    if (linha.startsWith("@")) { [sha, data] = linha.slice(1).split(" "); continue; }
    if (!versoes.has(linha)) versoes.set(linha, []);
    versoes.get(linha).push([data, sha]);
  }
  const pastaVersoes = path.join(destino, "versoes");
  fs.mkdirSync(pastaVersoes, { recursive: true });
  const porPasta = {};
  for (const [p, lista] of versoes) {
    const chave = p.split("/").slice(0, -1).join("-");
    (porPasta[chave] ||= {})[p] = lista.sort((a, b) => b[0].localeCompare(a[0]));
  }
  for (const [chave, obj] of Object.entries(porPasta)) {
    const linhas = Object.keys(obj).sort().map(k => JSON.stringify(k) + ":" + JSON.stringify(obj[k]));
    fs.writeFileSync(path.join(pastaVersoes, chave + ".json"), "{\n" + linhas.join(",\n") + "\n}\n");
  }
  ficheirosGerados.push({ grupo: "versoes", nome: "versoes/", n: versoes.size, pastas: Object.keys(porPasta).length });
}
const manifesto = { gerado: new Date().toISOString(), total: registos.length, ficheiros: ficheirosGerados, porTipoEstado: estat };
fs.writeFileSync(path.join(destino, "manifesto.json"), JSON.stringify(manifesto, null, 1));
console.log(JSON.stringify(ficheirosGerados));
