/**
 * Armazém em memória dos eventos de HOJE: carga inicial + inserts ao vivo.
 *
 * Linhas de pedidos_separados e logs_acesso não mudam depois de gravadas (RLS
 * não aceita UPDATE nem DELETE pela anon key), então a união por id é sempre
 * correta: o mesmo id é o mesmo evento.
 *
 * Corrida carga × ao vivo: `beginSync()` abre um registro de tudo que chegar
 * ao vivo enquanto a carga roda; `commitSync()` troca o conteúdo pela carga
 * UNIDA a esse registro. Assim:
 *  - evento que chegou durante a carga e também veio na carga: um só (mesmo id);
 *  - evento que chegou durante a carga e a consulta já tinha passado: entra pelo registro;
 *  - carga antiga superada por uma mais nova (reconexão no meio): descartada pelo token.
 */
import type { DayKey } from '@/lib/time';
import type { AccessEvent, DayEvents, ScanEvent } from '../types';
import type { EventLists } from './queries';
import { compareEvents } from './rows';

export class DayStore {
  readonly day: DayKey;
  /** a carga mais recente terminou e, desde então, o canal não teve lacuna */
  synced = false;
  /** já houve ao menos uma carga completa deste dia */
  loadedOnce = false;

  private scans = new Map<string, ScanEvent>();
  private access = new Map<string, AccessEvent>();
  private pending: { scans: Map<string, ScanEvent>; access: Map<string, AccessEvent> } | null = null;
  private token = 0;
  private snapshotCache: DayEvents | null = null;
  private maxScanAt: string | null = null;
  private maxAccessAt: string | null = null;

  constructor(day: DayKey) {
    this.day = day;
  }

  /** Devolve true se o evento é novo (deve ser emitido). */
  addScan(scan: ScanEvent): boolean {
    this.pending?.scans.set(scan.id, scan);
    if (this.scans.has(scan.id)) return false;
    this.scans.set(scan.id, scan);
    if (!this.maxScanAt || scan.at > this.maxScanAt) this.maxScanAt = scan.at;
    this.snapshotCache = null;
    return true;
  }

  addAccess(access: AccessEvent): boolean {
    this.pending?.access.set(access.id, access);
    if (this.access.has(access.id)) return false;
    this.access.set(access.id, access);
    if (!this.maxAccessAt || access.at > this.maxAccessAt) this.maxAccessAt = access.at;
    this.snapshotCache = null;
    return true;
  }

  beginSync(): number {
    this.token += 1;
    this.pending = { scans: new Map(), access: new Map() };
    return this.token;
  }

  /** false = esta carga foi superada por outra mais nova e foi descartada. */
  commitSync(token: number, loaded: EventLists): boolean {
    if (token !== this.token || !this.pending) return false;
    const scans = new Map<string, ScanEvent>();
    const access = new Map<string, AccessEvent>();
    for (const s of loaded.scans) scans.set(s.id, s);
    for (const a of loaded.access) access.set(a.id, a);
    for (const [id, s] of this.pending.scans) if (!scans.has(id)) scans.set(id, s);
    for (const [id, a] of this.pending.access) if (!access.has(id)) access.set(id, a);
    this.scans = scans;
    this.access = access;
    this.pending = null;
    this.maxScanAt = maxAt(scans.values());
    this.maxAccessAt = maxAt(access.values());
    this.snapshotCache = null;
    this.synced = true;
    this.loadedOnce = true;
    return true;
  }

  abortSync(token: number) {
    if (token === this.token) this.pending = null;
  }

  /** Lacuna no canal: o conteúdo continua, mas não é mais garantidamente completo. */
  markGap() {
    this.synced = false;
  }

  latest(): { scanAt: string | null; accessAt: string | null } {
    return { scanAt: this.maxScanAt, accessAt: this.maxAccessAt };
  }

  /** Em ordem crescente (data_hora, id). Arrays novos a cada chamada; objetos compartilhados. */
  snapshot(): DayEvents {
    if (!this.snapshotCache) {
      this.snapshotCache = {
        day: this.day,
        scans: [...this.scans.values()].sort(compareEvents),
        access: [...this.access.values()].sort(compareEvents),
      };
    }
    return { day: this.day, scans: [...this.snapshotCache.scans], access: [...this.snapshotCache.access] };
  }
}

function maxAt(items: Iterable<{ at: string }>): string | null {
  let max: string | null = null;
  for (const i of items) if (!max || i.at > max) max = i.at;
  return max;
}
