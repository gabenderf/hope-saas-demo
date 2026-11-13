import { describe, expect, it } from 'vitest';
import type { Row } from './port';
import { baseActionOf, toAuditEntry } from './audit';

function entry(over: Row) {
  return toAuditEntry({
    id: 7,
    em: '2026-11-05T15:00:00+00:00',
    ator_id: 'u1',
    ator_nome: 'Ana',
    ator_tipo: 'pessoa',
    acao: 'x',
    tabela: 'x',
    operacao: 'UPDATE',
    alvo_tipo: 'config',
    alvo_id: '1',
    antes: null,
    depois: null,
    ...over,
  })!;
}

const summary = (over: Row) => entry(over).summary;

describe('toAuditEntry: formato', () => {
  it('id vira texto, ator sem id vira sistema, antes e depois seguem como vieram', () => {
    const e = entry({ acao: 'meta-global.remover', tabela: 'configuracoes_gerais', ator_id: null, ator_nome: 'Sistema (postgres)', antes: { meta_horaria_global: 40 }, depois: { meta_horaria_global: null } });
    expect(e.id).toBe('7');
    expect(e.at).toBe('2026-11-05T15:00:00+00:00');
    expect(e.actor).toEqual({ id: 'sistema', name: 'Sistema (postgres)' });
    expect(e.before).toEqual({ meta_horaria_global: 40 });
    expect(e.after).toEqual({ meta_horaria_global: null });
  });

  it('linha sem id ou sem data é descartada', () => {
    expect(toAuditEntry({ id: null, em: 'x' })).toBeNull();
    expect(toAuditEntry({ id: 1, em: null })).toBeNull();
  });
});

describe('toAuditEntry: frases', () => {
  const cfg = { acao: 'meta-global.definir', tabela: 'configuracoes_gerais', alvo_tipo: 'config', alvo_id: '1' };
  it('meta global', () => {
    expect(summary({ ...cfg, antes: { meta_horaria_global: null }, depois: { meta_horaria_global: 40 } })).toBe('definiu a meta global em 40/h');
    expect(summary({ ...cfg, antes: { meta_horaria_global: 38 }, depois: { meta_horaria_global: 40 } })).toBe('alterou a meta global de 38 para 40/h');
    expect(summary({ ...cfg, acao: 'meta-global.remover', antes: { meta_horaria_global: 40 }, depois: { meta_horaria_global: null } })).toBe('removeu a meta global (era 40/h)');
    expect(entry({ ...cfg, antes: { meta_horaria_global: null }, depois: { meta_horaria_global: 40 } }).target).toEqual({ type: 'config', id: '1', label: 'Meta global' });
  });

  const op = { tabela: 'operadores_metas', alvo_tipo: 'operador', alvo_id: 'op-a' };
  it('operadores', () => {
    const base = { nome_colaborador: 'Larissa', status: 'ativo' };
    expect(summary({ ...op, acao: 'meta-individual.definir', antes: { ...base, meta_horaria: 35 }, depois: { ...base, meta_horaria: 40 } })).toBe('alterou a meta de Larissa de 35 para 40/h');
    expect(summary({ ...op, acao: 'operador.criar', operacao: 'INSERT', depois: { ...base, meta_horaria: 35 } })).toBe('cadastrou o operador Larissa (meta 35/h)');
    expect(summary({ ...op, acao: 'operador.editar', antes: { ...base, meta_horaria: 35 }, depois: { ...base, meta_horaria: 36 } })).toBe('editou o operador Larissa (meta 36/h)');
    expect(summary({ ...op, acao: 'operador.cadastro', antes: base, depois: { ...base, status: 'inativo' } })).toBe('desativou o cadastro de Larissa');
    expect(summary({ ...op, acao: 'operador.cadastro', antes: { ...base, status: 'inativo' }, depois: base })).toBe('reativou o cadastro de Larissa');
    expect(summary({ ...op, acao: 'operador.excluir', operacao: 'DELETE', antes: base })).toBe('excluiu o operador Larissa');
    expect(entry({ ...op, acao: 'operador.criar', operacao: 'INSERT', depois: { ...base, meta_horaria: 35 } }).target).toEqual({ type: 'operador', id: 'op-a', label: 'Larissa' });
  });

  const prog = { acao: 'meta-programada.definir', tabela: 'metas_programadas', alvo_tipo: 'config', alvo_id: '2026-11-10' };
  it('meta programada: definir, sem meta e remover', () => {
    expect(summary({ ...prog, operacao: 'INSERT', depois: { dia: '2026-11-10', valor: 42 } })).toBe('programou a meta global de 10/11 em 42/h');
    expect(summary({ ...prog, operacao: 'UPDATE', antes: { dia: '2026-11-10', valor: 42 }, depois: { dia: '2026-11-10', valor: null } })).toBe('programou 10/11 sem meta global');
    expect(summary({ ...prog, operacao: 'DELETE', antes: { dia: '2026-11-10', valor: 42 } })).toBe('removeu a meta programada de 10/11');
    expect(entry({ ...prog, operacao: 'DELETE', antes: { dia: '2026-11-10', valor: 42 } }).target?.label).toBe('Meta de 10/11');
  });

  it('previsão', () => {
    const p = { tabela: 'config_previsao', alvo_tipo: 'config', alvo_id: '1' };
    expect(summary({ ...p, acao: 'previsao.equipe', antes: { equipe_padrao: 3 }, depois: { equipe_padrao: 5 } })).toBe('alterou a equipe da previsão de 3 para 5 pessoas');
    expect(summary({ ...p, acao: 'previsao.configurar', antes: { equipe_padrao: 3 }, depois: { equipe_padrao: 3 } })).toBe('alterou a configuração da previsão');
    expect(entry({ ...p, acao: 'previsao.equipe', antes: { equipe_padrao: 3 }, depois: { equipe_padrao: 5 } }).target?.label).toBe('Previsão');
    expect(summary({ acao: 'previsao.embalagem', tabela: 'familias_embalagem', alvo_id: 'TOU', depois: { familia: 'TOU', tamanho: 100 } })).toBe('alterou a embalagem de TOU');
  });

  const usr = { tabela: 'membros', alvo_tipo: 'usuario', alvo_id: 'u-ana' };
  it('usuários', () => {
    expect(summary({ ...usr, acao: 'usuario.convidar', operacao: 'INSERT', depois: { nome: 'Ana', papel: 'lideranca', status: 'ativo' } })).toBe('convidou Ana como Liderança');
    expect(summary({ ...usr, acao: 'usuario.perfil', antes: { nome: 'Ana', papel: 'leitura' }, depois: { nome: 'Ana', papel: 'admin' } })).toBe('mudou o perfil de Ana de Leitura para Administrador');
    expect(summary({ ...usr, acao: 'usuario.status', antes: { nome: 'Ana', status: 'ativo' }, depois: { nome: 'Ana', status: 'desativado' } })).toBe('desativou o acesso de Ana');
    expect(summary({ ...usr, acao: 'usuario.status', antes: { nome: 'Ana', status: 'desativado' }, depois: { nome: 'Ana', status: 'ativo' } })).toBe('reativou o acesso de Ana');
    // o gatilho chama o DELETE em membros de usuario.status; `depois` nulo não pode virar "reativou"
    expect(summary({ ...usr, acao: 'usuario.status', operacao: 'DELETE', antes: { nome: 'Ana', status: 'ativo' }, depois: null })).toBe('excluiu a conta de Ana');
    expect(baseActionOf('membros', 'DELETE', { status: 'ativo' }, null)).toBe('usuario.status');
    expect(entry({ ...usr, acao: 'usuario.status', antes: { nome: 'Ana', status: 'ativo' }, depois: { nome: 'Ana', status: 'desativado' } }).target).toEqual({ type: 'usuario', id: 'u-ana', label: 'Ana' });
  });

  it('módulos de acesso: a linha só tem o id da conta, então o alvo não mostra o uuid', () => {
    const mm = entry({ acao: 'usuario.perfil', tabela: 'membros_modulos', alvo_tipo: 'usuario', alvo_id: '53a186ce-a0fe-4f39-8f88-046838d1ee92', operacao: 'INSERT', depois: { usuario_id: '53a186ce-a0fe-4f39-8f88-046838d1ee92', modulo: 'expedicao' } });
    expect(mm.summary).toBe('mudou os módulos de acesso de um usuário');
    expect(mm.target).toEqual({ type: 'usuario', id: '53a186ce-a0fe-4f39-8f88-046838d1ee92', label: 'Módulos de acesso' });
  });

  const dev = { tabela: 'dispositivos', alvo_tipo: 'dispositivo', alvo_id: 'd1' };
  it('dispositivos', () => {
    expect(summary({ ...dev, acao: 'dispositivo.parear', operacao: 'INSERT', depois: { nome: 'TV do galpão' } })).toBe('pareou TV do galpão');
    expect(summary({ ...dev, acao: 'dispositivo.revogar', antes: { nome: 'TV', status: 'ativo' }, depois: { nome: 'TV', status: 'revogado' } })).toBe('revogou TV');
    expect(summary({ ...dev, acao: 'dispositivo.editar', antes: { nome: 'TV' }, depois: { nome: 'TV 2' } })).toBe('alterou TV 2');
    const ap = entry({ acao: 'dispositivo.aprovar', tabela: 'pareamentos', alvo_tipo: 'dispositivo', alvo_id: 'p1', operacao: 'UPDATE', depois: { tipo: 'tv', nome: 'TV nova' } });
    expect(ap.summary).toBe('aprovou o pareamento de TV nova');
    expect(ap.target?.label).toBe('TV nova');
  });
});

describe('toAuditEntry: desfazer e desconhecido', () => {
  it('desfazer deduz a ação de base e prefixa a frase', () => {
    const base = { acao: 'desfazer', alvo_tipo: 'config' };
    const cases: [Row, string][] = [
      [{ tabela: 'configuracoes_gerais', alvo_id: '1', antes: { meta_horaria_global: 40 }, depois: { meta_horaria_global: null } }, 'desfez a alteração: removeu a meta global (era 40/h)'],
      [{ tabela: 'configuracoes_gerais', alvo_id: '1', antes: { meta_horaria_global: null }, depois: { meta_horaria_global: 40 } }, 'desfez a alteração: definiu a meta global em 40/h'],
      [{ tabela: 'operadores_metas', alvo_tipo: 'operador', alvo_id: 'a', antes: { nome_colaborador: 'L', status: 'ativo', meta_horaria: 35 }, depois: { nome_colaborador: 'L', status: 'ativo', meta_horaria: 40 } }, 'desfez a alteração: alterou a meta de L de 35 para 40/h'],
      [{ tabela: 'operadores_metas', alvo_tipo: 'operador', alvo_id: 'a', antes: { nome_colaborador: 'L', status: 'ativo', meta_horaria: 35 }, depois: { nome_colaborador: 'L2', status: 'ativo', meta_horaria: 35 } }, 'desfez a alteração: editou o operador L2 (meta 35/h)'],
      [{ tabela: 'operadores_metas', alvo_tipo: 'operador', alvo_id: 'a', antes: { nome_colaborador: 'L', status: 'ativo' }, depois: { nome_colaborador: 'L', status: 'inativo' } }, 'desfez a alteração: desativou o cadastro de L'],
      [{ tabela: 'operadores_metas', alvo_tipo: 'operador', alvo_id: 'a', operacao: 'INSERT', depois: { nome_colaborador: 'L', meta_horaria: 35 } }, 'desfez a alteração: cadastrou o operador L (meta 35/h)'],
      [{ tabela: 'operadores_metas', alvo_tipo: 'operador', alvo_id: 'a', operacao: 'DELETE', antes: { nome_colaborador: 'L' } }, 'desfez a alteração: excluiu o operador L'],
      [{ tabela: 'metas_programadas', alvo_id: '2026-11-10', operacao: 'DELETE', antes: { dia: '2026-11-10', valor: 40 } }, 'desfez a alteração: removeu a meta programada de 10/11'],
      [{ tabela: 'config_previsao', alvo_id: '1', antes: { equipe_padrao: 3 }, depois: { equipe_padrao: 4 } }, 'desfez a alteração: alterou a equipe da previsão de 3 para 4 pessoas'],
      [{ tabela: 'membros', alvo_tipo: 'usuario', alvo_id: 'u', antes: { nome: 'Ana', status: 'ativo', papel: 'leitura' }, depois: { nome: 'Ana', status: 'desativado', papel: 'leitura' } }, 'desfez a alteração: desativou o acesso de Ana'],
      [{ tabela: 'membros', alvo_tipo: 'usuario', alvo_id: 'u', antes: { nome: 'Ana', status: 'ativo', papel: 'leitura' }, depois: { nome: 'Ana', status: 'ativo', papel: 'admin' } }, 'desfez a alteração: mudou o perfil de Ana de Leitura para Administrador'],
      [{ tabela: 'dispositivos', alvo_tipo: 'dispositivo', alvo_id: 'd', antes: { nome: 'TV', status: 'ativo' }, depois: { nome: 'TV', status: 'revogado' } }, 'desfez a alteração: revogou TV'],
      [{ tabela: 'tabela_nova', alvo_id: 'z' }, 'desfez a alteração: fez uma alteração em tabela_nova'],
    ];
    for (const [over, expected] of cases) {
      const e = entry({ ...base, ...over });
      expect(e.action).toBe('desfazer');
      expect(e.summary).toBe(expected);
    }
  });

  it('baseActionOf espelha o gatilho: status vence meta, e só a meta mudando é meta individual', () => {
    expect(baseActionOf('operadores_metas', 'UPDATE', { status: 'ativo', meta_horaria: 35 }, { status: 'inativo', meta_horaria: 40 })).toBe('operador.cadastro');
    expect(baseActionOf('operadores_metas', 'UPDATE', { status: 'ativo', meta_horaria: 35, nome: 'a' }, { nome: 'a', meta_horaria: 40, status: 'ativo' })).toBe('meta-individual.definir');
    expect(baseActionOf('membros', 'INSERT', null, { status: 'ativo' })).toBe('usuario.convidar');
    expect(baseActionOf('familias_embalagem', 'UPDATE', {}, {})).toBe('previsao.embalagem');
    expect(baseActionOf('membros_modulos', 'INSERT', null, {})).toBe('usuario.perfil');
    expect(baseActionOf('qualquer', 'UPDATE', {}, {})).toBe('outro');
  });

  it('ação desconhecida vira outro, com a frase genérica e o alvo pelo id', () => {
    const e = entry({ acao: 'tabela_nova.update', tabela: 'tabela_nova', alvo_tipo: 'outro-tipo', alvo_id: 'k9' });
    expect(e.action).toBe('outro');
    expect(e.summary).toBe('fez uma alteração em tabela_nova');
    expect(e.target).toEqual({ type: 'config', id: 'k9', label: 'k9' });
  });

  it('antes e depois em texto JSON também funcionam', () => {
    expect(summary({ acao: 'meta-global.remover', tabela: 'configuracoes_gerais', antes: '{"meta_horaria_global":40}', depois: '{"meta_horaria_global":null}' })).toBe('removeu a meta global (era 40/h)');
  });
});
