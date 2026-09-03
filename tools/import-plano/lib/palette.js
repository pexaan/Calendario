// Cores para disciplinas novas. O plano de ensino não traz cor nenhuma, então
// no modo pasta ela é escolhida daqui — sempre a primeira ainda livre, para o
// resultado não mudar se o importador rodar de novo.

// mesma família dessaturada das cores já usadas no calendário: escuras o
// bastante para texto branco por cima do chip do evento
const PALETA = [
  '#2E5C8A', // azul
  '#8A4F2E', // terracota
  '#3F6B6B', // petróleo
  '#7D4E5F', // vinho rosado
  '#5B6B2E', // oliva
  '#5A4A8A', // roxo azulado
  '#8A6B2E', // mostarda escura
  '#2E6B4F', // verde musgo
];

/**
 * Escolhe uma cor que ainda não está em uso. `usadas` são as cores já no
 * disc-meta; `reservadas` são as escolhidas para outros PDFs do mesmo lote,
 * que ainda não foram gravadas no arquivo.
 */
export function escolherCor(usadas = [], reservadas = []) {
  const ocupadas = new Set([...usadas, ...reservadas].map((c) => String(c).toLowerCase()));
  const livre = PALETA.find((c) => !ocupadas.has(c.toLowerCase()));
  if (livre) return livre;
  // paleta esgotada (mais de 8 disciplinas novas): repete a partir do começo em
  // vez de falhar — cor repetida é problema de leitura, não de dados
  return PALETA[ocupadas.size % PALETA.length];
}

export function coresEmUso(discMeta) {
  return Object.values(discMeta)
    .map((m) => m?.color)
    .filter(Boolean);
}
