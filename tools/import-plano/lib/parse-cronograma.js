const MESES = {
  janeiro: 1, fevereiro: 2, março: 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

const MESES_ABREV = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

const ABREV_KEYS = Object.keys(MESES_ABREV).join('|');
const MES_NOMES = Object.keys(MESES).join('|');
const DIA_SEMANA = '(?:segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)(?:[-\\s]?feira)?|(?:seg|ter|qua|qui|sex|s[áa]b|dom)(?![a-zç])';

const HEADER_OR_NOISE = [
  /^data\b/i,
  /^conte[uú]do/i,
  /^cronograma\b/i,
  /^encontros?\b/i,
  /^p[aá]gina\s*\d+/i,
  /^\d{1,3}$/,
  /^bibliografia/i,
  /^material\s+de\s+apoio/i,
  /^metodologia\b/i,
  /^ementa\b/i,
];

// Formatos de data aceitos. Cada um é buscado em QUALQUER posição da linha —
// planos de ensino frequentemente colocam várias linhas do cronograma numa
// mesma linha de texto extraída, então a linha é fatiada em cada data achada.
const DATE_TOKENS = [
  // intervalo com o primeiro dia sem mês: "26 a 29/10", "27, 28 e 29 de outubro de 2026"
  { kind: 'bareRange', re: new RegExp(`(\\d{1,2})\\s*(?:a|até|-|–)\\s*(\\d{1,2})\\s*\\/\\s*(\\d{1,2})(?:\\s*\\/\\s*(\\d{2,4}))?`, 'gi') },
  // dd/mm/aaaa ou dd/mm
  { kind: 'numeric', re: /(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?/g },
  // dd/mmm (mês abreviado): "10/ago", "05/nov"
  { kind: 'abbrev', re: new RegExp(`(\\d{1,2})\\s*\\/\\s*(${ABREV_KEYS})\\.?`, 'gi') },
  // "11 de agosto de 2026"
  { kind: 'named', re: new RegExp(`(\\d{1,2})\\s+de\\s+(${MES_NOMES})(?:\\s+de\\s+(\\d{4}))?`, 'gi') },
];

// contém palavra de avaliação, mas é claramente sobre o sistema de notas —
// não é uma prova marcada naquele dia
const NAO_E_PROVA = [
  /crit[eé]rios?\s+de\s+avalia/i,
  /(?:sistema|formas?|processo|m[eé]todos?)\s+de\s+avalia/i,
];

// contém palavra de avaliação mas provavelmente não é a prova em si
// (devolutiva/correção/revisão da prova são aulas) — cai para revisão manual
const AVALIACAO_AMBIGUA = [/\bdevolutiva\b/i, /\bcorre[cç][ãa]o\b/i, /\brevis[ãa]o\b/i];

const KEYWORDS = {
  feriado: [/\bferiado\b/i, /ponto\s+facultativo/i],
  aed: [/\baed\b/i, /atividade\s+externa\s+(?:à|a)\s+disciplina/i],
  avaliacao: [/\bavalia[cç][ãa]o\b/i, /\bprova\b/i, /\bexame\b/i, /\bn[12]\b/i, /\bp[1-4]\b/i],
};

const MAX_CONTINUATION_PARTS = 4;
const MAX_ROW_TEXT_LENGTH = 300;

function normalizeYear(y, fallbackYear) {
  if (!y) return fallbackYear;
  const n = Number(y);
  return n < 100 ? 2000 + n : n;
}

function toISODate(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function resolveToken(kind, m, fallbackYear) {
  if (kind === 'bareRange') {
    const month = Number(m[3]);
    const year = normalizeYear(m[4], fallbackYear);
    return { date: toISODate(year, month, Number(m[1])), endDate: toISODate(year, month, Number(m[2])) };
  }
  if (kind === 'numeric') {
    return { date: toISODate(normalizeYear(m[3], fallbackYear), Number(m[2]), Number(m[1])), endDate: null };
  }
  if (kind === 'abbrev') {
    const month = MESES_ABREV[m[2].toLowerCase()];
    return { date: month ? toISODate(fallbackYear, month, Number(m[1])) : null, endDate: null };
  }
  const month = MESES[m[2].toLowerCase()];
  return { date: month ? toISODate(normalizeYear(m[3], fallbackYear), month, Number(m[1])) : null, endDate: null };
}

/** Acha todas as datas de uma linha, sem sobreposição, na ordem em que aparecem. */
function findAllDates(text, fallbackYear) {
  const hits = [];
  for (const { kind, re } of DATE_TOKENS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const overlaps = hits.some((h) => m.index < h.index + h.length && m.index + m[0].length > h.index);
      if (overlaps) continue;
      const { date, endDate } = resolveToken(kind, m, fallbackYear);
      if (!date) continue;
      hits.push({ date, endDate, index: m.index, length: m[0].length });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

const LEADING_JUNK = new RegExp(`^\\s*(?:\\d{1,3}\\s*[.\\-)]?\\s*)?(?:${DIA_SEMANA})?\\.?[\\s.:,;\\-–]*`, 'i');
const TRAILING_ROW_NUMBER = /[\s.;,-]+\d{1,3}\.?$/;

function cleanSegment(text) {
  return text
    .replace(LEADING_JUNK, '')
    .replace(TRAILING_ROW_NUMBER, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.:,;\-–]+/, '')
    .trim();
}

/** Confiança pelo que vem ANTES da data na linha (número de encontro é ok). */
function confidenceFor(text, index) {
  const before = text.slice(0, index);
  if (/^\s*(?:\d{1,3}\s*[.\-)]?\s*)?$/.test(before)) return 'alta';
  if (new RegExp(`^\\s*(?:\\d{1,3}\\s*[.\\-)]?\\s*)?(?:${DIA_SEMANA})[\\s.:,;\\-–]*$`, 'i').test(before)) return 'alta';
  return 'baixa';
}

export function classifyType(text) {
  if (NAO_E_PROVA.some((re) => re.test(text))) return 'aula';
  for (const [type, regexes] of Object.entries(KEYWORDS)) {
    if (regexes.some((re) => re.test(text))) return type;
  }
  return 'aula';
}

function isNoiseLine(text) {
  return text.length === 0 || HEADER_OR_NOISE.some((re) => re.test(text));
}

function expandRange(startISO, endISO) {
  const dates = [];
  const [y, m, d] = startISO.split('-').map(Number);
  const [ey, em, ed] = endISO.split('-').map(Number);
  const end = new Date(ey, em - 1, ed);
  const cursor = new Date(y, m - 1, d);
  while (cursor <= end && dates.length < 40) {
    dates.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

/**
 * Recebe as linhas posicionais extraídas do PDF e devolve os eventos
 * candidatos. Linhas de baixa confiança vão em `review`, nunca em `events`.
 */
export function parseCronograma(lines, { year, disc }) {
  const rows = [];

  for (const line of lines) {
    if (isNoiseLine(line.text)) continue;

    const hits = findAllDates(line.text, year);

    if (hits.length === 0) {
      // item numerado do cronograma sem data (ex. "37. AED"): é uma linha
      // própria, não continuação — e sem data não dá para posicionar no
      // calendário, então é descartada em vez de chutar um dia.
      if (/^\s*\d{1,3}\s*[.\-)]/.test(line.text)) continue;

      // sem data: pode ser continuação da célula de conteúdo da linha anterior
      const lastRow = rows[rows.length - 1];
      const canContinue =
        lastRow &&
        lastRow.parts.length < MAX_CONTINUATION_PARTS &&
        lastRow.parts.join(' ').length < MAX_ROW_TEXT_LENGTH &&
        Math.abs(lastRow.y - line.y) < 40;
      if (canContinue) lastRow.parts.push(line.text);
      continue;
    }

    // fatia a linha em um segmento por data encontrada
    hits.forEach((hit, i) => {
      const start = hit.index + hit.length;
      const end = i + 1 < hits.length ? hits[i + 1].index : line.text.length;
      const content = cleanSegment(line.text.slice(start, end));
      rows.push({
        date: hit.date,
        endDate: hit.endDate,
        conf: confidenceFor(line.text, hit.index),
        parts: content ? [content] : [],
        y: line.y,
      });
    });
  }

  const events = [];
  const review = [];

  for (const row of rows) {
    const title = row.parts.join(' ').replace(/\s+/g, ' ').trim();
    const type = classifyType(title);
    // feriados ficam na pseudo-disciplina FERIADO, convenção já usada no calendário
    const eventDisc = type === 'feriado' ? 'FERIADO' : disc;

    const dates = row.endDate && row.endDate > row.date ? expandRange(row.date, row.endDate) : [row.date];

    let motivo = null;
    if (row.conf === 'baixa') motivo = 'data fora do início da linha — pode ser data citada no texto, não do cronograma';
    else if (title.length < 4) motivo = 'sem texto de conteúdo reconhecido';
    else if (title.length > MAX_ROW_TEXT_LENGTH) motivo = 'texto muito longo — provável junção de linhas diferentes';
    else if (type === 'avaliacao' && AVALIACAO_AMBIGUA.some((re) => re.test(title)))
      motivo = 'parece devolutiva/revisão de prova, não a prova em si — confirme o tipo';

    for (const date of dates) {
      const event = { date, disc: eventDisc, title, type };
      if (motivo) review.push({ ...event, _motivo: motivo });
      else events.push(event);
    }
  }

  return { events, review };
}
