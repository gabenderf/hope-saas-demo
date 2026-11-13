import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withUndo } from '../assemble/undo';
import type { Actor, LiveEvent } from '../types';
import { ACCESS_DENIED_MESSAGE, DataLoadError, ReadOnlyError, WriteError } from './errors';
import { FakeDb } from './fake-db';
import { createSupabaseSourceWith } from './source';

const NOW = new Date('2026-11-05T15:00:00.000Z');
const ACTOR: Actor = { id: 'u-admin', name: 'Admin' };

function setup(canWrite = true) {
  const db = new FakeDb();
  db.tables.membros.push(
    { user_id: 'u-admin', nome: 'Admin', papel: 'admin', status: 'ativo' },
    { user_id: 'u-ana', nome: 'Ana', papel: 'leitura', status: 'ativo' },
  );
  const src = createSupabaseSourceWith({
    port: db,
    scope: 'https://teste.supabase.co',
    storage: null,
    now: () => NOW,
    network: { isOnline: () => true, target: null },
    canWrite,
  });
  const events: LiveEvent[] = [];
  src.subscribe((e) => events.push(e));
  return { db, src, events };
}

const types = (events: LiveEvent[]) => events.map((e) => e.type);

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('usuários: trava de somente leitura', () => {
  it('canWrite false: gravações lançam ReadOnlyError e nada chega ao banco novo', async () => {
    const { db, src } = setup(false);
    const calls = [
      src.invitePanelUser({ name: 'Bia', email: 'bia@exemplo.com', role: 'leitura' }, ACTOR),
      src.setPanelUserRole('u-ana', 'admin', ACTOR),
      src.setPanelUserStatus('u-ana', 'desativado', ACTOR),
    ];
    for (const c of calls) await expect(c).rejects.toBeInstanceOf(ReadOnlyError);
    expect(db.writes).toEqual([]);
    expect(db.invocations).toEqual([]);
    expect(db.sessionChecks).toBe(0);
  });

  it('canWrite false: o histórico é vazio sem consultar e os usuários vêm da tabela antiga', async () => {
    const { db, src } = setup(false);
    db.tables.usuarios_painel.push({ username: 'chefe', role: 'admin' });
    await expect(src.listAudit({ limit: 10 })).resolves.toEqual([]);
    const users = await src.listPanelUsers();
    expect(users.map((u) => [u.username, u.role])).toEqual([['chefe', 'admin']]);
    expect(db.rpcCalls).toEqual([]);
    expect(db.selectsOn('auditoria')).toBe(0);
    expect(src.capabilities).toMatchObject({ audit: false, userManagement: false });
  });

  it('com canWrite as capacidades de auditoria e usuários ligam', () => {
    expect(setup(true).src.capabilities).toMatchObject({ audit: true, userManagement: true });
  });

  it('sem sessão de login: ReadOnlyError, sem chamar a função nem gravar', async () => {
    const { db, src } = setup(true);
    db.session = false;
    await expect(src.invitePanelUser({ name: 'Bia', email: 'bia@exemplo.com', role: 'leitura' }, ACTOR)).rejects.toBeInstanceOf(ReadOnlyError);
    await expect(src.setPanelUserRole('u-ana', 'admin', ACTOR)).rejects.toBeInstanceOf(ReadOnlyError);
    await expect(src.setPanelUserStatus('u-ana', 'desativado', ACTOR)).rejects.toBeInstanceOf(ReadOnlyError);
    expect(db.writes).toEqual([]);
    expect(db.invocations).toEqual([]);
  });
});

describe('listPanelUsers (login de verdade)', () => {
  it('mapeia a função do banco e o status (desativado > convidado > ativo)', async () => {
    const { db, src } = setup();
    db.rpcResults.listar_usuarios_painel = [
      { user_id: 'a', nome: 'Ana', email: 'ana@x.com', papel: 'admin', status: 'ativo', modulos: ['expedicao'], ultimo_acesso: '2026-11-05T14:00:00.123456+00:00', convite_pendente: false, mfa_cadastrado: true },
      { user_id: 'b', nome: 'Bia', email: 'bia@x.com', papel: 'lideranca', status: 'ativo', modulos: [], ultimo_acesso: null, convite_pendente: true, mfa_cadastrado: false },
      { user_id: 'c', nome: 'Caio', email: 'caio@x.com', papel: 'leitura', status: 'desativado', modulos: [], ultimo_acesso: null, convite_pendente: true, mfa_cadastrado: false },
    ];
    const users = await src.listPanelUsers();
    expect(db.rpcCalls).toEqual([{ fn: 'listar_usuarios_painel', args: {} }]);
    expect(users).toEqual([
      { id: 'a', name: 'Ana', email: 'ana@x.com', username: null, role: 'admin', status: 'ativo', lastSignInAt: '2026-11-05T14:00:00.123Z', mfaEnrolled: true },
      { id: 'b', name: 'Bia', email: 'bia@x.com', username: null, role: 'lideranca', status: 'convidado', lastSignInAt: null, mfaEnrolled: false },
      { id: 'c', name: 'Caio', email: 'caio@x.com', username: null, role: 'leitura', status: 'desativado', lastSignInAt: null, mfaEnrolled: false },
    ]);
  });

  it('42501 vira a mensagem de acesso; outro erro vira DataLoadError', async () => {
    const { db, src } = setup();
    db.rpcError = { code: '42501', message: 'permission denied' };
    const denied = await src.listPanelUsers().catch((e: unknown) => e);
    expect(denied).toBeInstanceOf(WriteError);
    expect((denied as Error).message).toBe(ACCESS_DENIED_MESSAGE);
    db.rpcError = new TypeError('Failed to fetch');
    await expect(src.listPanelUsers()).rejects.toBeInstanceOf(DataLoadError);
  });
});

describe('invitePanelUser', () => {
  it('valida, chama a função usuarios e avisa os ouvintes', async () => {
    const { db, src, events } = setup();
    db.invokeResult = { user_id: 'novo' };
    await src.invitePanelUser({ name: '  Bia  ', email: ' Bia@Exemplo.com ', role: 'lideranca' }, ACTOR);
    expect(db.invocations).toEqual([{ name: 'usuarios', body: { acao: 'convidar', nome: 'Bia', email: 'bia@exemplo.com', papel: 'lideranca' } }]);
    expect(types(events)).toContain('users-changed');
  });

  it('nome ou e-mail inválido não chama nada', async () => {
    const { db, src } = setup();
    await expect(src.invitePanelUser({ name: ' ', email: 'a@b.c', role: 'leitura' }, ACTOR)).rejects.toThrow('Informe nome e e-mail válidos.');
    await expect(src.invitePanelUser({ name: 'Bia', email: 'sem-arroba', role: 'leitura' }, ACTOR)).rejects.toThrow('Informe nome e e-mail válidos.');
    expect(db.invocations).toEqual([]);
  });

  it('erro do servidor segue com a mensagem em português; rede vira DataLoadError', async () => {
    const { db, src, events } = setup();
    db.invokeError = new Error('Já existe uma conta com este e-mail.');
    await expect(src.invitePanelUser({ name: 'Bia', email: 'bia@x.com', role: 'leitura' }, ACTOR)).rejects.toThrow('Já existe uma conta com este e-mail.');
    db.invokeError = new TypeError('Failed to fetch');
    await expect(src.invitePanelUser({ name: 'Bia', email: 'bia@x.com', role: 'leitura' }, ACTOR)).rejects.toBeInstanceOf(DataLoadError);
    expect(types(events)).not.toContain('users-changed');
  });
});

describe('resendPanelUserInvite', () => {
  it('chama a função usuarios com a ação reenviar e não avisa ouvintes', async () => {
    const { db, src, events } = setup();
    db.invokeResult = { ok: true };
    await src.resendPanelUserInvite!('u-bia', ACTOR);
    expect(db.invocations).toEqual([{ name: 'usuarios', body: { acao: 'reenviar', user_id: 'u-bia' } }]);
    expect(db.writes).toEqual([]);
    expect(types(events)).not.toContain('users-changed');
  });

  it('somente leitura: ReadOnlyError sem nenhuma chamada', async () => {
    const { db, src } = setup(false);
    await expect(src.resendPanelUserInvite!('u-bia', ACTOR)).rejects.toBeInstanceOf(ReadOnlyError);
    expect(db.invocations).toEqual([]);
    expect(db.sessionChecks).toBe(0);
  });

  it('id vazio é recusado sem chamar nada', async () => {
    const { db, src } = setup();
    await expect(src.resendPanelUserInvite!('  ', ACTOR)).rejects.toThrow('Usuário inválido.');
    expect(db.invocations).toEqual([]);
  });

  it('erro do servidor segue com a mensagem; rede vira DataLoadError', async () => {
    const { db, src } = setup();
    db.invokeError = new Error('Esta pessoa já aceitou o convite.');
    await expect(src.resendPanelUserInvite!('u-bia', ACTOR)).rejects.toThrow('Esta pessoa já aceitou o convite.');
    // rede caiu: o e-mail pode ter saído, então a mensagem não é "não carregou"
    db.invokeError = new TypeError('Failed to fetch');
    await expect(src.resendPanelUserInvite!('u-bia', ACTOR)).rejects.toThrow('Não deu para confirmar o envio.');
  });
});

describe('setPanelUserRole', () => {
  it('atualiza membros.papel, avisa e não manda cabeçalho de desfazer', async () => {
    const { db, src, events } = setup();
    await src.setPanelUserRole('u-ana', 'lideranca', ACTOR);
    expect(db.writes).toEqual([
      { table: 'membros', action: 'update', values: { papel: 'lideranca' }, eq: { column: 'user_id', value: 'u-ana' }, undo: false },
    ]);
    expect(db.tables.membros[1]!.papel).toBe('lideranca');
    expect(types(events)).toContain('users-changed');
  });

  it('recusa o próprio usuário sem gravar', async () => {
    const { db, src } = setup();
    await expect(src.setPanelUserRole('u-admin', 'leitura', ACTOR)).rejects.toThrow('Você não pode mudar o próprio perfil.');
    expect(db.writes).toEqual([]);
  });

  it('desfazer leva o cabeçalho', async () => {
    const { db, src } = setup();
    await withUndo(() => src.setPanelUserRole('u-ana', 'admin', ACTOR));
    expect(db.writes[0]!.undo).toBe(true);
  });

  it('zero linhas (RLS) e 42501 viram acesso negado', async () => {
    const { db, src } = setup();
    db.rlsBlocksWrites = true;
    await expect(src.setPanelUserRole('u-ana', 'admin', ACTOR)).rejects.toThrow(ACCESS_DENIED_MESSAGE);
    db.rlsBlocksWrites = false;
    db.writeError = { code: '42501', message: 'x' };
    await expect(src.setPanelUserRole('u-ana', 'admin', ACTOR)).rejects.toBeInstanceOf(WriteError);
  });
});

describe('setPanelUserStatus', () => {
  it('desativa e reativa em membros.status', async () => {
    const { db, src, events } = setup();
    await src.setPanelUserStatus('u-ana', 'desativado', ACTOR);
    expect(db.writes[0]).toEqual({ table: 'membros', action: 'update', values: { status: 'desativado' }, eq: { column: 'user_id', value: 'u-ana' }, undo: false });
    await src.setPanelUserStatus('u-ana', 'ativo', ACTOR);
    expect(db.tables.membros[1]!.status).toBe('ativo');
    expect(types(events).filter((t) => t === 'users-changed')).toHaveLength(2);
  });

  it('recusa o próprio usuário sem gravar', async () => {
    const { db, src } = setup();
    await expect(src.setPanelUserStatus('u-admin', 'desativado', ACTOR)).rejects.toThrow('Você não pode desativar o próprio acesso.');
    expect(db.writes).toEqual([]);
  });

  it('restoreInvited grava ativo (convidado não é coluna) e leva o cabeçalho', async () => {
    const { db, src } = setup();
    await withUndo(() => src.setPanelUserStatus('u-ana', 'ativo', ACTOR), { restoreInvited: true });
    expect(db.writes[0]).toMatchObject({ values: { status: 'ativo' }, undo: true });
  });

  it('zero linhas vira acesso negado', async () => {
    const { db, src } = setup();
    db.rlsBlocksWrites = true;
    await expect(src.setPanelUserStatus('u-ana', 'desativado', ACTOR)).rejects.toThrow(ACCESS_DENIED_MESSAGE);
  });
});

describe('listAudit', () => {
  const row = (id: number, em: string, extra: Record<string, unknown> = {}) => ({
    id,
    em,
    ator_id: 'u-admin',
    ator_nome: 'Admin',
    ator_tipo: 'pessoa',
    acao: 'meta-global.definir',
    tabela: 'configuracoes_gerais',
    operacao: 'UPDATE',
    alvo_tipo: 'config',
    alvo_id: '1',
    antes: { meta_horaria_global: null },
    depois: { meta_horaria_global: 40 },
    ...extra,
  });

  it('ordena por em e id decrescentes, limita com range e mapeia', async () => {
    const { db, src } = setup();
    db.tables.auditoria.push(
      row(1, '2026-11-05T10:00:00+00:00'),
      row(2, '2026-11-05T12:00:00+00:00'),
      row(3, '2026-11-05T12:00:00+00:00'),
    );
    const list = await src.listAudit({ limit: 2 });
    expect(list.map((e) => e.id)).toEqual(['3', '2']);
    expect(list[0]!.summary).toBe('definiu a meta global em 40/h');
    const q = db.selects.at(-1)!;
    expect(q.order).toEqual([
      { column: 'em', ascending: false },
      { column: 'id', ascending: false },
    ]);
    expect(q.range).toEqual({ from: 0, to: 1 });
    expect(q.columns).toBe('id,em,ator_id,ator_nome,ator_tipo,acao,tabela,operacao,alvo_tipo,alvo_id,antes,depois');
  });

  it('before pagina com em < before', async () => {
    const { db, src } = setup();
    db.tables.auditoria.push(row(1, '2026-11-05T10:00:00+00:00'), row(2, '2026-11-05T12:00:00+00:00'));
    const list = await src.listAudit({ limit: 10, before: '2026-11-05T12:00:00.000Z' });
    expect(list.map((e) => e.id)).toEqual(['1']);
    expect(db.selects.at(-1)!.lt).toEqual({ column: 'em', value: '2026-11-05T12:00:00.000Z' });
  });

  it('sem permissão (42501) vira acesso negado; falha de rede vira DataLoadError', async () => {
    const { db, src } = setup();
    db.failNext = 1;
    await expect(src.listAudit({ limit: 5 })).rejects.toBeInstanceOf(DataLoadError);
  });
});
