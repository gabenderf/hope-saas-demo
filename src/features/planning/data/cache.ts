/**
 * Cache local do agregado mensal, igual ao do planejamento.js: mês FECHADO
 * nunca expira (não muda mais); mês corrente vale 10 minutos; "Recarregar"
 * limpa tudo. O armazenamento é injetado para o teste não depender do navegador.
 */
import { env } from '@/lib/env';
import { CACHE_MES_CORRENTE_MS, CACHE_PREFIXO } from '../model/constantes';
import type { MesAgregado } from '../model/types';

interface Registro {
  gravadoEm: number;
  fechado: boolean;
  dados: MesAgregado;
}

/** Prefixo do cache por fonte: o demo não pode se misturar com o agregado do banco real. */
export function prefixoDoCache(modo: 'demo' | 'supabase'): string {
  if (modo === 'demo') return `${CACHE_PREFIXO}demo-`;
  // O projeto entra na chave: trocar o .env entre bancos não pode mostrar meses do banco errado.
  return `${CACHE_PREFIXO}${hashCurto(env.supabaseUrl ?? 'supabase')}-`;
}

function hashCurto(texto: string): string {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function formatoValido(d: unknown): d is MesAgregado {
  if (!d || typeof d !== 'object') return false;
  const o = d as Partial<MesAgregado>;
  return typeof o.dias === 'object' && o.dias !== null && typeof o.prod === 'object' && o.prod !== null && typeof o.pares === 'object' && o.pares !== null;
}

export function lerCache(storage: Storage | null, prefixo: string, chave: string, agora: number): MesAgregado | null {
  if (!storage) return null;
  try {
    const bruto = storage.getItem(prefixo + chave);
    if (!bruto) return null;
    const obj = JSON.parse(bruto) as Partial<Registro>;
    if (!formatoValido(obj.dados)) return null;
    if (obj.fechado) return obj.dados;
    if (typeof obj.gravadoEm === 'number' && agora - obj.gravadoEm < CACHE_MES_CORRENTE_MS) return obj.dados;
    return null;
  } catch {
    return null;
  }
}

export function gravarCache(storage: Storage | null, prefixo: string, chave: string, dados: MesAgregado, fechado: boolean, agora: number): void {
  if (!storage) return;
  try {
    const registro: Registro = { gravadoEm: agora, fechado, dados };
    storage.setItem(prefixo + chave, JSON.stringify(registro));
  } catch {
    /* quota estourada: segue sem cache */
  }
}

export function limparCache(storage: Storage | null, prefixo: string): void {
  if (!storage) return;
  try {
    const apagar: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(prefixo)) apagar.push(k);
    }
    for (const k of apagar) storage.removeItem(k);
  } catch {
    /* ignora */
  }
}

export function storageDoNavegador(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
