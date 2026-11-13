import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { DataTable } from '@/components/data';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Tooltip } from '@/components/ui/Tooltip';
import { formatDec1 } from '@/lib/format';
import type { Comparativo, ProdutoComparado } from '../model/comparar';
import { MIN_PEDIDOS_SKU } from '../model/constantes';
import { rotuloMes } from '../model/datas';
import { filtrarPorBusca } from '../model/derivados';
import { Variacao, corVariacao, sinalDec1 } from './apresentacao';
import { cn } from '@/lib/cn';

interface Linha {
  p: ProdutoComparado;
  pos: number;
}

/** Marcador de combinação nova: o crescimento vem de pedido misto. Texto no tooltip e no rótulo. */
function MarcaCombinacao({ p, c }: { p: ProdutoComparado; c: Comparativo }) {
  if (!p.combinado && !p.atencaoComb) return null;
  const texto = `${Math.round(p.pctVia)}% dos pedidos deste produto em ${rotuloMes(c.chaveB)} são mistos numa combinação que não existia em ${rotuloMes(
    c.chaveA,
  )}. Venda avulsa: ${formatDec1(p.soloA)} para ${formatDec1(p.soloB)} por dia útil.`;
  return (
    <Tooltip content={texto}>
      <span tabIndex={0} role="img" aria-label={`Combinação nova. ${texto}`} className="ml-1 cursor-help rounded-sm text-accent focus-visible:shadow-focus">
        ●
      </span>
    </Tooltip>
  );
}

/** O que subiu e o que caiu, por SKU EXATO (o 3X- sobe enquanto o 4X- desce). */
export function ProdutosTable({ c }: { c: Comparativo }) {
  const [busca, setBusca] = useState('');
  const linhas = useMemo<Linha[]>(
    () => filtrarPorBusca(c.produtos, busca, (p) => p.produto).map((x) => ({ p: x.item, pos: x.pos })),
    [c.produtos, busca],
  );
  const A = rotuloMes(c.chaveA);
  const B = rotuloMes(c.chaveB);

  const columns = useMemo<ColumnDef<Linha>[]>(
    () => [
      { id: 'pos', header: '#', accessorFn: (r) => r.pos, cell: (i) => <span className="tabular text-ink-3">{i.row.original.pos}</span>, meta: { align: 'right' } },
      {
        id: 'produto',
        header: 'Produto',
        accessorFn: (r) => r.p.produto,
        cell: (i) => <code className="font-mono text-sm">{i.row.original.p.produto}</code>,
      },
      { id: 'diaA', header: `${A}, por dia útil`, accessorFn: (r) => r.p.diaA, cell: (i) => formatDec1(i.row.original.p.diaA), meta: { align: 'right' } },
      {
        id: 'diaB',
        header: `${B}, por dia útil`,
        accessorFn: (r) => r.p.diaB,
        cell: (i) => <b className="font-semibold">{formatDec1(i.row.original.p.diaB)}</b>,
        meta: { align: 'right' },
      },
      {
        id: 'variacao',
        header: 'Variação',
        accessorFn: (r) => r.p.variacao ?? Number.NEGATIVE_INFINITY,
        cell: (i) => (
          <span className="inline-flex items-center">
            <Variacao valor={i.row.original.p.variacao} />
            <MarcaCombinacao p={i.row.original.p} c={c} />
          </span>
        ),
        meta: { align: 'right' },
      },
      {
        id: 'difDia',
        header: 'Diferença por dia útil',
        accessorFn: (r) => r.p.difDia,
        cell: (i) => <span className={corVariacao(i.row.original.p.difDia)}>{sinalDec1(i.row.original.p.difDia)}</span>,
        meta: { align: 'right' },
      },
      {
        id: 'misto',
        header: 'Pedido misto',
        accessorFn: (r) => r.p.acompB,
        cell: (i) => {
          const p = i.row.original.p;
          return (
            <span className="tabular">
              {Math.round(p.acompA)}% <span className="text-ink-3">para</span>{' '}
              <span className={cn(p.combinado && 'font-semibold text-accent')}>{Math.round(p.acompB)}%</span>
            </span>
          );
        },
        meta: { align: 'right' },
      },
    ],
    [A, B, c],
  );

  return (
    <Card>
      <CardHeader
        title="O que subiu e o que caiu"
        description={
          <>
            Por SKU exato, ordenado pela diferença por dia útil. Entram SKUs com pelo menos {MIN_PEDIDOS_SKU} pedidos em algum dos meses.
          </>
        }
        actions={
          <Input
            type="search"
            aria-label="Buscar produto"
            placeholder="Buscar produto"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-52"
          />
        }
      />
      <div className="max-h-[520px] overflow-y-auto">
        <DataTable
          aria-label="Pedidos por produto, comparação entre os dois meses"
          data={linhas}
          columns={columns}
          getRowId={(r) => r.p.produto}
          density="compact"
          empty={
            <EmptyState
              title={busca ? 'Nenhum produto encontrado' : `Sem produtos acima do piso de ${MIN_PEDIDOS_SKU} pedidos`}
              description={busca ? 'Tente outro trecho do SKU.' : 'Os pedidos dos dois meses ainda não chegaram a esse piso por SKU.'}
            />
          }
          renderMobileCard={(r) => (
            <div className="grid gap-1">
              <div className="flex items-center justify-between gap-2">
                <code className="font-mono text-sm">{r.p.produto}</code>
                <span className="inline-flex items-center">
                  <Variacao valor={r.p.variacao} />
                  <MarcaCombinacao p={r.p} c={c} />
                </span>
              </div>
              <p className="tabular text-ink-3">
                {formatDec1(r.p.diaA)} para {formatDec1(r.p.diaB)} por dia útil ({sinalDec1(r.p.difDia)})
              </p>
              <p className="tabular text-ink-3">
                Pedido misto: {Math.round(r.p.acompA)}% para {Math.round(r.p.acompB)}%
              </p>
            </div>
          )}
        />
      </div>
      <CardBody className="pt-3 text-ink-3">
        <p>
          A coluna Pedido misto é a fatia dos pedidos em que o produto divide a caixa com outro. O marcador ● aponta crescimento que vem de combinação nova
          (kit, brinde), não de demanda própria. Para estoque, o total é o número certo; para decidir anúncio, olhe a venda avulsa no marcador.
        </p>
      </CardBody>
    </Card>
  );
}
