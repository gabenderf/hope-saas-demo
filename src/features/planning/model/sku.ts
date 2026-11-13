/**
 * SKU -> peça, produto e grupo de estoque. Portado de ../../dashboard-expedicao/planejamento.js
 * (mesmos nomes). Regras e porquês em ../../dashboard-expedicao/CLAUDE.md, "Aba Planejamento":
 * peça é EMBALAGEM, não unidade.
 *
 * Os 47 casos de ../../dashboard-expedicao/teste-pecas.js estão portados em sku.test.ts.
 */

/**
 * Embalagens fechadas por família, do maior para o menor tamanho. Confirmado
 * pelo dono do projeto em 02/09/2026. `familias_embalagem` no banco é SOMADO
 * por cima (ver mesclarFamilias): pode acrescentar família ou corrigir tamanho
 * sem deploy, mas apagar uma linha lá não faz a aba voltar a contar pacote
 * fechado como 100 peças. Famílias de DUAS embalagens só existem aqui.
 *
 * A chave de touca é `TOU`, não `TOU-DESC` como está no banco: o catálogo tem
 * `100X-TOU-TNT-BRA` sem o "DESC", e casar só por `TOU-DESC` contava aquele
 * pacote como 100 peças em vez de 1.
 */
export type Familias = Readonly<Record<string, number | readonly number[]>>;

export const FAMILIAS_PADRAO: Familias = {
  TOU: [100],
  AGULHA: [100],
  ATADURA: [12],
  'LUVA-SOFT': [100, 20], // caixa de 100 E caixinha de 20
  LUVA: [100],
  SERIN: [100],
};

/** Linha de `familias_embalagem` como vem do banco. */
export interface FamiliaDoBanco {
  familia: string | null;
  tamanho_embalagem: number | null;
}

/**
 * Soma as famílias do banco por cima do padrão, como `carregarFamilias` do
 * arquivo antigo: família do banco vira lista de UM tamanho e substitui a
 * entrada de mesmo nome. Não remove nada do padrão.
 */
export function mesclarFamilias(base: Familias, linhas: readonly FamiliaDoBanco[]): Familias {
  const out: Record<string, number | readonly number[]> = { ...base };
  for (const f of linhas) {
    if (f.familia && f.tamanho_embalagem != null && f.tamanho_embalagem > 0) {
      out[String(f.familia).toUpperCase()] = [f.tamanho_embalagem];
    }
  }
  return out;
}

/**
 * Prefixo de quantidade no INÍCIO do SKU. Três formas no catálogo:
 *   NX-  : 3X-LEN-ECO-70X50, 100X-TOU-DESC-TNT-BRA   (unidades)
 *   NUN- : 100UN-40X1,20-AGULHA                       (unidades, só agulhas)
 *   NCX- : 2CX-LUVA-VINIL-M                           (CAIXAS, já é a peça)
 *
 * NÃO são prefixo de quantidade: `13L-PERFU-FLEX` (13 litros), `10CM-GRAU`
 * (10 cm), `1,5L-PERFU-FLEX`. São tamanho do produto. Por isso o padrão lista
 * as unidades explicitamente em vez de aceitar "letras-".
 */
export const RE_PREFIXO = /^(\d+)(X|UN|CX)-/i;

/** SKU como o UpSeller o exibe, normalizado só no caixa e nos espaços. */
export function skuCru(sku: unknown): string {
  return String(sku || '').trim().toUpperCase();
}

export interface Prefixo {
  n: number;
  unidade: string;
}

/** Quantidade e unidade do prefixo (n = 1, unidade 'X' quando não há). */
export function prefixo(sku: unknown): Prefixo {
  const m = RE_PREFIXO.exec(String(sku || '').trim());
  if (!m) return { n: 1, unidade: 'X' };
  return { n: parseInt(m[1] ?? '1', 10), unidade: (m[2] ?? 'X').toUpperCase() };
}

export function multiplicador(sku: unknown): number {
  return prefixo(sku).n;
}

/**
 * Produto, sem a variante de quantidade. `1X-`, `3X-` e `4X-LEN-ECO-70X50`
 * viram todos `LEN-ECO-70X50`; `50UN-13X0,45-AGULHA` vira `13X0,45-AGULHA`;
 * `2CX-LUVA-VINIL-M` vira `LUVA-VINIL-M`. `1X-500-PAP-INTER` vira
 * `500-PAP-INTER`: o `500` é o produto. Só o prefixo é removido.
 */
export function baseEstoque(sku: unknown): string {
  return String(sku || '').trim().replace(RE_PREFIXO, '').toUpperCase();
}

export interface GrupoEstoque {
  grupo: string;
  padrao: RegExp;
}

/**
 * Produtos que a COMPRA trata como um só, embora sejam SKUs diferentes
 * (confirmado em 02/09/2026). Vale SÓ para a tabela de peças: "O que subiu e o
 * que caiu" continua por SKU exato. `GAZE-ESTÉRIL` fica de fora por construção:
 * o padrão exige `\d+FIOS` no fim. Para agrupar um produto novo, uma linha
 * aqui; o primeiro padrão que casar vence.
 */
export const GRUPOS_ESTOQUE: readonly GrupoEstoque[] = [
  { grupo: 'LEN-70X50', padrao: /^LEN-.+-70X50$/ },
  { grupo: 'LEN-50X50', padrao: /^LEN-.+-50X50$/ },
  { grupo: 'GAZE', padrao: /^GAZE-\d+FIOS$/ },
];

/** Produto como o estoque o enxerga: sem prefixo e com os grupos aplicados. */
export function grupoEstoque(sku: unknown): string {
  const b = baseEstoque(sku);
  for (const g of GRUPOS_ESTOQUE) {
    if (g.padrao.test(b)) return g.grupo;
  }
  return b;
}

/**
 * Tamanhos de embalagem fechada da família do SKU, do MAIOR para o menor.
 * Lista porque uma família pode ter mais de uma embalagem: `LUVA-SOFT` vem em
 * caixinha de 20 e em caixa de 100. A busca é pela chave mais LONGA primeiro
 * (`LUVA-SOFT` vence `LUVA`), senão o resultado dependeria da ordem do objeto.
 */
export function embalagensDe(sku: unknown, familias: Familias = FAMILIAS_PADRAO): number[] {
  const alto = skuCru(sku);
  const chaves = Object.keys(familias).sort((a, b) => b.length - a.length);
  for (const chave of chaves) {
    if (alto.indexOf(chave) !== -1) {
      const v = familias[chave];
      const bruto: readonly (number | undefined)[] = Array.isArray(v) && v.length ? v : [v as number];
      const lista = bruto.filter((n): n is number => typeof n === 'number' && n > 0);
      return lista.slice().sort((a, b) => b - a);
    }
  }
  return [1];
}

/**
 * Qual embalagem foi usada, dado o multiplicador do SKU: a maior que couber
 * INTEIRA (`40X-LUVA-SOFT` vira 2 caixinhas de 20, não 0,4 caixa de 100). Se
 * nenhuma couber inteira, a menor: é o caso do `50X-TOU` (meio pacote) e do
 * `6X-ATADURA` (meia dúzia), onde o operador abre a embalagem e conta.
 */
export function escolherEmbalagem(mult: number, packs: readonly number[]): number {
  for (const p of packs) {
    if (p > 0 && mult % p === 0) return p;
  }
  return packs[packs.length - 1] || 1;
}

/** Peças que saem da prateleira para uma quantidade daquele SKU. */
export function pecasDe(sku: unknown, quantidade: unknown, familias: Familias = FAMILIAS_PADRAO): number {
  const q = Number(quantidade) || 0;
  const pre = prefixo(sku);
  // `NCX-` já vem contado em caixas: 2CX = 2 peças, sem divisão nenhuma.
  if (pre.unidade === 'CX') return q * pre.n;
  return (q * pre.n) / escolherEmbalagem(pre.n, embalagensDe(sku, familias));
}
