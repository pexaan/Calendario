import { readFileSync, writeFileSync } from 'node:fs';

const FERIADO_DISC = 'FERIADO';
const FERIADO_META = { name: 'Feriados', color: '#8A8578' };

function extractBlock(html, id) {
  const re = new RegExp(`(<script type="application/json" id="${id}">)([\\s\\S]*?)(<\\/script>)`);
  const m = html.match(re);
  if (!m) throw new Error(`Bloco #${id} não encontrado — o index.html mudou de formato?`);
  return { openTag: m[1], json: JSON.parse(m[2]), closeTag: m[3], fullMatch: m[0], index: m.index };
}

const normalizeTitle = (t) => t.toLowerCase().replace(/\s+/g, ' ').trim();
const keyOf = (e) => `${e.date}|${e.disc}|${e.type}|${normalizeTitle(e.title)}`;

/**
 * Compara os eventos extraídos do PDF com o que já existe no index.html.
 * Nunca decide sozinho em caso de conflito (mesma data+disc+type, título
 * diferente) — apenas separa em listas para o usuário revisar.
 */
export function diffEvents(existingEvents, extractedEvents) {
  const existingKeys = new Set(existingEvents.map(keyOf));
  const novos = [];
  const jaExistem = [];
  const conflitos = [];

  for (const ev of extractedEvents) {
    if (existingKeys.has(keyOf(ev))) {
      jaExistem.push(ev);
      continue;
    }
    const mesmoSlot = existingEvents.find((e) => e.date === ev.date && e.disc === ev.disc && e.type === ev.type);
    if (mesmoSlot) {
      conflitos.push({ existente: mesmoSlot, novo: ev });
      continue;
    }
    novos.push(ev);
  }

  return { novos, jaExistem, conflitos };
}

/**
 * Insere os eventos novos respeitando o agrupamento atual do array
 * (por disciplina e, dentro dela, por tipo: aula, avaliacao, aed) —
 * mantém o diff do git pequeno e legível.
 */
function insertGrouped(existingEvents, novos) {
  const result = [...existingEvents];
  const typeOrder = { aula: 0, avaliacao: 1, aed: 2, feriado: 3 };

  for (const ev of novos) {
    let lastIdx = -1;
    for (let i = 0; i < result.length; i++) {
      if (result[i].disc === ev.disc && result[i].type === ev.type) lastIdx = i;
    }
    if (lastIdx !== -1) {
      result.splice(lastIdx + 1, 0, ev);
      continue;
    }
    // disciplina nova (ou disciplina existente mas tipo ainda não visto): entra no final
    let insertAt = result.length;
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i].disc === ev.disc) { insertAt = i + 1; break; }
    }
    result.splice(insertAt, 0, ev);
  }

  return result.sort((a, b) => {
    // preserva blocos por disciplina; dentro do mesmo disc+type, ordena por data
    if (a.disc !== b.disc || a.type !== b.type) return 0;
    return a.date.localeCompare(b.date);
  });
}

function serializeDiscMeta(obj) {
  // serializa TODOS os campos de cada disciplina (não só name/color), senão
  // um --apply futuro apagaria campos extras como "modalidade"
  const linhas = Object.entries(obj).map(([codigo, meta]) => {
    const campos = Object.entries(meta)
      .map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`)
      .join(', ');
    return `  ${JSON.stringify(codigo)}: {${campos}}`;
  });
  // as quebras de linha nas pontas replicam a formatação original do bloco
  return '\n{\n' + linhas.join(',\n') + '\n}\n';
}

/**
 * Lê o index.html, mescla os eventos novos e (se necessário) a disciplina
 * nova em disc-meta, e devolve o HTML resultante — nunca escreve em disco
 * diretamente, quem chama decide se aplica (ver --apply no CLI).
 */
export function mergeIntoHtml(htmlPath, { novos, disc, name, color, modalidade, forceMeta }) {
  const html = readFileSync(htmlPath, 'utf8');

  const eventsBlock = extractBlock(html, 'events-data');
  const metaBlock = extractBlock(html, 'disc-meta');

  const mergedEvents = insertGrouped(eventsBlock.json, novos);

  const mergedMeta = { ...metaBlock.json };
  const metaChanged = !mergedMeta[disc] || forceMeta;
  if (metaChanged && name && color) {
    // modalidade (presencial/ead) sai da leitura do plano de ensino, não do
    // cronograma — por isso vem como argumento, e não é inferida
    mergedMeta[disc] = { name, color, ...(modalidade ? { modalidade } : {}) };
  }
  if (!mergedMeta[disc]) {
    throw new Error(`Disciplina "${disc}" não existe em disc-meta e --name/--color não foram informados.`);
  }

  // FERIADO é pseudo-disciplina do próprio calendário (o parser remapeia
  // feriados para ela), não uma matéria do plano — então quem cria é o
  // importador, senão importar num index.html zerado quebraria no primeiro
  // feriado encontrado
  const usedDiscs = new Set(mergedEvents.map((e) => e.disc));
  if (usedDiscs.has(FERIADO_DISC) && !mergedMeta[FERIADO_DISC]) {
    mergedMeta[FERIADO_DISC] = { ...FERIADO_META };
  }
  for (const d of usedDiscs) {
    if (!mergedMeta[d]) throw new Error(`Evento usa disciplina "${d}" que não existe em disc-meta.`);
  }

  const newEventsJson = JSON.stringify(mergedEvents, null, 2);
  JSON.parse(newEventsJson); // valida antes de escrever

  const newMetaJson = serializeDiscMeta(mergedMeta);
  JSON.parse(newMetaJson);

  let out = html;
  out = out.slice(0, eventsBlock.index) + eventsBlock.openTag + newEventsJson + eventsBlock.closeTag + out.slice(eventsBlock.index + eventsBlock.fullMatch.length);

  // recalcula a posição do bloco disc-meta após a troca do bloco anterior
  const metaBlock2 = extractBlock(out, 'disc-meta');
  out = out.slice(0, metaBlock2.index) + metaBlock2.openTag + newMetaJson + metaBlock2.closeTag + out.slice(metaBlock2.index + metaBlock2.fullMatch.length);

  return { html: out, metaChanged: metaChanged && Boolean(name && color) };
}

export function readExistingEvents(htmlPath) {
  const html = readFileSync(htmlPath, 'utf8');
  return extractBlock(html, 'events-data').json;
}

export function readDiscMeta(htmlPath) {
  const html = readFileSync(htmlPath, 'utf8');
  return extractBlock(html, 'disc-meta').json;
}

export function writeHtml(htmlPath, html) {
  writeFileSync(htmlPath, html, 'utf8');
}

function substituirBloco(html, id, conteudo) {
  const bloco = extractBlock(html, id);
  return html.slice(0, bloco.index) + bloco.openTag + conteudo + bloco.closeTag + html.slice(bloco.index + bloco.fullMatch.length);
}

/**
 * Esvazia os dois blocos de dados, deixando o calendário pronto para receber
 * outro semestre. É o primeiro passo de quem clona o projeto para usar com os
 * próprios planos de ensino.
 */
export function resetDataBlocks(htmlPath) {
  const html = readFileSync(htmlPath, 'utf8');
  const removidos = {
    eventos: extractBlock(html, 'events-data').json.length,
    disciplinas: Object.keys(extractBlock(html, 'disc-meta').json).length,
  };

  let out = substituirBloco(html, 'events-data', '\n[]\n');
  out = substituirBloco(out, 'disc-meta', '\n{}\n');
  writeFileSync(htmlPath, out, 'utf8');

  return removidos;
}
