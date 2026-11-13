/**
 * Um "alimentador" ao vivo: tenta o canal Realtime e, se o banco não publica
 * as tabelas, passa a consultar periodicamente.
 *
 * Por que o plano B existe: em 05/11/2026 o banco de produção NÃO tinha
 * pedidos_separados, logs_acesso, operadores_metas nem configuracoes_gerais
 * na publicação do Realtime. O canal do app.js antigo responde SUBSCRIBED e
 * depois o servidor manda um erro de sistema que ninguém lê: o "tempo real"
 * do painel antigo nunca chegou. Aqui o canal usa `wait: true`, o erro vira
 * UNAVAILABLE e a fonte troca para consulta periódica sem ninguém perceber,
 * exceto pelo `liveMode()`.
 *
 * Por que existe a PONTE (consulta enquanto o canal não responde), medido em
 * 06/11/2026 no banco real: o servidor responde os pedidos de entrada em canal
 * UM DE CADA VEZ, ~4 s cada, inclusive os de canais que já foram fechados. Com
 * dois alimentadores e a montagem dupla do React (StrictMode, troca de rota),
 * a recusa do canal de eventos chegava 13 a 30 s depois, e o selo do topo
 * ficava esse tempo todo esperando. Agora, se o canal não confirmar em
 * `channelWaitMs`, o alimentador consulta como no modo consulta periódica: a
 * primeira consulta que der certo já marca o dado em dia. Quando o canal
 * confirma, a ponte para e a carga feita depois do SUBSCRIBED assume.
 *
 * Máquina de estados:
 *   realtime: abre canal; ponte: poll() a cada `pollIntervalMs` até o canal responder
 *             SUBSCRIBED → para a ponte → onUp() (carga) → onLive()
 *             erro/timeout/fechou → onDown(), espera (backoff) e reabre;
 *             3 falhas seguidas → consulta periódica
 *             UNAVAILABLE → consulta periódica (não adianta insistir)
 *   polling:  poll() a cada `pollIntervalMs`; falha → onDown() e backoff
 *
 * Toda ação assíncrona carrega a geração (`gen`) em que nasceu: resposta de
 * canal velho, carga velha ou timer velho é ignorada.
 */
import type { ChangePayload, ChannelBinding, ChannelHandle, ChannelStatus, DbPort } from './port';

export const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 20_000, 30_000] as const;
export const MAX_REALTIME_FAILURES = 3;
/** quanto esperar o canal confirmar antes de começar a consultar mesmo assim */
export const DEFAULT_CHANNEL_WAIT_MS = 1_500;

export interface FeedOptions {
  name: string;
  port: DbPort;
  bindings: ChannelBinding[];
  pollIntervalMs: number;
  /** canal sem resposta depois disto: consulta enquanto espera (ponte) */
  channelWaitMs?: number;
  onChange(payload: ChangePayload): void;
  /** Canal confirmado: sincronizar. Lançar = falha (reconecta). */
  onUp(): Promise<void>;
  /** Uma rodada do modo consulta (ou da ponte). Lançar = falha (tenta de novo com backoff). */
  poll(): Promise<void>;
  onLive(): void;
  onDown(): void;
  random?: () => number;
}

export type FeedMode = 'realtime' | 'polling';

export class Feed {
  mode: FeedMode = 'realtime';
  /** dados deste alimentador estão em dia (pelo canal ou por consulta) */
  up = false;

  private readonly o: FeedOptions;
  private running = false;
  private realtimeUnavailable = false;
  private gen = 0;
  private handle: ChannelHandle | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** falhas seguidas do canal (3 = desiste do Realtime) */
  private failures = 0;
  /** falhas seguidas da consulta (só para o backoff dela) */
  private pollFailures = 0;
  /** o canal desta geração confirmou: a ponte não roda mais */
  private subscribed = false;
  /** geração em que a última consulta começou (a ponte já rodou nesta geração?) */
  private polledGen: number | null = null;

  constructor(options: FeedOptions) {
    this.o = options;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Em dia PELO CANAL (não pela ponte nem por consulta periódica). */
  get streaming(): boolean {
    return this.up && this.channelTookOver;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.failures = 0;
    this.pollFailures = 0;
    this.begin();
  }

  stop() {
    this.running = false;
    this.reset();
    this.up = false;
  }

  /** Recomeça agora (navegador voltou a ficar online, ou a carga falhou fora do ciclo). */
  restart() {
    if (!this.running) return;
    this.reset();
    this.markDown();
    this.failures = 0;
    this.pollFailures = 0;
    // caiu para consulta por falha passageira? tenta o canal de novo
    if (!this.realtimeUnavailable) this.mode = 'realtime';
    this.begin();
  }

  private begin() {
    if (!this.running) return;
    if (this.realtimeUnavailable) this.mode = 'polling';
    if (this.mode === 'realtime') this.openRealtime();
    else void this.pollTick();
  }

  /** Nova geração: fecha o canal e cancela o timer. Respostas antigas passam a ser ignoradas. */
  private reset() {
    this.gen += 1;
    this.closeChannel();
    this.clearTimer();
    this.subscribed = false;
  }

  private closeChannel() {
    this.handle?.close();
    this.handle = null;
  }

  private clearTimer() {
    if (this.timer != null) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(ms: number, fn: () => void) {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.running) fn();
    }, ms);
  }

  private backoff(failures: number): number {
    const base = BACKOFF_MS[Math.min(Math.max(failures - 1, 0), BACKOFF_MS.length - 1)]!;
    const r = (this.o.random ?? Math.random)();
    return Math.round(base * (0.8 + 0.4 * r));
  }

  private markLive() {
    this.up = true;
    this.o.onLive();
  }

  private markDown() {
    this.up = false;
    this.o.onDown();
  }

  /** O canal confirmou: a ponte não deve mais rodar. */
  private get channelTookOver(): boolean {
    return this.mode === 'realtime' && this.subscribed;
  }

  private openRealtime() {
    this.reset();
    const g = this.gen;
    const handle = this.o.port.openChannel(
      { name: `${this.o.name}-${g}`, bindings: this.o.bindings },
      (payload) => {
        if (g === this.gen) this.o.onChange(payload);
      },
      (status, error) => {
        if (g === this.gen) void this.onStatus(g, status, error);
      },
    );
    if (g !== this.gen) {
      handle.close();
      return;
    }
    this.handle = handle;
    // ponte: se o canal demorar, consulta enquanto espera (status síncrono já pode ter decidido)
    if (!this.subscribed && this.mode === 'realtime' && this.timer == null) {
      this.schedule(this.o.channelWaitMs ?? DEFAULT_CHANNEL_WAIT_MS, () => void this.pollTick());
    }
  }

  private async onStatus(g: number, status: ChannelStatus, error?: Error) {
    if (status === 'SUBSCRIBED') {
      this.subscribed = true;
      this.clearTimer(); // para a ponte
      try {
        await this.o.onUp();
      } catch (e) {
        if (g !== this.gen) return;
        console.error(`[dados supabase] ${this.o.name}: carga depois de conectar falhou`, e);
        this.fail();
        return;
      }
      if (g !== this.gen) return;
      this.failures = 0;
      this.markLive();
      return;
    }
    if (status === 'UNAVAILABLE') {
      console.warn(
        `[dados supabase] ${this.o.name}: Realtime desligado para estas tabelas no banco; usando consulta periódica.`,
        error,
      );
      this.realtimeUnavailable = true;
      if (this.subscribed) {
        // confirmou e depois recusou (mensagem de sistema): a ponte já tinha parado
        this.switchToPolling();
        return;
      }
      // a ponte vira a consulta periódica; se ela já rodou, segue no ritmo dela (sem carga extra)
      this.closeChannel();
      this.mode = 'polling';
      this.failures = 0;
      if (this.polledGen !== this.gen) {
        this.clearTimer();
        void this.pollTick();
      }
      return;
    }
    console.warn(`[dados supabase] ${this.o.name}: canal ${status}`, error);
    this.fail();
  }

  private fail() {
    this.reset();
    this.markDown();
    this.failures += 1;
    if (this.mode === 'realtime' && this.failures >= MAX_REALTIME_FAILURES) {
      this.switchToPolling();
      return;
    }
    this.schedule(this.backoff(this.failures), () => this.begin());
  }

  private switchToPolling() {
    this.reset();
    this.mode = 'polling';
    this.failures = 0;
    this.pollFailures = 0;
    void this.pollTick();
  }

  /** Uma consulta: no modo consulta periódica, ou como ponte enquanto o canal não responde. */
  private async pollTick() {
    if (this.channelTookOver) return;
    const g = this.gen;
    this.polledGen = g;
    let failed: unknown = null;
    try {
      await this.o.poll();
    } catch (e) {
      failed = e ?? new Error('consulta falhou');
    }
    // geração velha, ou o canal confirmou durante a consulta: quem marca em dia é o onUp()
    if (g !== this.gen || this.channelTookOver) return;
    if (failed) {
      console.error(`[dados supabase] ${this.o.name}: consulta periódica falhou`, failed);
      this.markDown();
      this.pollFailures += 1;
      this.schedule(this.backoff(this.pollFailures), () => void this.pollTick());
      return;
    }
    this.pollFailures = 0;
    this.markLive();
    this.schedule(this.o.pollIntervalMs, () => void this.pollTick());
  }
}
