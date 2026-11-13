/**
 * Agregado de um mês, portado de `agregar` do planejamento.js.
 *
 * Some com as ~18 mil linhas cruas e sobra ~8 KB, que é o que a tela guarda
 * em cache. A chave é o SKU EXATO (o 3X- sobe enquanto o 4X- desce, e o
 * agrupado escondia isso). Guarda só a soma de `quantidade`: o multiplicador
 * e o tamanho da embalagem são aplicados na hora de mostrar, então corrigir
 * `familias_embalagem` arruma a tela sem invalidar mês fechado.
 */
import { dayKeyOf } from '@/lib/time';
import { skuCru } from './sku';
import type { MesAgregado, PedidoLinha, ProdutoAgg } from './types';

interface ItemBruto {
  sku?: unknown;
  quantidade?: unknown;
}

export function agregar(linhas: readonly PedidoLinha[]): MesAgregado {
  const dias: Record<string, number> = {};
  const prod: Record<string, ProdutoAgg> = {};
  const pares: Record<string, number> = {};
  let multi = 0;

  const slot = (sk: string): ProdutoAgg => {
    let p = prod[sk];
    if (!p) {
      p = { total: 0, q1: 0, q2: 0, solo: 0, acomp: 0, unid: 0 };
      prod[sk] = p;
    }
    return p;
  };

  for (const l of linhas) {
    // Dia operacional de São Paulo (o app antigo usava o fuso do navegador).
    const dia = dayKeyOf(l.data_hora);
    dias[dia] = (dias[dia] || 0) + 1;

    const itens: ItemBruto[] = Array.isArray(l.itens) ? (l.itens as ItemBruto[]) : [];
    if (itens.length > 1) multi++;

    const skus: string[] = [];
    for (const it of itens) {
      if (it && it.sku) {
        const s = String(it.sku).trim();
        if (s && skus.indexOf(s) === -1) skus.push(s);
      }
    }

    for (const it of itens) {
      if (!it || !it.sku) continue;
      const q = Number(it.quantidade) || 1;
      slot(skuCru(it.sku)).unid += q;
    }

    const quinzena = Number(dia.slice(8, 10)) <= 15 ? 'q1' : 'q2';
    const distintos: Record<string, true> = {};
    for (const s of skus) distintos[skuCru(s)] = true;
    const lista = Object.keys(distintos);
    for (const sk of lista) {
      const s = slot(sk);
      s.total++;
      s[quinzena]++;
      // Saiu sozinho ou dividindo a caixa com outro produto? É o que separa
      // "vendeu mais" de "passou a ser vendido junto" (pedido misto).
      if (lista.length > 1) s.acomp++;
      else s.solo++;
    }

    if (skus.length === 2) {
      const k = skus.slice().sort().join('||');
      pares[k] = (pares[k] || 0) + 1;
    }
  }

  // Poda: só pares que podem chegar ao piso do detector.
  const paresPodados: Record<string, number> = {};
  for (const k of Object.keys(pares)) {
    const v = pares[k] ?? 0;
    if (v >= 5) paresPodados[k] = v;
  }

  return { dias, prod, pares: paresPodados, totalPedidos: linhas.length, pedidosMulti: multi };
}
