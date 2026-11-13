import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { carregarPlanejamento } from '../data/carregar';
import { prefixoDoCache } from '../data/cache';
import { cenarios } from '../model/testes/fixture';
import type { PedidoLinha } from '../model/types';
import { PlanningContent } from './PlanningContent';

afterEach(cleanup);

async function dadosDe(nome: string, hoje?: string) {
  const cen = cenarios().find((c) => c.nome.includes(nome));
  if (!cen) throw new Error(nome);
  const ler = async (chave: string): Promise<PedidoLinha[]> => cen.linhas[chave] ?? [];
  return carregarPlanejamento({
    hoje: hoje ?? cen.hoje,
    ler,
    familias: async () => [],
    storage: null,
    prefixoCache: prefixoDoCache('demo'),
    agora: () => 0,
  });
}

describe('tela do Planejamento', () => {
  it('mostra todas as seções na ordem e o backtest', async () => {
    const dados = await dadosDe('05/11/2026 (set-out');
    render(<PlanningContent dados={dados} />);
    expect(screen.getByText('Pedidos em dia útil')).toBeInTheDocument();
    expect(screen.getByText('Pedidos por dia')).toBeInTheDocument();
    expect(screen.getByText('Por dia da semana')).toBeInTheDocument();
    expect(screen.getByText('O que subiu e o que caiu')).toBeInTheDocument();
    expect(screen.getByText('Peças que saíram do estoque')).toBeInTheDocument();
    expect(screen.getByText(/Expectativa para novembro\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/o quanto ela erra/)).toBeInTheDocument();
    expect(screen.getByText(/Erro conhecido:/)).toBeInTheDocument();
    // feriado trabalhado explicado e Black Friday sem medição declarada
    expect(screen.getByText(/feriado trabalhado/i)).toBeInTheDocument();
    expect(screen.getByText(/a projeção não inclui a onda/)).toBeInTheDocument();
    // vocabulário: nunca "acompanhado" em texto visível
    expect(document.body.textContent).not.toMatch(/acompanhado/i);
    expect(document.body.textContent).toMatch(/Pedido misto/);
  });

  it('faixa de combinações aparece quando há par novo', async () => {
    const dados = await dadosDe('05/11/2026 (set-out');
    render(<PlanningContent dados={dados} />);
    expect(screen.getByText(/a sair em pedido misto/)).toBeInTheDocument();
  });

  it('peças: legenda em português acompanha o clique no cabeçalho; busca filtra', async () => {
    const dados = await dadosDe('05/11/2026 (set-out');
    render(<PlanningContent dados={dados} />);
    expect(screen.getByText(/Ordenado por maior movimento/)).toBeInTheDocument();
    const tabela = screen.getByRole('table', { name: /Peças que saíram do estoque/ });
    await userEvent.click(within(tabela).getByRole('button', { name: /Produto/ }));
    expect(screen.getByText(/Ordenado por nome do produto \(menor primeiro\)/)).toBeInTheDocument();
    await userEvent.click(within(tabela).getByRole('button', { name: /Produto/ }));
    expect(screen.getByText(/Ordenado por nome do produto \(maior primeiro\)/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Buscar produto de estoque'), 'GAZE');
    const linhas = within(tabela).getAllByRole('row').slice(1);
    expect(linhas.length).toBeGreaterThan(0);
    for (const l of linhas) expect(l.textContent).toMatch(/GAZE/);
  });

  it('primeiro dia do mês corrente e mês sem dado não quebram', async () => {
    const dados = await dadosDe('05/11/2026 (set-out', '2026-11-01');
    render(<PlanningContent dados={dados} />);
    expect(screen.getByText(/Expectativa para novembro\/2026/)).toBeInTheDocument();
  });

  it('sem nenhum pedido nos dois meses: estado vazio que explica', async () => {
    const dados = await carregarPlanejamento({
      hoje: '2026-11-05',
      ler: async () => [],
      familias: async () => [],
      storage: null,
      prefixoCache: prefixoDoCache('demo'),
      agora: () => 0,
    });
    render(<PlanningContent dados={dados} />);
    expect(screen.getByText(/Ainda não há dois meses fechados/)).toBeInTheDocument();
  });
});
