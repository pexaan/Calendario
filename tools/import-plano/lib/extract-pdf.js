import { readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const Y_TOLERANCE = 2.5; // pontos PDF — fragmentos dentro disso contam como "mesma linha visual"
const MIN_TEXT_LENGTH_PER_PAGE = 20; // abaixo disso, a página provavelmente não tem texto selecionável

/**
 * Extrai o texto de um PDF como uma lista de linhas reconstruídas a partir
 * da posição (x/y) de cada fragmento — necessário para não perder a
 * separação entre colunas de uma tabela quando o texto é achatado.
 * Retorna { lines, suspectedScanned } — suspectedScanned indica que o PDF
 * provavelmente é uma imagem/scan sem camada de texto.
 */
export async function extractLines(pdfPath) {
  const data = new Uint8Array(readFileSync(pdfPath));
  const doc = await getDocument({ data }).promise;
  const lines = [];
  let suspectedScanned = false;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    const items = content.items
      .filter((it) => typeof it.str === 'string')
      .map((it) => ({
        text: it.str,
        x: it.transform[4],
        y: it.transform[5],
      }));

    const pageTextLength = items.reduce((sum, it) => sum + it.text.trim().length, 0);
    if (pageTextLength < MIN_TEXT_LENGTH_PER_PAGE) {
      suspectedScanned = true;
      continue;
    }

    // ordem de leitura: topo→baixo (y decresce em coordenadas PDF), esquerda→direita
    items.sort((a, b) => b.y - a.y || a.x - b.x);

    const pageLines = [];
    let current = null;
    for (const it of items) {
      if (!current || Math.abs(current.y - it.y) > Y_TOLERANCE) {
        current = { page: p, y: it.y, items: [] };
        pageLines.push(current);
      }
      current.items.push(it);
    }

    for (const line of pageLines) {
      line.items.sort((a, b) => a.x - b.x);
      line.x = line.items[0]?.x ?? 0;
      line.text = line.items
        .map((i) => i.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    lines.push(...pageLines.filter((l) => l.text.length > 0));
  }

  return { lines, suspectedScanned };
}
