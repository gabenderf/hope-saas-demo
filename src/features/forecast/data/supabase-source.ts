/**
 * Adaptador Supabase da Previsão. Leitura: mesmas consultas e filtros do previsao.js antigo, com o
 * dia operacional de São Paulo. Gravação (só o tamanho da equipe): somente com `canWrite` e sessão
 * de login, a mesma trava da fonte principal (docs/dados-supabase.md, "Gravação").
 */
import { accessDenied, friendlyWrite, ReadOnlyError } from '@/data/supabase/errors';
import { createSupabasePort, type DbPort } from '@/data/supabase/port';
import { getSupabase } from '@/lib/supabase';
import type { DayKey } from '@/lib/time';
import type { DayPlan, ForecastConfig, ForecastData, ForecastSource, PendingOrder, QueueSnapshot, SkuDemandRow } from './types';

const PAGE = 1000;

interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * Lê TODAS as linhas paginando. O PostgREST corta em 1000 sem avisar (aconteceu em 24/08/2026:
 * fila de 1.160 lida como 1.000). Trava em 50 páginas para nunca virar laço infinito.
 */
async function all<T>(query: (from: number, to: number) => PromiseLike<PageResult<T>>): Promise<T[]> {
  let out: T[] = [];
  for (let p = 0; p < 50; p++) {
    const from = p * PAGE;
    const r = await query(from, from + PAGE - 1);
    if (r.error) throw new Error(r.error.message);
    const batch = r.data ?? [];
    out = out.concat(batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

export interface SupabaseForecastDeps {
  /** liberação explícita de gravação; padrão false (preview de dados reais com login de demonstração) */
  canWrite?: boolean;
  /** só para testes */
  port?: DbPort;
}

const MIN_TEAM = 1;
const MAX_TEAM = 20;

export function createSupabaseForecastSource(deps: SupabaseForecastDeps = {}): ForecastSource {
  const canWrite = deps.canWrite === true;
  let port: DbPort | null = deps.port ?? null;
  const getPort = () => (port ??= createSupabasePort(getSupabase()));

  /** Grava equipe_padrao. `undo` marca o cabeçalho de desfazer (rótulo da auditoria). */
  async function writeTeamSize(value: number, undo: boolean): Promise<void> {
    if (!canWrite) throw new ReadOnlyError();
    if (!Number.isInteger(value) || value < MIN_TEAM || value > MAX_TEAM) {
      throw new Error(`Equipe inválida: use um número inteiro entre ${MIN_TEAM} e ${MAX_TEAM}.`);
    }
    const db = getPort();
    if (!(await db.hasSession().catch(() => false))) throw new ReadOnlyError();
    try {
      const rows = await db.write({
        table: 'config_previsao',
        action: 'update',
        values: { equipe_padrao: value },
        eq: { column: 'id', value: 1 },
        undo,
      });
      if (rows.length !== 1) throw accessDenied();
    } catch (e) {
      throw friendlyWrite('gravar a equipe da previsão', e);
    }
  }

  return {
    canWrite,

    async load(day: DayKey): Promise<ForecastData> {
      const c = getSupabase();

      const config = await c.from('config_previsao').select('*').eq('id', 1).maybeSingle();
      if (config.error) throw new Error(config.error.message);

      const pending = await all<PendingOrder>((from, to) =>
        c.from('fila_pendente').select('num_pedido,expira_em,prazo_origem').eq('dia_operacional', day).order('num_pedido').range(from, to),
      );

      // Só a CONTAGEM importa: head:true não baixa linha nenhuma, então some o risco de truncamento.
      const seen = await c.from('fila_do_dia').select('num_pedido', { count: 'exact', head: true }).eq('dia_operacional', day);
      if (seen.error) throw new Error(seen.error.message);

      const snaps = await c
        .from('fila_snapshots')
        .select('raspado_em,etapa,status,total_capturado,rodada,sub_aba')
        .eq('dia_operacional', day)
        .order('raspado_em', { ascending: true });
      if (snaps.error) throw new Error(snaps.error.message);

      const plan = await c.from('previsao_dia').select('*').eq('dia_operacional', day).maybeSingle();
      if (plan.error) throw new Error(plan.error.message);

      const skus = await all<SkuDemandRow>((from, to) =>
        c.from('demanda_sku_dia').select('*').eq('dia_operacional', day).order('sku').range(from, to),
      );

      return {
        day,
        config: config.data ? normalizeConfig(config.data as Record<string, unknown>) : null,
        pending,
        seenToday: seen.count ?? null,
        snapshots: (snaps.data ?? []) as QueueSnapshot[],
        plan: (plan.data as DayPlan | null) ?? null,
        skus,
      };
    },

    async setTeamSize(value: number): Promise<{ undo: () => Promise<void> }> {
      if (!canWrite) throw new ReadOnlyError();
      const db = getPort();
      let rows: Awaited<ReturnType<DbPort['select']>>;
      try {
        if (!(await db.hasSession().catch(() => false))) throw new ReadOnlyError();
        rows = await db.select({ table: 'config_previsao', columns: 'equipe_padrao', eq: { column: 'id', value: 1 } });
      } catch (e) {
        throw friendlyWrite('ler a equipe da previsão', e);
      }
      const previous = rows[0] ? Number(rows[0].equipe_padrao) : NaN;
      if (!Number.isFinite(previous)) throw new Error('Configuração da Previsão não encontrada.');
      await writeTeamSize(value, false);
      return { undo: () => writeTeamSize(previous, true) };
    },
  };
}

/** NUMERIC chega como string do PostgREST; TIME chega como "07:40:00". */
function normalizeConfig(r: Record<string, unknown>): ForecastConfig {
  const hhmm = (v: unknown, fallback: string) => (typeof v === 'string' ? v.slice(0, 5) : fallback);
  return {
    inicio_turno: hhmm(r.inicio_turno, '07:40'),
    inicio_producao: hhmm(r.inicio_producao, '08:30'),
    fim_turno: hhmm(r.fim_turno, '17:40'),
    almoco_inicio: hhmm(r.almoco_inicio, '13:00'),
    almoco_fim: hhmm(r.almoco_fim, '14:00'),
    equipe_padrao: Number(r.equipe_padrao ?? 3),
    ritmo_padrao: Number(r.ritmo_padrao ?? 35),
    fatores_dia_semana: (r.fatores_dia_semana as Record<string, number> | null) ?? {},
    curva_chegada: (r.curva_chegada as Record<string, number> | null) ?? {},
    piso_ritmo_necessario: r.piso_ritmo_necessario == null ? null : Number(r.piso_ritmo_necessario),
    ritmo_inclui_pausas: r.ritmo_inclui_pausas !== false,
    fator_pessimista: Number(r.fator_pessimista ?? 0.75),
  };
}
