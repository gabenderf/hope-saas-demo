import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Delta, deltaInfo } from './Delta';
import { Meter, meterGeometry } from './Meter';

afterEach(cleanup);

describe('meterGeometry', () => {
  it('usa escala fixa de 0 a 1,5x a meta, com a marca em 2/3', () => {
    const g = meterGeometry(35, 35);
    expect(g.goalPct).toBeCloseTo(66.67, 1);
    expect(g.fillPct).toBeCloseTo(66.67, 1);
    expect(g.tone).toBe('ok');
  });
  it('limita a barra em 100%', () => {
    expect(meterGeometry(200, 35).fillPct).toBe(100);
  });
  it('tom: neutro até 15% abaixo, âmbar depois, nenhum sem dado', () => {
    expect(meterGeometry(30, 35).tone).toBe('neutral');
    expect(meterGeometry(20, 35).tone).toBe('warn');
    expect(meterGeometry(null, 35).tone).toBe('none');
  });
});

describe('Meter', () => {
  it('desenha a largura e o tom', () => {
    const { container } = render(<Meter value={17.5} goal={35} />);
    expect(container.querySelector('[data-part="fill"]')).toHaveStyle({ width: '33.33333333333333%' });
    expect(screen.getByRole('img')).toHaveAttribute('data-tone', 'warn');
  });
});

describe('deltaInfo', () => {
  it('sinal e tom', () => {
    expect(deltaInfo(12.4)).toMatchObject({ direction: 'up', color: 'up', text: '+12,4%' });
    expect(deltaInfo(-3)).toMatchObject({ direction: 'down', color: 'down', text: '-3,0%' });
    expect(deltaInfo(0.2)).toMatchObject({ direction: 'flat', color: 'flat' });
  });
  it('pontos percentuais e absoluto', () => {
    expect(deltaInfo(1.5, 'points').text).toBe('+1,5 p.p.');
    expect(deltaInfo(3, 'absolute').text).toBe('+3');
  });
  it('tom none mantém a direção mas tira a cor', () => {
    expect(deltaInfo(8, 'points', 'none')).toMatchObject({ direction: 'up', color: 'flat' });
  });
  it('sem base', () => {
    expect(deltaInfo(null).text).toBe('sem base');
  });
});

describe('Delta', () => {
  it('renderiza o texto e a cor', () => {
    render(<Delta value={-10} />);
    expect(screen.getByText('-10,0%')).toHaveAttribute('data-color', 'down');
  });
});
