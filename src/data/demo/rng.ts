/** Gerador pseudoaleatório determinístico (mulberry32) e utilidades. */

export interface Rng {
  /** 0 <= x < 1 */
  next(): number;
  /** inteiro em [min, max] */
  int(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(list: readonly T[]): T;
  weighted<T>(list: readonly { item: T; weight: number }[]): T;
  shuffle<T>(list: readonly T[]): T[];
}

export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)] as (typeof list)[number],
    weighted: (list) => {
      const total = list.reduce((s, x) => s + x.weight, 0);
      let r = next() * total;
      for (const x of list) {
        r -= x.weight;
        if (r < 0) return x.item;
      }
      return (list[list.length - 1] as (typeof list)[number]).item;
    },
    shuffle: (list) => {
      const out = [...list];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j] as (typeof out)[number], out[i] as (typeof out)[number]];
      }
      return out;
    },
  };
  return rng;
}
