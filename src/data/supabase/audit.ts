/**
 * Linha de `public.auditoria` (escrita pelo gatilho da migration 0002) → `AuditEntry`.
 *
 * Função pura. As frases são as mesmas da fonte demo (src/data/demo/index.ts), para a tela do
 * Histórico ler igual com dado de demonstração e dado real. `antes` e `depois` são a linha
 * inteira da tabela alterada (JSON), então a frase sai da comparação das duas.
 *
 * "Desfazer": o banco grava `acao = 'desfazer'` sem dizer o quê. A ação de base é deduzida pela
 * MESMA regra do gatilho (o `case tg_table_name` de 0002): tabela, operação e o que mudou.
 */
import { ROLE_LABEL, type Role } from '@/auth/types';
import { formatDayShort } from '@/lib/format';
import type { AuditAction, AuditEntry } from '../types';
import type { Row } from './port';

export const AUDIT_COLUMNS =
  'id,em,ator_id,ator_nome,ator_tipo,acao,tabela,operacao,alvo_tipo,alvo_id,antes,depois';

type Json = Row | null;
type Target = NonNullable<AuditEntry['target']>;

const KNOWN: ReadonlySet<string> = new Set<AuditAction>([
  'meta-global.definir',
  'meta-global.remover',
  'meta-individual.definir',
  'meta-programada.definir',
  'operador.criar',
  'operador.editar',
  'operador.cadastro',
  'operador.excluir',
  'usuario.convidar',
  'usuario.perfil',
  'usuario.status',
  'previsao.equipe',
  'previsao.configurar',
  'previsao.embalagem',
  'dispositivo.parear',
  'dispositivo.revogar',
  'dispositivo.editar',
  'dispositivo.aprovar',
]);

const TARGET_TYPES: ReadonlySet<string> = new Set(['operador', 'usuario', 'config', 'dispositivo']);

/** jsonb chega como objeto; texto JSON também é aceito. Qualquer outra coisa vira null. */
function asJson(v: unknown): Json {
  if (v == null) return null;
  if (typeof v === 'string') {
    try {
      return asJson(JSON.parse(v));
    } catch {
      return null;
    }
  }
  return typeof v === 'object' && !Array.isArray(v) ? (v as Row) : null;
}

const text = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
};

const plain = (v: unknown): string => {
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? String(n) : 'sem meta';
};

const hours = (v: unknown): string => {
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? `${n}/h` : 'sem meta';
};

const roleText = (v: unknown): string => {
  const s = text(v);
  return s ? (ROLE_LABEL[s as Role] ?? s) : 'sem perfil';
};

/** Chaves ordenadas: a comparação não depende da ordem em que o jsonb devolveu as colunas. */
function stable(row: Json, omit: string): string {
  if (!row) return '';
  return JSON.stringify(
    Object.keys(row)
      .filter((k) => k !== omit)
      .sort()
      .map((k) => [k, row[k]]),
  );
}

/**
 * Espelho do `case tg_table_name` do gatilho (0002_auditoria.sql). Se o gatilho mudar, isto muda junto.
 * Tabela que o gatilho não conhece vira 'outro'.
 */
export function baseActionOf(tabela: string, operacao: string, antes: Json, depois: Json): AuditAction {
  switch (tabela) {
    case 'configuracoes_gerais':
      return depois?.meta_horaria_global == null ? 'meta-global.remover' : 'meta-global.definir';
    case 'operadores_metas':
      if (operacao === 'INSERT') return 'operador.criar';
      if (operacao === 'DELETE') return 'operador.excluir';
      if (text(antes?.status) !== text(depois?.status)) return 'operador.cadastro';
      if (stable(antes, 'meta_horaria') === stable(depois, 'meta_horaria')) return 'meta-individual.definir';
      return 'operador.editar';
    case 'config_previsao':
      return text(antes?.equipe_padrao) !== text(depois?.equipe_padrao) ? 'previsao.equipe' : 'previsao.configurar';
    case 'familias_embalagem':
      return 'previsao.embalagem';
    case 'membros':
      if (operacao === 'INSERT') return 'usuario.convidar';
      return text(antes?.status) !== text(depois?.status) ? 'usuario.status' : 'usuario.perfil';
    case 'membros_modulos':
      return 'usuario.perfil';
    case 'metas_programadas':
      return 'meta-programada.definir';
    case 'dispositivos':
      if (operacao === 'INSERT') return 'dispositivo.parear';
      return text(depois?.status) === 'revogado' ? 'dispositivo.revogar' : 'dispositivo.editar';
    case 'pareamentos':
      return 'dispositivo.aprovar';
    default:
      return 'outro';
  }
}

function dayOf(antes: Json, depois: Json, fallback: string): string {
  return (text(depois?.dia) ?? text(antes?.dia) ?? fallback).slice(0, 10);
}

/** Frase de uma ação de base (nunca 'desfazer'). */
function phrase(action: AuditAction, tabela: string, operacao: string, antes: Json, depois: Json, alvoId: string): string {
  const row = depois ?? antes;
  const nome = text(row?.nome_colaborador) ?? text(row?.nome) ?? alvoId;
  switch (action) {
    case 'meta-global.definir':
      return antes?.meta_horaria_global == null
        ? `definiu a meta global em ${hours(depois?.meta_horaria_global)}`
        : `alterou a meta global de ${plain(antes.meta_horaria_global)} para ${hours(depois?.meta_horaria_global)}`;
    case 'meta-global.remover':
      return `removeu a meta global (era ${hours(antes?.meta_horaria_global)})`;
    case 'meta-individual.definir':
      return `alterou a meta de ${nome} de ${plain(antes?.meta_horaria)} para ${hours(depois?.meta_horaria)}`;
    case 'operador.criar':
      return `cadastrou o operador ${nome} (meta ${hours(depois?.meta_horaria)})`;
    case 'operador.editar':
      return `editou o operador ${nome} (meta ${hours(depois?.meta_horaria)})`;
    case 'operador.cadastro':
      return text(depois?.status) === 'inativo' ? `desativou o cadastro de ${nome}` : `reativou o cadastro de ${nome}`;
    case 'operador.excluir':
      return `excluiu o operador ${nome}`;
    case 'meta-programada.definir': {
      const dia = formatDayShort(dayOf(antes, depois, alvoId));
      if (operacao === 'DELETE') return `removeu a meta programada de ${dia}`;
      if (depois?.valor == null) return `programou ${dia} sem meta global`;
      return `programou a meta global de ${dia} em ${hours(depois.valor)}`;
    }
    case 'previsao.equipe':
      return `alterou a equipe da previsão de ${text(antes?.equipe_padrao) ?? '?'} para ${text(depois?.equipe_padrao) ?? '?'} pessoas`;
    case 'previsao.configurar':
      return 'alterou a configuração da previsão';
    case 'previsao.embalagem':
      return `alterou a embalagem de ${text(row?.familia) ?? alvoId}`;
    case 'usuario.convidar':
      return `convidou ${nome} como ${roleText(depois?.papel)}`;
    case 'usuario.perfil':
      // membros_modulos não tem nome nem papel: só dá para dizer que o acesso a módulos mudou
      return tabela === 'membros_modulos'
        ? 'mudou os módulos de acesso de um usuário'
        : `mudou o perfil de ${nome} de ${roleText(antes?.papel)} para ${roleText(depois?.papel)}`;
    case 'usuario.status':
      // O gatilho também chama de usuario.status o DELETE em membros (a conta apagada no Auth leva a
      // linha em cascata): sem este caso, `depois` nulo virava "reativou".
      if (operacao === 'DELETE') return `excluiu a conta de ${nome}`;
      return text(depois?.status) === 'desativado' ? `desativou o acesso de ${nome}` : `reativou o acesso de ${nome}`;
    case 'dispositivo.parear':
      return `pareou ${nome}`;
    case 'dispositivo.revogar':
      return `revogou ${nome}`;
    case 'dispositivo.editar':
      return `alterou ${nome}`;
    case 'dispositivo.aprovar':
      return `aprovou o pareamento de ${nome}`;
    default:
      return `fez uma alteração em ${tabela}`;
  }
}

function targetOf(tabela: string, tipo: string, alvoId: string, antes: Json, depois: Json): Target {
  const row = depois ?? antes;
  const type = (TARGET_TYPES.has(tipo) ? tipo : 'config') as Target['type'];
  let label: string;
  switch (tabela) {
    case 'operadores_metas':
      label = text(row?.nome_colaborador) ?? alvoId;
      break;
    case 'configuracoes_gerais':
      label = 'Meta global';
      break;
    case 'metas_programadas':
      label = `Meta de ${formatDayShort(dayOf(antes, depois, alvoId))}`;
      break;
    case 'config_previsao':
      label = 'Previsão';
      break;
    case 'membros':
    case 'dispositivos':
    case 'pareamentos':
      label = text(row?.nome) ?? alvoId;
      break;
    case 'familias_embalagem':
      label = text(row?.familia) ?? alvoId;
      break;
    case 'membros_modulos':
      // a linha só tem o id da conta: mostrar o uuid cru não diz nada a quem lê
      label = 'Módulos de acesso';
      break;
    default:
      label = alvoId;
  }
  return { type, id: alvoId, label };
}

export function toAuditEntry(row: Row): AuditEntry | null {
  const id = text(row.id);
  const at = text(row.em);
  if (!id || !at) return null;
  const tabela = text(row.tabela) ?? '?';
  const operacao = text(row.operacao) ?? '';
  const alvoId = text(row.alvo_id) ?? '?';
  const antes = asJson(row.antes);
  const depois = asJson(row.depois);
  const acao = text(row.acao) ?? '';

  let action: AuditAction;
  let summary: string;
  if (acao === 'desfazer') {
    action = 'desfazer';
    const base = baseActionOf(tabela, operacao, antes, depois);
    summary = `desfez a alteração: ${phrase(base, tabela, operacao, antes, depois, alvoId)}`;
  } else if (KNOWN.has(acao)) {
    action = acao as AuditAction;
    summary = phrase(action, tabela, operacao, antes, depois, alvoId);
  } else {
    action = 'outro';
    summary = phrase('outro', tabela, operacao, antes, depois, alvoId);
  }

  return {
    id,
    at,
    actor: { id: text(row.ator_id) ?? 'sistema', name: text(row.ator_nome) ?? 'Sistema' },
    action,
    summary,
    target: targetOf(tabela, text(row.alvo_tipo) ?? '', alvoId, antes, depois),
    before: row.antes ?? undefined,
    after: row.depois ?? undefined,
  };
}
