import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCESS_DENIED_MESSAGE, ReadOnlyError } from '@/data/supabase/errors';
import { FakeDb } from '@/data/supabase/fake-db';
import { createSupabaseForecastSource } from './supabase-source';

function setup(canWrite = true) {
  const db = new FakeDb();
  db.tables.config_previsao.push({ id: 1, equipe_padrao: 3 });
  return { db, src: createSupabaseForecastSource({ canWrite, port: db }) };
}

describe('Previsão: setTeamSize', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('canWrite segue o que foi passado; padrão é false', () => {
    expect(setup(true).src.canWrite).toBe(true);
    expect(setup(false).src.canWrite).toBe(false);
    expect(createSupabaseForecastSource({ port: new FakeDb() }).canWrite).toBe(false);
  });

  it('canWrite false: nada vai ao banco (nem leitura, nem sessão)', async () => {
    const { db, src } = setup(false);
    await expect(src.setTeamSize(5)).rejects.toBeInstanceOf(ReadOnlyError);
    expect(db.writes).toEqual([]);
    expect(db.selects).toEqual([]);
    expect(db.sessionChecks).toBe(0);
  });

  it('sem sessão de login: ReadOnlyError e nenhuma gravação', async () => {
    const { db, src } = setup();
    db.session = false;
    await expect(src.setTeamSize(5)).rejects.toBeInstanceOf(ReadOnlyError);
    expect(db.writes).toEqual([]);
  });

  it('grava equipe_padrao e o undo regrava o anterior com o cabeçalho de desfazer', async () => {
    const { db, src } = setup();
    const { undo } = await src.setTeamSize(5);
    expect(db.writes).toEqual([
      { table: 'config_previsao', action: 'update', values: { equipe_padrao: 5 }, eq: { column: 'id', value: 1 }, undo: false },
    ]);
    expect(db.tables.config_previsao[0]!.equipe_padrao).toBe(5);
    await undo();
    expect(db.writes[1]).toEqual({
      table: 'config_previsao',
      action: 'update',
      values: { equipe_padrao: 3 },
      eq: { column: 'id', value: 1 },
      undo: true,
    });
    expect(db.tables.config_previsao[0]!.equipe_padrao).toBe(3);
  });

  it('valida de 1 a 20, inteiro', async () => {
    const { db, src } = setup();
    for (const bad of [0, 21, 2.5, Number.NaN]) await expect(src.setTeamSize(bad)).rejects.toThrow('Equipe inválida');
    expect(db.writes).toEqual([]);
  });

  it('RLS barrando (0 linhas) vira a mensagem de acesso', async () => {
    const { db, src } = setup();
    db.rlsBlocksWrites = true;
    await expect(src.setTeamSize(5)).rejects.toThrow(ACCESS_DENIED_MESSAGE);
  });

  it('sem linha de configuração, recusa antes de gravar', async () => {
    const { db, src } = setup();
    db.tables.config_previsao.length = 0;
    await expect(src.setTeamSize(5)).rejects.toThrow('Configuração da Previsão não encontrada.');
    expect(db.writes).toEqual([]);
  });
});
