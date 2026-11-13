/**
 * Confere, contra o projeto Supabase de TESTE, o que cada perfil de PESSOA vê e consegue alterar.
 *
 * Entra com cada conta de teste (as que estão no .env.teste.local), faz MFA de verdade quando
 * o perfil exige, e compara o resultado de cada consulta com o esperado pelo docs/seguranca.md.
 * Nunca imprime senha, token nem segredo TOTP. Sai com código 1 se algo não bater.
 *
 *   node scripts/conferir-rls.mjs
 *
 * Recusa rodar se a URL do .env.teste.local for a mesma do .env.real.local (a produção).
 * Altera dados só para provar que a regra funciona, e desfaz: a meta global volta a nula,
 * a notificação de teste é apagada. Termina com "sair de todos os dispositivos" da conta
 * de leitura, para provar o corte imediato de sessão.
 *
 * Contas de máquina (TV, bancada, coletor): scripts/conferir-pareamento.mjs.
 */
import { BASE, CHAVE, claims, comMfa, entrar, env, ler, relatorio, rest } from './lib-teste.mjs';

const { conferir, conferirValor, etapa, terminar } = relatorio();

await etapa('anônimo', async () => {
  conferir('anônimo lê pedidos (convivência, até a 0008)', 'algum', await ler(null, 'pedidos_separados', 'id_registro'));
  conferir('anônimo não lê membros', 'nada', await ler(null, 'membros', 'user_id'));
  conferir('anônimo não lê auditoria', 'nada', await ler(null, 'auditoria', 'id'));
  conferir('anônimo não lê dispositivos', 'nada', await ler(null, 'dispositivos', 'id'));
  conferir('anônimo não lê notificações', 'nada', await ler(null, 'notificacoes', 'id'));
});

await etapa('sem perfil', async () => {
  const s = await entrar('SEMPERFIL');
  conferirValor('sem perfil: token sem o claim hope', 'ausente', claims(s.access_token).app_metadata?.hope ? 'presente' : 'ausente');
  conferir('sem perfil não lê pedidos', 'nada', await ler(s.access_token, 'pedidos_separados', 'id_registro'));
  conferir('sem perfil não lê operadores', 'nada', await ler(s.access_token, 'operadores_metas', 'id_operador'));
  conferir('sem perfil não lê membros', 'nada', await ler(s.access_token, 'membros', 'user_id'));
});

await etapa('desativado', async () => {
  const s = await entrar('DESATIVADO');
  conferir('desativado não lê pedidos', 'nada', await ler(s.access_token, 'pedidos_separados', 'id_registro'));
  conferir('desativado não lê operadores', 'nada', await ler(s.access_token, 'operadores_metas', 'id_operador'));
});

await etapa('sem o módulo', async () => {
  const s = await entrar('SEMMODULO');
  conferir('leitura sem o módulo Expedição não lê pedidos', 'nada', await ler(s.access_token, 'pedidos_separados', 'id_registro'));
  conferir('leitura sem o módulo lê a própria linha de membros', 1, await ler(s.access_token, 'membros', 'user_id'));
});

await etapa('leitura', async () => {
  const s = await entrar('LEITURA');
  const c = claims(s.access_token);
  conferirValor('leitura: papel no token', 'leitura', c.app_metadata?.hope?.papel);
  conferirValor('leitura: módulo Expedição no token', 'leitura', c.app_metadata?.hope?.modulos?.expedicao);
  conferir('leitura lê pedidos', 'algum', await ler(s.access_token, 'pedidos_separados', 'id_registro'));
  conferir('leitura lê operadores', 'algum', await ler(s.access_token, 'operadores_metas', 'id_operador'));
  conferir('leitura lê a meta global', 1, await ler(s.access_token, 'configuracoes_gerais', 'id'));
  conferir('leitura lê acessos', 'algum', await ler(s.access_token, 'logs_acesso', 'id_log'));
  conferir('leitura não lê auditoria', 'nada', await ler(s.access_token, 'auditoria', 'id'));
  conferir('leitura lê só a própria linha de membros', 1, await ler(s.access_token, 'membros', 'user_id'));
  conferir('leitura não lê dispositivos', 'nada', await ler(s.access_token, 'dispositivos', 'id'));
  conferir('leitura não altera a meta global', 'nada', await rest(s.access_token, 'PATCH', 'configuracoes_gerais?id=eq.1', { meta_horaria_global: 37 }));
  conferir(
    'leitura não se promove a admin',
    'nada',
    await rest(s.access_token, 'PATCH', `membros?user_id=eq.${env.TESTE_LEITURA_ID}`, { papel: 'admin' }),
  );
  conferir('leitura não lista usuários', 'nada', await rest(s.access_token, 'POST', 'rpc/listar_usuarios_painel', {}));
  conferir(
    'leitura cria notificação para si',
    1,
    await rest(s.access_token, 'POST', 'notificacoes', { regra: 'teste', severidade: 'info', titulo: 'Teste de RLS', dedupe_key: 'teste-rls' }),
  );
  conferir('leitura lê a própria notificação', 'algum', await ler(s.access_token, 'notificacoes', 'id', '&dedupe_key=eq.teste-rls'));
  await rest(s.access_token, 'DELETE', 'notificacoes?dedupe_key=eq.teste-rls');
});

await etapa('liderança', async () => {
  const s1 = await entrar('LIDERANCA');
  conferirValor('liderança sem MFA: aal no token', 'aal1', claims(s1.access_token).aal);
  conferir('liderança sem MFA não lê pedidos (o banco cobra o MFA)', 'nada', await ler(s1.access_token, 'pedidos_separados', 'id_registro'));
  conferir('liderança sem MFA não altera a meta', 'nada', await rest(s1.access_token, 'PATCH', 'configuracoes_gerais?id=eq.1', { meta_horaria_global: 37 }));

  const s2 = await comMfa('LIDERANCA', s1);
  conferirValor('liderança com MFA: aal no token', 'aal2', claims(s2.access_token).aal);
  conferirValor('liderança: papel no token', 'lideranca', claims(s2.access_token).app_metadata?.hope?.papel);
  conferir('liderança com MFA lê pedidos', 'algum', await ler(s2.access_token, 'pedidos_separados', 'id_registro'));
  conferir('liderança com MFA lê auditoria', 'algum', await ler(s2.access_token, 'auditoria', 'id'));
  conferir('liderança com MFA altera a meta global', 1, await rest(s2.access_token, 'PATCH', 'configuracoes_gerais?id=eq.1', { meta_horaria_global: 37 }));
  conferir(
    'a alteração da meta ficou na auditoria com quem fez',
    'algum',
    await ler(s2.access_token, 'auditoria', 'id', `&ator_id=eq.${env.TESTE_LIDERANCA_ID}&tabela=eq.configuracoes_gerais`),
  );
  await rest(s2.access_token, 'PATCH', 'configuracoes_gerais?id=eq.1', { meta_horaria_global: null });
  conferir('liderança não altera a auditoria', 'nada', await rest(s2.access_token, 'PATCH', 'auditoria?id=gt.0', { acao: 'adulterada' }));
  conferir('liderança não lista usuários (só admin)', 'nada', await rest(s2.access_token, 'POST', 'rpc/listar_usuarios_painel', {}));
});

await etapa('admin', async () => {
  const s1 = await entrar('ADMIN');
  conferir('admin sem MFA não lê membros dos outros', 1, await ler(s1.access_token, 'membros', 'user_id'));
  const s2 = await comMfa('ADMIN', s1);
  // Uma linha por conta de teste com id no .env.teste.local, menos a "sem perfil" (não tem linha).
  // Contado do arquivo: o teste de convite acrescenta contas (a Convidada), e um número fixo quebrava.
  const pessoasEsperadas = Object.keys(env).filter((k) => /^TESTE_.+_ID$/.test(k) && k !== 'TESTE_SEMPERFIL_ID').length;
  conferir('admin com MFA vê os membros de pessoa', pessoasEsperadas, await ler(s2.access_token, 'membros', 'user_id', '&tipo=eq.pessoa'));
  conferir('admin com MFA lista usuários', 'algum', await rest(s2.access_token, 'POST', 'rpc/listar_usuarios_painel', {}));
  conferir('admin não altera a própria linha', 'nada', await rest(s2.access_token, 'PATCH', `membros?user_id=eq.${env.TESTE_ADMIN_ID}`, { nome: 'Outro nome' }));
});

await etapa('corte de sessão', async () => {
  const s = await entrar('LEITURA');
  conferir('antes de sair de todos: lê pedidos', 'algum', await ler(s.access_token, 'pedidos_separados', 'id_registro'));
  await fetch(`${BASE}/auth/v1/logout?scope=global`, { method: 'POST', headers: { apikey: CHAVE, Authorization: `Bearer ${s.access_token}` } });
  conferir('depois de sair de todos: o mesmo token não lê mais nada', 'nada', await ler(s.access_token, 'pedidos_separados', 'id_registro'));
});

terminar();
