import type { QueueSnapshot } from '../data/types';

export interface QueueReading {
  /** pedidos de fila_do_dia (a união do dia); null = a contagem não veio */
  seen: number | null;
  /** pendentes lidos (fila_pendente) */
  pending: number;
  /** maior soma por rodada das capturas do coletor */
  captured: number;
  /** fila_do_dia menor que o capturado, ou sem contagem: o coletor recusa gravar */
  truncated: boolean;
  /** pendentes > vistos: o subconjunto não pode passar do todo */
  inconsistent: boolean;
  /** truncated || inconsistent: o coletor recusa gravar a previsão */
  refused: boolean;
}

/**
 * ESPELHO de conferirLeituraDaFila() em coletor-fila/background.js. Os dois lados têm de concordar:
 * um recusa gravar, o outro acende a faixa. Corrigir só um é o pior desfecho.
 *
 *  - Uma etapa pode ter mais de um snapshot na mesma rodada (a escalada repete a tela quando a
 *    primeira leitura vem incompleta): fica a MAIOR captura de cada (rodada, etapa).
 *    Caso real de 27/08/2026: Enviar 0 + Imprimir 418 (incompleta) + Imprimir 434 (escalada) = 434, não 852.
 *  - Compara por rodada e fica com a maior: entre rodadas o mesmo pedido reaparece.
 *  - Só status ok e incompleto entram.
 *  - `vistos` nulo com algo capturado também recusa; e `lidosPendentes > vistos` recusa (pendentes é subconjunto).
 */
export function readQueue(seen: number | null, snapshots: QueueSnapshot[], pending = 0): QueueReading {
  const byStage = new Map<string, number>();
  for (const s of snapshots) {
    if (s.status !== 'ok' && s.status !== 'incompleto') continue;
    const key = `${s.rodada}|${s.etapa}`;
    const got = s.total_capturado ?? 0;
    const prev = byStage.get(key);
    if (prev === undefined || got > prev) byStage.set(key, got);
  }
  const byRound = new Map<string, number>();
  for (const [key, got] of byStage) {
    const round = key.slice(0, key.lastIndexOf('|'));
    byRound.set(round, (byRound.get(round) ?? 0) + got);
  }
  let captured = 0;
  for (const v of byRound.values()) if (v > captured) captured = v;
  const truncated = captured > 0 && (seen == null || seen < captured);
  const inconsistent = seen != null && pending > seen;
  return { seen, pending, captured, truncated, inconsistent, refused: truncated || inconsistent };
}
