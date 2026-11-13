/**
 * Leitores de um mês de pedidos. Cada fonte devolve as linhas cruas de
 * `pedidos_separados` do mês (fuso de São Paulo); o agregado é feito depois.
 *
 * Esta pasta pode falar com o banco (só leitura); a tela usa o hook.
 */
import type { OperationsSource } from '@/data/types';
import { createSupabasePort } from '@/data/supabase/port';
import { getSupabase } from '@/lib/supabase';
import { todayKey, type DayKey } from '@/lib/time';
import { diasDoMes } from '@/lib/calendar';
import { PAGINA } from '../model/constantes';
import { intervaloDoMes } from '../model/datas';
import type { FamiliaDoBanco } from '../model/sku';
import type { PedidoLinha } from '../model/types';
import { linhasDoDia } from './linhas';

export interface Progresso {
  /** 'YYYY-MM' em leitura */
  mes: string;
  /** linhas lidas até agora neste mês */
  linhas: number;
}

export type LeitorMes = (chave: string, onProgresso?: (p: Progresso) => void) => Promise<PedidoLinha[]>;

const MAX_PAGINAS = 60;
const DIAS_EM_PARALELO = 4;

/** Banco real: consulta mensal paginada de 1.000, como o planejamento.js. */
export function leitorSupabase(): LeitorMes {
  return async (chave, onProgresso) => {
    const { inicio, fim } = intervaloDoMes(chave);
    const client = getSupabase();
    const port = createSupabasePort(client);
    const tudo: PedidoLinha[] = [];
    for (let p = 0; p < MAX_PAGINAS; p++) {
      const de = p * PAGINA;
      // Ordem total (data_hora, id_registro): só por data_hora, horário repetido na
      // virada de página duplica ou perde bipagem (ver data/supabase/queries.ts).
      const lote = (await port.select({
        table: 'pedidos_separados',
        columns: 'data_hora,itens',
        gte: { column: 'data_hora', value: inicio.toISOString() },
        lt: { column: 'data_hora', value: fim.toISOString() },
        order: [
          { column: 'data_hora', ascending: true },
          { column: 'id_registro', ascending: true },
        ],
        range: { from: de, to: de + PAGINA - 1 },
      })) as unknown as PedidoLinha[];
      for (const l of lote) tudo.push(l);
      onProgresso?.({ mes: chave, linhas: tudo.length });
      if (lote.length < PAGINA) return tudo;
    }
    throw new Error('O mês tem mais bipagens do que o limite de leitura; avise o administrador.');
  };
}

/** Demonstração: monta o mês a partir dos eventos do dia da fonte de operações. */
export function leitorDaFonte(source: Pick<OperationsSource, 'getDayEvents' | 'now'>): LeitorMes {
  return async (chave, onProgresso) => {
    const hoje = todayKey(source.now());
    const dias: DayKey[] = diasDoMes(chave).filter((d) => d <= hoje);
    const tudo: PedidoLinha[] = [];
    for (let i = 0; i < dias.length; i += DIAS_EM_PARALELO) {
      const lote = await Promise.all(dias.slice(i, i + DIAS_EM_PARALELO).map((d) => source.getDayEvents(d)));
      for (const ev of lote) for (const l of linhasDoDia(ev)) tudo.push(l);
      onProgresso?.({ mes: chave, linhas: tudo.length });
    }
    return tudo;
  };
}

/** Banco real: tamanhos de embalagem. Falha de leitura não derruba a aba (cai no padrão). */
export async function lerFamiliasSupabase(): Promise<FamiliaDoBanco[]> {
  const r = await getSupabase().from('familias_embalagem').select('familia,tamanho_embalagem');
  if (r.error || !r.data) return [];
  return r.data as FamiliaDoBanco[];
}

/** Demonstração: não há tabela; vale o padrão embutido. */
export async function lerFamiliasDemo(): Promise<FamiliaDoBanco[]> {
  return [];
}
