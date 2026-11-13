import { describe, expect, it } from 'vitest';
import { matchScore, normalize } from './search';

describe('busca da paleta', () => {
  it('ignora acento e maiúscula', () => {
    expect(normalize('Previsão')).toBe('previsao');
    expect(matchScore('previsao', 'Previsão')).toBeGreaterThan(0);
    expect(matchScore('VISAO GERAL', 'Visão Geral')).toBeGreaterThan(0);
  });
  it('exige todas as palavras', () => {
    expect(matchScore('meta global', 'Definir meta global')).toBeGreaterThan(0);
    expect(matchScore('meta xyz', 'Definir meta global')).toBe(0);
  });
  it('acha pelas palavras-chave', () => {
    expect(matchScore('termino', 'Previsão', ['término da fila'])).toBeGreaterThan(0);
  });
  it('começo do texto pontua mais', () => {
    expect(matchScore('ope', 'Operadores')).toBeGreaterThan(matchScore('ope', 'Novo operador'));
  });
  it('busca vazia casa tudo', () => {
    expect(matchScore('', 'qualquer')).toBe(1);
  });
});
