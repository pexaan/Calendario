#!/usr/bin/env node
// Esvazia os dados do calendário (eventos e disciplinas), para começar o seu
// próprio semestre do zero. Só mexe nos dois blocos JSON — o layout, o CSS e a
// lógica continuam intactos.
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDiscMeta, readExistingEvents, resetDataBlocks } from './lib/merge-html.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = resolve(AQUI, '..', '..', 'index.html');

const { values } = parseArgs({ options: { sim: { type: 'boolean', default: false } } });

const eventos = readExistingEvents(HTML_PATH).length;
const disciplinas = Object.keys(readDiscMeta(HTML_PATH)).length;

if (eventos === 0 && disciplinas === 0) {
  console.log('O calendário já está vazio — nada a fazer.');
  process.exit(0);
}

console.log(`Isto vai apagar ${eventos} evento(s) e ${disciplinas} disciplina(s) do index.html.`);
console.log('As faltas e os dias concluídos ficam no navegador (localStorage) e não são tocados aqui.');

if (!values.sim) {
  // stdin fechado (rodando em script/CI) não deve travar esperando resposta
  if (!process.stdin.isTTY) {
    console.error('\nSem terminal interativo. Rode de novo com --sim para confirmar.');
    process.exit(1);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const resposta = await rl.question('\nConfirma? (digite "sim") ');
  rl.close();
  if (resposta.trim().toLowerCase() !== 'sim') {
    console.log('Cancelado — nada foi alterado.');
    process.exit(0);
  }
}

const removidos = resetDataBlocks(HTML_PATH);
console.log(`\n✓ ${removidos.eventos} evento(s) e ${removidos.disciplinas} disciplina(s) removidos.`);
console.log('Agora coloque os seus PDFs em planos/ e rode: make planos-aplicar');
