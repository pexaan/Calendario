#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractLines } from './lib/extract-pdf.js';
import { parseHeader } from './lib/plano-header.js';
import { coresEmUso, escolherCor } from './lib/palette.js';
import { parseCronograma } from './lib/parse-cronograma.js';
import { diffEvents, mergeIntoHtml, readDiscMeta, readExistingEvents, writeHtml } from './lib/merge-html.js';

// import.meta.dirname só existe a partir do Node 20.11 — fileURLToPath vale
// desde o 18, que é o mínimo declarado no package.json
const AQUI = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = resolve(AQUI, '..', '..', 'index.html');

function printUsageAndExit() {
  console.error(`Uso:
  Uma pasta inteira (código, nome, modalidade e ano saem de dentro de cada PDF):
    node import-plano.js --dir planos [--apply]

  Um PDF só, informando os dados na mão:
    node import-plano.js --pdf <caminho.pdf> --disc CODIGO [--name "Nome"] [--color "#hex"] [--year 2026] [--apply]

  --dir     pasta com os PDFs dos planos de ensino (processa todos)
  --pdf     caminho de um PDF de plano de ensino
  --disc    código da disciplina, ex: CMP1017 (obrigatório com --pdf)
  --name    nome da disciplina (só se --disc ainda não existe em disc-meta)
  --color   cor em hex, ex: #2E5C8A (só se --disc ainda não existe em disc-meta)
  --modalidade  "presencial" ou "ead" — como o plano computa a frequência
  --year    ano das datas sem ano explícito (padrão: o ano mais citado no PDF)
  --apply   escreve de fato no index.html (sem essa flag, só mostra o preview)
`);
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    pdf: { type: 'string' },
    dir: { type: 'string' },
    disc: { type: 'string' },
    name: { type: 'string' },
    color: { type: 'string' },
    modalidade: { type: 'string' },
    year: { type: 'string' },
    apply: { type: 'boolean', default: false },
    'force-meta': { type: 'boolean', default: false },
  },
});

if (!values.pdf && !values.dir) printUsageAndExit();
if (values.pdf && values.dir) {
  console.error('Use --pdf ou --dir, não os dois.');
  process.exit(1);
}
if (values.pdf && !values.disc) printUsageAndExit();
if (values.dir && (values.disc || values.name || values.color || values.modalidade)) {
  // esses valores são por disciplina; aplicá-los a todos os PDFs da pasta
  // gravaria a mesma disciplina cinco vezes
  console.error('--disc/--name/--color/--modalidade valem para um PDF só. Com --dir, esses dados saem de dentro de cada plano.');
  process.exit(1);
}

if (values.year !== undefined && !Number.isInteger(Number(values.year))) {
  console.error('--year precisa ser um número inteiro, ex: --year 2026');
  process.exit(1);
}

function listarPdfs(dirPath) {
  let entradas;
  try {
    entradas = readdirSync(dirPath);
  } catch {
    console.error(`Pasta não encontrada: ${dirPath}\nCrie a pasta e coloque nela os PDFs dos planos de ensino, ou use --dir para apontar outra.`);
    process.exit(1);
  }
  const pdfs = entradas
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .filter((f) => statSync(join(dirPath, f)).isFile())
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))
    .map((f) => join(dirPath, f));

  if (pdfs.length === 0) {
    console.error(`Nenhum PDF em ${dirPath}.\nCopie para lá os PDFs dos planos de ensino (um por disciplina) e rode de novo.`);
    process.exit(1);
  }
  return pdfs;
}

function reportar({ novos, jaExistem, conflitos, review }) {
  console.log(`\n=== Novos eventos (${novos.length}) ===`);
  for (const e of novos) console.log(`  ${e.date}  [${e.type}]  ${e.title}`);

  if (jaExistem.length) {
    console.log(`\n=== Já existem, ignorados (${jaExistem.length}) ===`);
    for (const e of jaExistem) console.log(`  ${e.date}  [${e.type}]  ${e.title}`);
  }

  if (conflitos.length) {
    console.log(`\n=== ⚠ CONFLITO — já existe evento diferente nesta data (${conflitos.length}) ===`);
    for (const c of conflitos) {
      console.log(`  ${c.existente.date} [${c.existente.disc}/${c.existente.type}]`);
      console.log(`    existente: ${c.existente.title}`);
      console.log(`    novo:      ${c.novo.title}`);
    }
    console.log('  (nenhum destes é aplicado automaticamente — resolva manualmente se necessário)');
  }

  if (review.length) {
    console.log(`\n=== ⚠ REVISAR MANUALMENTE — baixa confiança, não incluído (${review.length}) ===`);
    for (const r of review) {
      const texto = r.title ? (r.title.length > 120 ? `${r.title.slice(0, 120)}…` : r.title) : '(sem texto reconhecido)';
      console.log(`  ${r.date}  ${texto}  — motivo: ${r._motivo}`);
    }
  }
}

/**
 * Processa um PDF de ponta a ponta. `coresReservadas` acumula as cores
 * escolhidas para disciplinas novas do mesmo lote — sem isso, dois planos novos
 * num preview (que não grava nada) receberiam a mesma cor.
 */
async function processarPdf(pdfPath, coresReservadas) {
  console.log(`\n${'─'.repeat(64)}`);
  console.log(`Lendo ${basename(pdfPath)}...`);

  const { lines, suspectedScanned } = await extractLines(pdfPath);

  if (suspectedScanned && lines.length === 0) {
    console.error(`✗ Não consegui extrair texto selecionável — provavelmente é um scan/imagem.\n  OCR não é suportado; será preciso digitar manualmente ou reexportar o PDF com texto.`);
    return { ok: false, aplicados: 0 };
  }
  if (suspectedScanned) {
    console.warn('⚠ Ao menos uma página parece ter pouco ou nenhum texto selecionável — pode faltar conteúdo abaixo.');
  }

  const header = parseHeader(lines);

  const disc = values.disc ?? header.disc;
  if (!disc) {
    console.error('✗ Não achei o código da disciplina no cabeçalho deste PDF. Rode com --pdf e --disc para informar na mão.');
    return { ok: false, aplicados: 0 };
  }

  const year = Number(values.year ?? header.year);
  if (!Number.isInteger(year)) {
    console.error(`✗ Não achei o ano no PDF. Rode de novo com --year.`);
    return { ok: false, aplicados: 0 };
  }

  const discMeta = readDiscMeta(HTML_PATH);
  const discNova = !discMeta[disc];
  const name = values.name ?? header.name;
  const modalidade = values.modalidade ?? header.modalidade;
  const color = values.color ?? (discNova ? escolherCor(coresEmUso(discMeta), coresReservadas) : undefined);

  console.log(`  disciplina: ${disc}${discNova ? ` (nova) — "${name ?? '?'}", ${modalidade}, cor ${color}` : ` — já em disc-meta`}`);
  console.log(`  ano das datas: ${year}${values.year === undefined ? ' (lido do PDF)' : ''}`);

  if (discNova && !name) {
    console.error('✗ Disciplina nova e não achei o nome no cabeçalho. Rode com --pdf, --disc e --name.');
    return { ok: false, aplicados: 0 };
  }
  if (discNova) coresReservadas.push(color);

  const { events: extracted, review } = parseCronograma(lines, { year, disc });
  const { novos, jaExistem, conflitos } = diffEvents(readExistingEvents(HTML_PATH), extracted);

  reportar({ novos, jaExistem, conflitos, review });

  if (!values.apply || novos.length === 0) return { ok: true, aplicados: 0, disc };

  const { html, metaChanged } = mergeIntoHtml(HTML_PATH, {
    novos,
    disc,
    name,
    color,
    modalidade,
    forceMeta: values['force-meta'],
  });

  writeHtml(HTML_PATH, html);
  console.log(`\n✓ ${novos.length} evento(s) adicionados ao index.html`);
  if (metaChanged) console.log(`✓ disc-meta atualizado para ${disc}`);

  return { ok: true, aplicados: novos.length, disc };
}

const pdfs = values.dir ? listarPdfs(resolve(values.dir)) : [resolve(values.pdf)];
if (values.dir) console.log(`${pdfs.length} PDF(s) em ${resolve(values.dir)}`);

const coresReservadas = [];
const resultados = [];
for (const pdfPath of pdfs) {
  resultados.push(await processarPdf(pdfPath, coresReservadas));
}

if (pdfs.length > 1) {
  const totalAplicados = resultados.reduce((s, r) => s + r.aplicados, 0);
  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`\n${'═'.repeat(64)}`);
  console.log(`Resumo: ${pdfs.length} PDF(s) lidos, ${falhas} com erro, ${totalAplicados} evento(s) gravados.`);
}

if (!values.apply) {
  console.log(`\nPreview apenas — nada foi escrito. Rode de novo com --apply para gravar no index.html.`);
}

process.exit(resultados.some((r) => !r.ok) ? 1 : 0);
