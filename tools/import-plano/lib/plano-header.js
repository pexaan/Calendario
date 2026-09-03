// Lê o cabeçalho "Detalhes da Disciplina" do plano de ensino (código, nome,
// modalidade e ano). É o que permite rodar o importador numa pasta inteira sem
// digitar --disc/--name/--year para cada PDF.

const LINHAS_CABECALHO = 20; // o cabeçalho vive nas primeiras linhas da página 1
const CODIGO = /\b([A-Z]{2,4}\d{3,4})\b/;

// preposições/artigos ficam em minúscula no meio do nome, como no disc-meta atual
const MINUSCULAS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o', 'as', 'os',
  'na', 'no', 'nas', 'nos', 'ao', 'aos', 'à', 'às', 'ou', 'por', 'com',
]);

// siglas que continuam em caixa alta quando o nome vem todo em maiúsculas
const SIGLAS = new Set(['EAD', 'TI', 'IA', 'AI', 'AED', 'PUC', 'TCC', 'SQL', 'BD', 'ODS']);

/**
 * Converte "TEOLOGIA, CIÊNCIAS EXATAS" em "Teologia, Ciências Exatas".
 * Nomes que já vêm com minúsculas são devolvidos intactos — o plano já os
 * escreveu como o professor quis.
 */
function titleCase(nome) {
  if (/\p{Ll}/u.test(nome)) return nome;

  return nome
    .split(/\s+/)
    .map((palavra, i) => {
      const prefixo = palavra.match(/^\P{L}*/u)[0];
      const sufixo = palavra.match(/\P{L}*$/u)[0];
      const nucleo = palavra.slice(prefixo.length, palavra.length - sufixo.length);
      if (!nucleo) return palavra;

      if (SIGLAS.has(nucleo)) return palavra;

      const minusculo = nucleo.toLowerCase();
      const final = i > 0 && MINUSCULAS.has(minusculo)
        ? minusculo
        : minusculo[0].toUpperCase() + minusculo.slice(1);

      return prefixo + final + sufixo;
    })
    .join(' ');
}

/** Ano mais citado no documento — serve de fallback para datas sem ano (ex.: "26/out"). */
function detectarAno(lines) {
  const contagem = new Map();
  for (const linha of lines) {
    for (const m of linha.text.matchAll(/\b(20[2-9]\d)\b/g)) {
      const ano = Number(m[1]);
      contagem.set(ano, (contagem.get(ano) ?? 0) + 1);
    }
  }
  if (contagem.size === 0) return null;
  // empate desempata pelo ano menor: cronograma tende a começar no ano corrente
  return [...contagem].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

function acharCodigo(cabecalho) {
  for (const re of [/^C[óo]digo\s+(.+)$/i, /^Plano de Ensino\s*[-–]\s*(.+)$/i]) {
    for (const texto of cabecalho) {
      const m = texto.match(re);
      const codigo = m?.[1].match(CODIGO)?.[1];
      if (codigo) return codigo;
    }
  }
  return null;
}

function acharNome(cabecalho) {
  for (const texto of cabecalho) {
    const m = texto.match(/^Nome\s+da\s+(.+)$/i);
    if (!m) continue;
    // o rótulo "Nome da Disciplina" quebra em duas linhas visuais; se o PDF
    // mantiver as duas juntas, "Disciplina" vem colado no começo do valor
    const nome = m[1].replace(/^Disciplina\s+/i, '').trim();
    if (nome) return titleCase(nome);
  }
  return null;
}

/**
 * Devolve { disc, name, modalidade, year } — cada campo pode vir null quando o
 * PDF não trouxer a informação, e aí quem chama decide (pedir na linha de
 * comando ou pular o arquivo).
 */
export function parseHeader(lines) {
  const cabecalho = lines.slice(0, LINHAS_CABECALHO).map((l) => l.text);

  return {
    disc: acharCodigo(cabecalho),
    name: acharNome(cabecalho),
    // a modalidade não tem campo próprio no plano: a marca é a sigla EAD
    // aparecer em algum lugar do documento (no nome ou na metodologia)
    modalidade: lines.some((l) => /\bEAD\b/i.test(l.text)) ? 'ead' : 'presencial',
    year: detectarAno(lines),
  };
}
