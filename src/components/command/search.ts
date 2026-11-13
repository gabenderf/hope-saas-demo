/** Busca da paleta: sem acento, sem maiúscula, todas as palavras precisam aparecer. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** 0 = não casa. Maior = melhor (começo do texto vale mais que o meio). */
export function matchScore(search: string, haystack: string, keywords: readonly string[] = []): number {
  const words = normalize(search).split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;
  const text = normalize(haystack);
  const extra = normalize(keywords.join(' '));
  let score = 0;
  for (const w of words) {
    if (text.startsWith(w)) score += 3;
    else if (text.includes(` ${w}`)) score += 2;
    else if (text.includes(w)) score += 1.5;
    else if (extra.includes(w)) score += 1;
    else return 0;
  }
  return score / words.length;
}
