import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditEntry } from '@/data/types';
import { atTime } from '@/lib/time';
import { notify, setNotificationClock } from './notify';
import {
  initialConnectionTracker,
  globalGoalAlert,
  isShiftTime,
  reachedMilestone,
  stationAlerts,
  stepConnection,
} from './rules';
import { useNotificationStore } from './store';

vi.mock('@/components/ui/toast', () => ({ toast: vi.fn() }));
import { toast } from '@/components/ui/toast';

const DAY = '2026-11-05';
const at = (h: number, m = 0) => atTime(DAY, h, m);

describe('conexao', () => {
  it('só alerta depois de 60 s fora do ar e avisa quando volta', () => {
    let t = initialConnectionTracker;
    let r = stepConnection(t, 'offline', 0);
    expect(r.action).toBeNull();
    t = r.next;
    r = stepConnection(t, 'reconnecting', 60_000);
    expect(r.action).toBeNull();
    r = stepConnection(r.next, 'offline', 61_000);
    expect(r.action).toBe('alert');
    r = stepConnection(r.next, 'offline', 120_000);
    expect(r.action).toBeNull();
    r = stepConnection(r.next, 'live', 130_000);
    expect(r.action).toBe('restored');
    expect(stepConnection(r.next, 'live', 140_000).action).toBeNull();
  });
  it('queda curta não alerta nem avisa de volta', () => {
    const down = stepConnection(initialConnectionTracker, 'reconnecting', 0).next;
    expect(stepConnection(down, 'live', 30_000).action).toBeNull();
  });
});

describe('bancada-parada', () => {
  const op = (lastActivityAt: string, over = {}) => ({
    name: 'Diego',
    station: '03',
    status: 'ativo' as const,
    lastActivityAt,
    ...over,
  });
  it('dispara com 20 min ou mais, com texto de fato', () => {
    const [a] = stationAlerts([op(at(9, 40).toISOString())], at(10, 0));
    expect(a?.title).toBe('Bancada 03 sem bipes há 20 min');
    expect(a?.body).toBe('Diego');
    expect(a?.cooldownMin).toBe(60);
    expect(a?.dedupeKey).toBe('bancada-parada:03');
  });
  it('não dispara com 19 min, ausente, ou sem bancada', () => {
    expect(stationAlerts([op(at(9, 41).toISOString())], at(10, 0))).toHaveLength(0);
    expect(stationAlerts([op(at(9, 0).toISOString(), { status: 'ausente' })], at(10, 0))).toHaveLength(0);
    expect(stationAlerts([op(at(9, 0).toISOString(), { station: null })], at(10, 0))).toHaveLength(0);
  });
  it('respeita o turno e o intervalo', () => {
    expect(isShiftTime(at(7, 39))).toBe(false);
    expect(isShiftTime(at(7, 40))).toBe(true);
    expect(isShiftTime(at(13, 30))).toBe(false);
    expect(isShiftTime(at(14, 0))).toBe(true);
    expect(isShiftTime(at(17, 41))).toBe(false);
    expect(stationAlerts([op(at(12, 0).toISOString())], at(13, 30))).toHaveLength(0);
  });
});

describe('meta-global', () => {
  const entry = (actorId: string, over: Partial<AuditEntry> = {}): AuditEntry => ({
    id: 'a1',
    at: at(9, 12).toISOString(),
    actor: { id: actorId, name: 'Gabriel' },
    action: 'meta-global.definir',
    summary: 'alterou a meta global de 38 para 36/h',
    after: 36,
    ...over,
  });
  it('avisa quando OUTRA pessoa alterou', () => {
    const a = globalGoalAlert(entry('u2'), 'u1');
    expect(a?.title).toBe('Meta global alterada para 36/h');
    expect(a?.body).toBe('por Gabriel às 09:12');
    expect(a?.severity).toBe('info');
  });
  it('ignora a própria alteração e outras ações', () => {
    expect(globalGoalAlert(entry('u1'), 'u1')).toBeNull();
    expect(globalGoalAlert(entry('u2', { action: 'operador.criar' }), 'u1')).toBeNull();
  });
  it('lê o valor do resumo quando after não traz número', () => {
    expect(globalGoalAlert(entry('u2', { after: undefined }), 'u1')?.title).toBe('Meta global alterada para 36/h');
  });
  it('remoção tem texto próprio', () => {
    expect(globalGoalAlert(entry('u2', { action: 'meta-global.remover' }), 'u1')?.title).toBe('Meta global removida');
  });
});

describe('marco-do-dia', () => {
  it('devolve o maior marco ultrapassado', () => {
    expect(reachedMilestone(499)).toBeNull();
    expect(reachedMilestone(500)).toBe(500);
    expect(reachedMilestone(1230)).toBe(1000);
    expect(reachedMilestone(null)).toBeNull();
  });
});

describe('notify: dedupe, silêncio e preferências', () => {
  let nowMs = at(10).getTime();
  beforeEach(() => {
    nowMs = at(10).getTime();
    setNotificationClock(() => new Date(nowMs));
    useNotificationStore.setState({ items: [], prefs: {}, silence: {}, dismissed: [] });
    useNotificationStore.getState().setGlobals({ navegadorPermitido: true });
    vi.mocked(toast).mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  const base = { rule: 'bancada-parada', severity: 'atencao' as const, title: 'Bancada 03 sem bipes há 20 min', dedupeKey: 'k' };

  it('mesma chave dentro do cooldown é descartada; depois passa', () => {
    expect(notify({ ...base, cooldownMin: 60 })).not.toBeNull();
    nowMs += 59 * 60_000;
    expect(notify({ ...base, cooldownMin: 60 })).toBeNull();
    nowMs += 2 * 60_000;
    expect(notify({ ...base, cooldownMin: 60 })).not.toBeNull();
    expect(useNotificationStore.getState().items).toHaveLength(2);
  });
  it('cooldown padrão é 30 min', () => {
    notify(base);
    nowMs += 29 * 60_000;
    expect(notify(base)).toBeNull();
    nowMs += 2 * 60_000;
    expect(notify(base)).not.toBeNull();
  });
  it('regra desligada descarta', () => {
    useNotificationStore.getState().setPref('bancada-parada', { ativa: false }, { ativa: true, toast: true, navegador: true });
    expect(notify(base)).toBeNull();
    expect(useNotificationStore.getState().items).toHaveLength(0);
  });
  it('marco-do-dia vem desligada por padrão', () => {
    expect(notify({ rule: 'marco-do-dia', severity: 'info', title: 'x', dedupeKey: 'm' })).toBeNull();
  });
  it('toast só para atenção e crítico, e respeita a preferência', () => {
    notify(base);
    expect(toast).toHaveBeenCalledTimes(1);
    notify({ rule: 'meta-global', severity: 'info', title: 'i', dedupeKey: 'i' });
    expect(toast).toHaveBeenCalledTimes(1);
    useNotificationStore.getState().setPref('bancada-parada', { toast: false }, { ativa: true, toast: true, navegador: true });
    notify({ ...base, dedupeKey: 'k2' });
    expect(toast).toHaveBeenCalledTimes(1);
  });
  it('lista guarda no máximo 200, mais recente primeiro', () => {
    for (let i = 0; i < 205; i++) notify({ ...base, dedupeKey: `k${i}`, title: `t${i}` });
    const items = useNotificationStore.getState().items;
    expect(items).toHaveLength(200);
    expect(items[0]?.title).toBe('t204');
  });

  describe('Notification do navegador', () => {
    const make = (permission: string, hidden: boolean) => {
      const ctor = vi.fn();
      Object.assign(ctor, { permission });
      vi.stubGlobal('Notification', ctor);
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(hidden ? 'hidden' : 'visible');
      return ctor;
    };
    it('só com a aba escondida e permissão concedida', () => {
      let ctor = make('granted', false);
      notify(base);
      expect(ctor).not.toHaveBeenCalled();

      ctor = make('denied', true);
      notify({ ...base, dedupeKey: 'b' });
      expect(ctor).not.toHaveBeenCalled();

      ctor = make('granted', true);
      notify({ ...base, dedupeKey: 'c' });
      expect(ctor).toHaveBeenCalledWith(base.title, expect.objectContaining({ tag: 'c' }));
    });
    it('preferência do navegador desligada impede', () => {
      const ctor = make('granted', true);
      useNotificationStore.getState().setPref('bancada-parada', { navegador: false }, { ativa: true, toast: true, navegador: true });
      notify(base);
      expect(ctor).not.toHaveBeenCalled();
    });
  });
});
