/**
 * Carga do Planejamento: os três meses (dois fechados e o corrente), com o
 * cache mensal, e as contas do modelo. Função pura em relação ao ambiente:
 * leitor, armazenamento e relógio entram por parâmetro.
 */
import type { DayKey } from '@/lib/time';
import { type Comparativo, compararMeses } from '../model/comparar';
import { agregar } from '../model/agregar';
import { chavesDoPlanejamento } from '../model/datas';
import { type Projecao, projetar } from '../model/projecao';
import { FAMILIAS_PADRAO, type FamiliaDoBanco, mesclarFamilias } from '../model/sku';
import type { ContextoPlanejamento, MesAgregado } from '../model/types';
import { gravarCache, lerCache } from './cache';
import type { LeitorMes, Progresso } from './leitores';

export interface DadosPlanejamento {
  ctx: ContextoPlanejamento;
  comparativo: Comparativo;
  /** null quando os dois meses fechados não bastam para medir o fator de dia da semana */
  projecao: Projecao | null;
}

export interface DependenciasCarga {
  hoje: DayKey;
  ler: LeitorMes;
  familias: () => Promise<FamiliaDoBanco[]>;
  storage: Storage | null;
  prefixoCache: string;
  agora: () => number;
  onProgresso?: (p: Progresso) => void;
}

/** Lê um mês: do cache quando vale, senão da fonte, e grava o agregado. */
export async function carregarMes(chave: string, fechado: boolean, d: DependenciasCarga): Promise<MesAgregado> {
  const hit = lerCache(d.storage, d.prefixoCache, chave, d.agora());
  if (hit) return hit;
  const linhas = await d.ler(chave, d.onProgresso);
  const agg = agregar(linhas);
  gravarCache(d.storage, d.prefixoCache, chave, agg, fechado, d.agora());
  return agg;
}

export async function carregarPlanejamento(d: DependenciasCarga): Promise<DadosPlanejamento> {
  const { chaveAtual, chaveB, chaveA } = chavesDoPlanejamento(d.hoje);

  let familias = FAMILIAS_PADRAO;
  try {
    familias = mesclarFamilias(FAMILIAS_PADRAO, await d.familias());
  } catch {
    /* mantém o padrão embutido: melhor que contar pacote fechado como 100 peças */
  }

  const a = await carregarMes(chaveA, true, d);
  const b = await carregarMes(chaveB, true, d);
  const atual = await carregarMes(chaveAtual, false, d);

  const ctx: ContextoPlanejamento = {
    meses: { [chaveA]: a, [chaveB]: b, [chaveAtual]: atual },
    chaveA,
    chaveB,
    chaveAtual,
    hoje: d.hoje,
    familias,
  };
  return { ctx, comparativo: compararMeses(ctx, chaveA, chaveB), projecao: projetar(ctx) };
}
