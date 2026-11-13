/**
 * Relógio do demo. Padrão: hora real. Para apresentar o painel fora do
 * expediente, 'HH:MM' faz o relógio PARTIR desse horário de hoje e seguir
 * andando em tempo real (assim o feed ao vivo continua mexendo).
 * Persistido em localStorage 'hope-demo-clock'.
 */
import { atTime, todayKey } from '@/lib/time';

export type DemoClockMode = 'real' | string;
const KEY = 'hope-demo-clock';
const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

let mode: DemoClockMode = 'real';
let baseMs = 0;
let anchorRealMs = 0;
let loaded = false;
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function apply(next: DemoClockMode) {
  if (next === 'real') {
    mode = 'real';
    return;
  }
  const m = HHMM.exec(next);
  if (!m) throw new Error(`Horário inválido: ${next}. Use HH:MM ou 'real'.`);
  const real = Date.now();
  mode = `${String(Number(m[1])).padStart(2, '0')}:${m[2]}`;
  baseMs = atTime(todayKey(new Date(real)), Number(m[1]), Number(m[2])).getTime();
  anchorRealMs = real;
}

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  const saved = storage()?.getItem(KEY);
  if (saved) {
    try {
      apply(saved);
    } catch {
      mode = 'real';
    }
  }
}

export function getDemoClock(): DemoClockMode {
  ensureLoaded();
  return mode;
}

export function setDemoClock(next: DemoClockMode): void {
  ensureLoaded();
  apply(next);
  try {
    storage()?.setItem(KEY, mode);
  } catch {
    /* sem persistência */
  }
  listeners.forEach((l) => l());
}

export function demoNow(): Date {
  ensureLoaded();
  if (mode === 'real') return new Date();
  return new Date(baseMs + (Date.now() - anchorRealMs));
}

export function onDemoClockChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
