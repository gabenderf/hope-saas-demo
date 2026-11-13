import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ColumnDef } from '@tanstack/react-table';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataTable } from './DataTable';

interface Row {
  id: string;
  name: string;
  orders: number;
}
const data: Row[] = [
  { id: 'a', name: 'Bruna', orders: 30 },
  { id: 'b', name: 'Caio', orders: 10 },
  { id: 'c', name: 'Ana', orders: 20 },
];
const columns: ColumnDef<Row>[] = [
  { accessorKey: 'name', header: 'Operador' },
  { accessorKey: 'orders', header: 'Pedidos', meta: { align: 'right' } },
];

function orders() {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell').at(-1)?.textContent);
}

function mockMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  cleanup();
  // @ts-expect-error limpeza do simulado
  delete window.matchMedia;
});

describe('DataTable', () => {
  it('ordena ao clicar no cabeçalho e marca aria-sort', async () => {
    render(<DataTable data={data} columns={columns} getRowId={(r) => r.id} aria-label="Operadores" />);
    const header = screen.getByRole('columnheader', { name: /Pedidos/ });
    expect(header).toHaveAttribute('aria-sort', 'none');
    await userEvent.click(within(header).getByRole('button'));
    expect(header).toHaveAttribute('aria-sort', 'descending');
    expect(orders()).toEqual(['30', '20', '10']);
    await userEvent.click(within(header).getByRole('button'));
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    expect(orders()).toEqual(['10', '20', '30']);
  });

  it('seleciona linhas e tudo pelo cabeçalho', async () => {
    const onBulk = vi.fn();
    render(
      <DataTable
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        aria-label="Operadores"
        selectable
        bulkActions={(rows) => {
          onBulk(rows.length);
          return <span>ações</span>;
        }}
      />,
    );
    const boxes = screen.getAllByRole('checkbox');
    await userEvent.click(boxes[1]!);
    expect(screen.getByText('1 selecionado')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todas as linhas' }));
    expect(screen.getByText('3 selecionados')).toBeInTheDocument();
    expect(screen.getAllByRole('row')[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('abre a linha com Enter', async () => {
    const onRow = vi.fn();
    render(<DataTable data={data} columns={columns} getRowId={(r) => r.id} aria-label="Operadores" onRowClick={onRow} />);
    screen.getAllByRole('row')[1]!.focus();
    await userEvent.keyboard('{Enter}');
    expect(onRow).toHaveBeenCalledWith(data[0]);
  });

  it('mostra cards abaixo de 768px', () => {
    mockMedia(true);
    render(
      <DataTable data={data} columns={columns} getRowId={(r) => r.id} aria-label="Operadores" renderMobileCard={(r) => <b>{r.name}</b>} />,
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('mobile-card')).toHaveLength(3);
  });

  it('mostra tabela em tela larga', () => {
    mockMedia(false);
    render(
      <DataTable data={data} columns={columns} getRowId={(r) => r.id} aria-label="Operadores" renderMobileCard={(r) => <b>{r.name}</b>} />,
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-card')).not.toBeInTheDocument();
  });

  it('mostra o vazio', () => {
    render(<DataTable data={[]} columns={columns} getRowId={(r) => r.id} aria-label="Operadores" empty={<p>Nada aqui</p>} />);
    expect(screen.getByText('Nada aqui')).toBeInTheDocument();
  });
});
