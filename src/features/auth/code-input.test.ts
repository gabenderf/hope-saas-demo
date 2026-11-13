import { describe, expect, it } from 'vitest';
import { backspaceCode, emptyCode, fillCode, isCodeComplete } from './code-input';

const d = (s: string) => s.split('').map((c) => (c === '_' ? '' : c));

describe('fillCode', () => {
  it('digitar avança uma casa', () => {
    expect(fillCode(emptyCode(), 0, '4')).toEqual({ digits: d('4_____'), focus: 1 });
    expect(fillCode(d('4_____'), 1, '2')).toEqual({ digits: d('42____'), focus: 2 });
  });

  it('a última casa não avança para fora', () => {
    expect(fillCode(d('12345_'), 5, '6')).toEqual({ digits: d('123456'), focus: 5 });
  });

  it('colar o código inteiro em qualquer casa recomeça da primeira', () => {
    expect(fillCode(d('9_____'), 3, '123456')).toEqual({ digits: d('123456'), focus: 5 });
  });

  it('colar com espaço, hífen ou texto em volta só aproveita os dígitos', () => {
    expect(fillCode(emptyCode(), 0, ' 123 456 ').digits).toEqual(d('123456'));
    expect(fillCode(emptyCode(), 0, 'Seu código: 123-456').digits).toEqual(d('123456'));
  });

  it('colar pedaço continua da casa atual', () => {
    expect(fillCode(d('12____'), 2, '34')).toEqual({ digits: d('1234__'), focus: 4 });
  });

  it('letra não entra', () => {
    expect(fillCode(emptyCode(), 0, 'a')).toEqual({ digits: emptyCode(), focus: 0 });
  });
});

describe('backspaceCode', () => {
  it('casa preenchida: limpa e fica', () => {
    expect(backspaceCode(d('123___'), 2)).toEqual({ digits: d('12____'), focus: 2 });
  });
  it('casa vazia: volta e limpa a anterior', () => {
    expect(backspaceCode(d('12____'), 2)).toEqual({ digits: d('1_____'), focus: 1 });
  });
  it('primeira casa vazia: nada muda', () => {
    expect(backspaceCode(emptyCode(), 0)).toEqual({ digits: emptyCode(), focus: 0 });
  });
});

describe('isCodeComplete', () => {
  it('só com as 6 casas', () => {
    expect(isCodeComplete(d('123456'))).toBe(true);
    expect(isCodeComplete(d('12345_'))).toBe(false);
  });
});
