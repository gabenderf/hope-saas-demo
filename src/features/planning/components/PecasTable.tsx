import type { ColumnDef } from '@tanstack/react-table';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { DataTable } from '@/components/data';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/cn';
import { formatDec1, formatInt } from '@/lib/format';
import type { Comparativo, PecaComparada } from '../model/comparar';
import { type CampoOrdemPecas, MIN_PECAS_SKU, ORDEM_PECAS, ORDEM_PECAS_PADRAO, type OrdemPecas } from '../model/constantes';
import { rotuloMes } from '../model/datas';
import { alternarOrdemPecas, filtrarPorBusca, ordenarPecas } from '../model/derivados';
import { Variacao, corVariacao, sinalDec1 } from './apresentacao';

interface Linha {
  p: PecaComparada;
  pos: number;
}

/** Explica de onde saiu o número da linha, sem inventar embalagem que não foi usada. */
function explicacao(p: PecaComparada, mesA: string): string[] {
  const quando = p.detalheDoMesB ? '' : ` (em ${mesA})`;
  const partes = [p.nVariantes > 1 ? `${p.nVariantes} variantes somadas${quando}: ${p.detalhe}` : `SKU único${quando}: ${p.detalhe}`];
  if (p.embalagens.length) {
    partes.push(
      `Embalagem fechada de ${p.embalagens.join(' ou ')}: 1 peça = 1 pacote${p.detalheDoMesB ? ` (${formatInt(p.unidB)} unidades no mês)` : ''}.`,
    );
  }
  if (p.temCaixa) partes.push('Prefixo CX: o número do SKU já vem em caixas, então é a própria peça.');
  return partes;
}

function Produto({ p, mesA }: { p: PecaComparada; mesA: string }) {
  const partes = explicacao(p, mesA);
  return (
    <Tooltip
      content={
        <span className="grid gap-1">
          {partes.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </span>
      }
    >
      <span tabIndex={0} className="cursor-help rounded-sm focus-visible:shadow-focus">
        <code className="font-mono text-sm">{p.sku}</code>
        {p.nVariantes > 1 && <span className="ml-1 text-ink-3">({p.nVariantes})</span>}
      </span>
    </Tooltip>
  );
}

/** Peças que saíram do estoque, uma linha por produto de prateleira. */
export function PecasTable({ c }: { c: Comparativo }) {
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<OrdemPecas>(ORDEM_PECAS_PADRAO);
  const A = rotuloMes(c.chaveA);
  const B = rotuloMes(c.chaveB);

  const linhas = useMemo<Linha[]>(
    () => filtrarPorBusca(ordenarPecas(c.pecas, ordem), busca, (p) => p.sku).map((x) => ({ p: x.item, pos: x.pos })),
    [c.pecas, ordem, busca],
  );

  const cab = (campo: CampoOrdemPecas, rotulo: ReactNode, direita = true) => (
    <button
      type="button"
      onClick={() => setOrdem((o) => alternarOrdemPecas(o, campo))}
      className={cn('inline-flex items-center gap-1 rounded-sm hover:text-ink focus-visible:shadow-focus', ordem.campo === campo && 'text-ink', direita && 'flex-row-reverse')}
    >
      {rotulo}
      {ordem.campo === campo &&
        (ordem.desc ? <ArrowDown className="size-3.5" aria-hidden="true" /> : <ArrowUp className="size-3.5" aria-hidden="true" />)}
    </button>
  );

  const columns = useMemo<ColumnDef<Linha>[]>(
    () => [
      { id: 'pos', header: '#', enableSorting: false, cell: (i) => <span className="tabular text-ink-3">{i.row.original.pos}</span>, meta: { align: 'right' } },
      { id: 'sku', header: () => cab('sku', 'Produto', false), enableSorting: false, cell: (i) => <Produto p={i.row.original.p} mesA={A} /> },
      { id: 'diaA', header: () => cab('diaA', `${A}, peças por dia útil`), enableSorting: false, cell: (i) => formatDec1(i.row.original.p.diaA), meta: { align: 'right' } },
      {
        id: 'diaB',
        header: () => cab('diaB', `${B}, peças por dia útil`),
        enableSorting: false,
        cell: (i) => <b className="font-semibold">{formatDec1(i.row.original.p.diaB)}</b>,
        meta: { align: 'right' },
      },
      { id: 'variacao', header: () => cab('variacao', 'Variação'), enableSorting: false, cell: (i) => <Variacao valor={i.row.original.p.variacao} />, meta: { align: 'right' } },
      {
        id: 'movimento',
        header: () => cab('movimento', 'Diferença por dia útil'),
        enableSorting: false,
        cell: (i) => <span className={corVariacao(i.row.original.p.difDia)}>{sinalDec1(i.row.original.p.difDia)}</span>,
        meta: { align: 'right' },
      },
      {
        id: 'pecasB',
        header: () => cab('pecasB', 'Total no mês'),
        enableSorting: false,
        cell: (i) => {
          const v = i.row.original.p.pecasB;
          return v < 100 ? formatDec1(v) : formatInt(v);
        },
        meta: { align: 'right' },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [A, B, ordem],
  );

  const legenda = ORDEM_PECAS[ordem.campo] + (ordem.campo === 'movimento' ? '' : ordem.desc ? ' (maior primeiro)' : ' (menor primeiro)');

  return (
    <Card>
      <CardHeader
        title="Peças que saíram do estoque"
        description={
          <>
            {legenda}. <b className="font-medium text-ink-2">Clique num cabeçalho</b> para reordenar.
          </>
        }
        actions={
          <Input type="search" aria-label="Buscar produto de estoque" placeholder="Buscar produto" value={busca} onChange={(e) => setBusca(e.target.value)} className="w-52" />
        }
      />
      <div className="max-h-[520px] overflow-y-auto">
        <DataTable
          aria-label="Peças que saíram do estoque, por produto"
          data={linhas}
          columns={columns}
          getRowId={(r) => r.p.sku}
          density="compact"
          empty={
            <EmptyState
              title={busca ? 'Nenhum produto encontrado' : `Sem produtos acima do piso de ${MIN_PECAS_SKU} peças`}
              description={busca ? 'Tente outro trecho do nome.' : 'As peças dos dois meses ainda não chegaram a esse piso por produto.'}
            />
          }
          renderMobileCard={(r) => (
            <div className="grid gap-1">
              <div className="flex items-center justify-between gap-2">
                <span>
                  <code className="font-mono text-sm">{r.p.sku}</code>
                  {r.p.nVariantes > 1 && <span className="ml-1 text-ink-3">({r.p.nVariantes})</span>}
                </span>
                <Variacao valor={r.p.variacao} />
              </div>
              <p className="tabular text-ink-3">
                {formatDec1(r.p.diaA)} para {formatDec1(r.p.diaB)} peças por dia útil ({sinalDec1(r.p.difDia)})
              </p>
              {explicacao(r.p, A).map((t) => (
                <p key={t} className="text-xs text-ink-3">
                  {t}
                </p>
              ))}
            </div>
          )}
        />
      </div>
      <CardBody className="grid gap-2 pt-3 text-ink-3">
        <p>
          Uma linha por produto de prateleira: soma as variantes de quantidade (1X-, 3X-, 4X-) e o que a compra repõe junto. LEN-ECO-70X50 com LEN-CEL-70X50
          viram LEN-70X50, e GAZE-11FIOS com GAZE-13FIOS viram GAZE. A GAZE-ESTÉRIL fica de fora, é produto à parte. Para saber qual anúncio subiu, use a
          tabela de cima, que é por SKU exato.
        </p>
        <p>
          Peça é o que sai da prateleira. Para lençol, papel e perfurocortante é a unidade: 3X-LEN-ECO-70X50 são 3 peças. Nas famílias de embalagem fechada
          a peça é o pacote: 100X-TOU = 1 peça, 50X-TOU = 0,5, 24X-ATADURA = 2 dúzias. Peça não é esforço de separação: 50X-TOU dá mais trabalho que a peça
          inteira, porque obriga a abrir o pacote e contar. Entram produtos com pelo menos {MIN_PECAS_SKU} peças em algum dos meses.
        </p>
      </CardBody>
    </Card>
  );
}
