// Filtro de confidencialidade: substitui identificadores por marcadores antes de qualquer envio.
// A correspondência entre marcadores e dados reais fica apenas neste navegador.

const NOMES_PROPRIOS = new Set(("ana antonio antónio joao joão jose josé maria manuel francisco luis luís carlos paulo pedro rui jorge miguel " +
  "nuno ricardo tiago sergio sérgio fernando mario mário alberto alexandre andre andré bruno daniel diogo eduardo fabio fábio filipe goncalo gonçalo " +
  "helder hélder hugo joaquim marco marcos nelson raul rodrigo samuel vitor vítor afonso duarte martim santiago tomas tomás henrique guilherme " +
  "leonor beatriz mariana matilde carolina ines inês sofia margarida madalena rita catarina joana patricia patrícia sandra susana sara sonia sónia " +
  "teresa isabel helena cristina paula marta filipa claudia cláudia carla raquel andreia vanessa diana daniela barbara bárbara luisa luísa laura " +
  "alice clara francisca lara camila benedita fernanda rosa lucia lúcia graca graça fatima fátima conceicao conceição natalia natália vera " +
  "artur armando augusto americo américo abel adelino agostinho alvaro álvaro amadeu aurelio aurélio baltazar bernardo caetano celso cesar césar " +
  "domingos emanuel ernesto fausto gaspar gil gustavo horacio horácio ivo jaime julio júlio leonel lourenco lourenço octavio octávio orlando " +
  "rafael renato rogerio rogério rolando silvio sílvio simao simão valter vasco xavier zeferino adriana alexandra amelia amélia anabela angela " +
  "ângela aurora cecilia cecília celia célia dalila edite elisa elsa emilia emília eva gabriela glória gloria irene jessica jéssica lidia lídia " +
  "liliana lurdes manuela mafalda marisa miriam monica mónica noemia noémia olga palmira regina rosario rosário silvia sílvia telma tania tânia " +
  "valeria valéria vitoria vitória zelia zélia").split(" "));

const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e"]);

const PADROES = [
  { tipo: "EMAIL", re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g },
  { tipo: "IBAN", re: /\bPT\s?50(?:\s?\d){21}\b/gi },
  { tipo: "CARTAO", re: /\b\d{8}\s?\d\s?[A-Z]{2}\s?\d\b/g },
  { tipo: "NISS", re: /\b(?:NISS|n\.?º?\s*de\s*seguran[çc]a\s*social)\s*[:n.º]*\s*\d{11}\b/gi },
  { tipo: "NIF", re: /\b(?:NIF|NIPC|contribuinte)\s*(?:n\.?\s*º?)?\s*[:.]?\s*\d{9}\b/gi },
  { tipo: "NIF", re: /\b[125689]\d{8}\b/g },
  { tipo: "TELEFONE", re: /(?:\+351\s?)?\b(?:9[1236]\d|2\d{2})\s?\d{3}\s?\d{3}\b/g },
  { tipo: "MATRICULA", re: /\b(?:[A-Z]{2}-\d{2}-[A-Z]{2}|\d{2}-[A-Z]{2}-\d{2}|\d{2}-\d{2}-[A-Z]{2}|[A-Z]{2}-\d{2}-\d{2})\b/g },
  { tipo: "CODIGO_POSTAL", re: /\b\d{4}-\d{3}\b(?:\s+[A-ZÀ-Ü][\wÀ-ü]+(?:\s+[A-ZÀ-Ü][\wÀ-ü]+)*)?/g },
  { tipo: "MORADA", re: /\b(?:Rua|R\.|Avenida|Av\.|Travessa|Tv\.|Largo|Praça|Pç\.|Estrada|Alameda|Beco|Calçada|Urbanização|Lugar|Quinta|Bairro)\s+[^,.;\n]{2,60}?(?:,?\s*n\.?\s*º?\s*\d+[A-Za-z]?(?:[,\s]+\d+\.?\s*º?\s*(?:andar|esq\.?|dto\.?|direito|esquerdo)?)?)?(?=[,.;\n]|$)/g },
  { tipo: "PROCESSO", re: /\b\d{1,6}\/\d{2}\.\d[A-Z0-9]{2,}(?:\.[A-Z0-9-]+)*\b/g },
  { tipo: "EMPRESA", re: /\b(?:[A-ZÀ-Ü][\wÀ-ü&'-]*\s+){0,4}[A-ZÀ-Ü][\wÀ-ü&'-]*,?\s+(?:Lda|Ltda|Unipessoal|SGPS|S\.\s?A|SA)\b\.?/g },
];

export function anonimizar(texto) {
  const mapa = new Map();
  const contagem = {};
  const marcador = (tipo, original) => {
    const chave = tipo + "|" + original.trim().toLowerCase();
    if (mapa.has(chave)) return mapa.get(chave).marcador;
    contagem[tipo] = (contagem[tipo] || 0) + 1;
    const m = `[${tipo.replace("_", " ")} ${contagem[tipo]}]`;
    mapa.set(chave, { marcador: m, original: original.trim(), tipo });
    return m;
  };
  let t = texto;
  for (const { tipo, re } of PADROES) t = t.replace(re, x => marcador(tipo, x));
  // Nomes de pessoas: sequências de palavras com maiúscula em que a primeira é um nome próprio conhecido,
  // ou tratamentos como "Sr." e "Dra." seguidos de nome.
  t = t.replace(/\b(?:(?:Sr|Sra|Dr|Dra|Eng|Enga|Prof|Profa)\.\s*)?[A-ZÀ-Ü][a-zà-ü]+(?:\s+(?:(?:de|da|do|das|dos|e)\s+)?[A-ZÀ-Ü][a-zà-ü]+){0,5}/g, (x, pos) => {
    const palavras = x.replace(/^(?:Sr|Sra|Dr|Dra|Eng|Enga|Prof|Profa)\.\s*/, "").split(/\s+/).filter(p => !PARTICULAS.has(p.toLowerCase()));
    const comTratamento = /^(?:Sr|Sra|Dr|Dra|Eng|Enga|Prof|Profa)\./.test(x);
    const primeiro = palavras[0]?.toLowerCase();
    if (comTratamento || (NOMES_PROPRIOS.has(primeiro) && palavras.length >= 1)) {
      // Evita tratar como nome uma palavra comum no início de frase (ex.: "Maria" só por si é aceite).
      return marcador("PESSOA", x);
    }
    return x;
  });
  const correspondencias = [...mapa.values()];
  return { texto: t, correspondencias };
}

// Repõe os dados reais num texto devolvido pela análise (só para apresentação neste navegador).
export function repor(texto, correspondencias) {
  if (!texto || !correspondencias?.length) return texto;
  let t = texto;
  for (const c of correspondencias) t = t.split(c.marcador).join(c.original);
  return t;
}

export function resumoAnonimizacao(correspondencias) {
  const porTipo = {};
  for (const c of correspondencias) porTipo[c.tipo] = (porTipo[c.tipo] || 0) + 1;
  const nomes = { PESSOA: "pessoas", EMPRESA: "empresas", NIF: "NIF", EMAIL: "endereços de email", TELEFONE: "telefones", MORADA: "moradas",
    CODIGO_POSTAL: "códigos postais", PROCESSO: "números de processo", IBAN: "IBAN", CARTAO: "cartões de cidadão", NISS: "NISS", MATRICULA: "matrículas" };
  return Object.entries(porTipo).map(([t, n]) => `${n} ${nomes[t] || t.toLowerCase()}`).join(", ");
}
