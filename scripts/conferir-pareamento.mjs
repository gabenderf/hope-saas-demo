/**
 * Confere, contra o projeto Supabase de TESTE, o pareamento de máquina de ponta a ponta e o que
 * cada conta de máquina (bancada, coletor, TV) pode fazer.
 *
 *   node scripts/conferir-pareamento.mjs
 *
 * Para cada tipo: pede código à Edge Function `dispositivos`, consulta antes de aprovar (e com
 * segredo errado), aprova como admin com MFA, leva a credencial uma vez só, troca por sessão e
 * confere as regras do papel (migration 0007). No fim, revoga as três máquinas e confere o corte.
 * Cada rodada cria 3 dispositivos novos (ficam revogados na lista, como ficaria na vida real).
 * Os dados que as máquinas gravam são marcados TESTE-PAREAMENTO e apagados no fim pelo SQL que o
 * script imprime (a anon key não apaga nada).
 */
import { BASE, CHAVE, auth, claims, comMfa, entrar, ler, relatorio, rest } from './lib-teste.mjs';

const { conferir, conferirValor, etapa, terminar } = relatorio();
const marca = `TESTE-PAREAMENTO-${Date.now()}`;
const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

async function funcao(corpo) {
  const r = await fetch(`${BASE}/functions/v1/dispositivos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: CHAVE },
    body: JSON.stringify(corpo),
  });
  return { status: r.status, corpo: await r.json().catch(() => null) };
}

let admin;
const maquinas = {};

async function parear(tipo, nome, local, validade) {
  const ini = await funcao({ acao: 'iniciar', tipo });
  conferirValor(`${tipo}: pedir código devolve 8 letras e números`, true, /^[A-HJKMNP-Z2-9]{8}$/.test(ini.corpo?.codigo ?? ''));
  const { codigo, segredo } = ini.corpo;
  conferirValor(`${tipo}: consulta antes de aprovar`, 'aguardando', (await funcao({ acao: 'consultar', codigo, segredo })).corpo?.status);
  conferirValor(
    `${tipo}: consulta com segredo errado`,
    'expirado',
    (await funcao({ acao: 'consultar', codigo, segredo: `${segredo.slice(0, -4)}AAAA` })).corpo?.status,
  );

  const aprovado = await rest(admin.access_token, 'POST', 'rpc/aprovar_pareamento', {
    p_codigo: codigo,
    p_nome: nome,
    p_validade_dias: validade,
    p_local: local,
  });
  conferirValor(`${tipo}: admin com MFA aprova o código`, 'aprovado', aprovado.negado ? `negado ${aprovado.status}` : 'aprovado');

  const c1 = await funcao({ acao: 'consultar', codigo, segredo });
  conferirValor(`${tipo}: consulta depois de aprovar entrega a credencial`, 'aprovado', c1.corpo?.status);
  const c2 = await funcao({ acao: 'consultar', codigo, segredo });
  conferirValor(`${tipo}: segunda consulta não leva outra credencial`, 'expirado', c2.corpo?.status);

  const sessao = await auth('verify', { type: 'magiclink', token_hash: c1.corpo.token_hash });
  conferirValor(`${tipo}: token de uso único vira sessão`, true, Boolean(sessao.access_token));
  let reuso = 'aceito';
  try {
    await auth('verify', { type: 'magiclink', token_hash: c1.corpo.token_hash });
  } catch {
    reuso = 'recusado';
  }
  conferirValor(`${tipo}: token de uso único não vale duas vezes`, 'recusado', reuso);

  const hope = claims(sessao.access_token).app_metadata?.hope;
  conferirValor(`${tipo}: token diz que é dispositivo`, 'dispositivo', hope?.tipo);
  conferirValor(`${tipo}: papel no token`, tipo, hope?.papel);
  conferirValor(`${tipo}: token traz o id do dispositivo`, true, Boolean(hope?.dispositivo_id));
  maquinas[tipo] = { sessao, dispositivoId: hope?.dispositivo_id, userId: claims(sessao.access_token).sub };
  return sessao;
}

await etapa('admin', async () => {
  admin = await comMfa('ADMIN', await entrar('ADMIN'));
});

await etapa('função', async () => {
  conferirValor('tipo desconhecido é recusado', 400, (await funcao({ acao: 'iniciar', tipo: 'impressora' })).status);
  conferirValor('ação desconhecida é recusada', 400, (await funcao({ acao: 'listar' })).status);
  conferirValor('código que não existe', 'expirado', (await funcao({ acao: 'consultar', codigo: 'ABCDEFGH', segredo: 'x' })).corpo?.status);
});

await etapa('bancada', async () => {
  const s = await parear('bancada', 'Bancada Teste 01', 'Bancada 01', 365);
  const t = s.access_token;
  conferir('bancada lê operadores (login do operador)', 'algum', await ler(t, 'operadores_metas', 'id_operador'));
  conferir('bancada lê a meta global', 1, await ler(t, 'configuracoes_gerais', 'meta_horaria_global'));
  const bip = {
    id_operador: '901',
    codigo_rastreio: `${marca}-1`,
    num_pedido: null,
    quantidade_pedidos: 1,
    bancada: 'Bancada 01',
    itens: [{ sku: '1X-GAZE-13FIOS', quantidade: 1 }],
  };
  const gravou = await rest(t, 'POST', 'pedidos_separados?on_conflict=codigo_rastreio', bip, 'resolution=ignore-duplicates,return=representation');
  conferir('bancada grava a bipagem, como o REGISTER_SCAN', 1, gravou);
  conferirValor('a bipagem sai com registrado_por da máquina', maquinas.bancada.userId, gravou.dados?.[0]?.registrado_por);
  conferir(
    'bipagem repetida é ignorada, sem erro',
    0,
    await rest(t, 'POST', 'pedidos_separados?on_conflict=codigo_rastreio', bip, 'resolution=ignore-duplicates,return=representation'),
  );
  conferir(
    'bancada não grava bipagem com quantidade 5',
    'nada',
    await rest(t, 'POST', 'pedidos_separados', { ...bip, codigo_rastreio: `${marca}-2`, quantidade_pedidos: 5 }),
  );
  conferir(
    'bancada grava o acesso do operador',
    1,
    await rest(t, 'POST', 'logs_acesso', { bancada: 'Bancada 01', id_anterior: null, id_novo: '901', justificativa: marca }),
  );
  conferir(
    'bancada cadastra operador novo (ativo, meta sã)',
    1,
    await rest(t, 'POST', 'operadores_metas', { id_operador: `9${String(Date.now()).slice(-5)}`, nome_colaborador: marca, meta_horaria: 35, status: 'ativo' }),
  );
  conferir('bancada lê o placar do dia', 'algum', await ler(t, 'pedidos_separados', 'quantidade_pedidos,data_hora', '&id_operador=eq.901'));
  conferir('bancada não altera a meta global', 'nada', await rest(t, 'PATCH', 'configuracoes_gerais?id=eq.1', { meta_horaria_global: 99 }));
  conferir('bancada não lê os itens da fila', 'nada', await ler(t, 'fila_snapshot_itens', 'id'));
  conferir('bancada não lê auditoria', 'nada', await ler(t, 'auditoria', 'id'));
  conferir('bancada não lê dispositivos', 'nada', await ler(t, 'dispositivos', 'id'));
  const renovado = await auth('token?grant_type=refresh_token', { refresh_token: s.refresh_token });
  conferirValor('bancada renova o token', true, Boolean(renovado.access_token));
  maquinas.bancada.sessao = renovado;
});

await etapa('coletor', async () => {
  const s = await parear('coletor', 'Coletor Teste', 'Liderança', 365);
  const t = s.access_token;
  const snap = await rest(t, 'POST', 'fila_snapshots', {
    dia_operacional: hoje,
    etapa: 'para_enviar',
    status: 'ok',
    total_capturado: 1,
    total_esperado: 1,
    origem: marca,
  });
  conferir('coletor grava o snapshot da fila', 1, snap);
  const snapshotId = snap.dados?.[0]?.id;
  conferirValor('o snapshot sai com registrado_por do coletor', maquinas.coletor.userId, snap.dados?.[0]?.registrado_por);
  conferir(
    'coletor grava item no próprio snapshot',
    1,
    await rest(t, 'POST', 'fila_snapshot_itens', {
      snapshot_id: snapshotId,
      dia_operacional: hoje,
      etapa: 'para_enviar',
      num_pedido: `${marca}-PED`,
      itens: [{ sku: '1,5L-PERFU-FLEX', quantidade: 1 }],
    }),
  );
  conferir('coletor lê a fila pendente', 'algum', await ler(t, 'fila_pendente', 'num_pedido', `&dia_operacional=eq.${hoje}`));
  conferir('coletor lê as bipagens (para cruzar)', 'algum', await ler(t, 'pedidos_separados', 'num_pedido'));
  conferir('coletor lê a configuração da previsão', 1, await ler(t, 'config_previsao', 'equipe_padrao'));
  conferir(
    'coletor publica a previsão do dia',
    1,
    await rest(t, 'POST', 'previsao_dia', { dia_operacional: '2030-01-01', meta_publicada_por: marca }),
  );
  conferir('coletor atualiza a previsão do dia', 1, await rest(t, 'PATCH', 'previsao_dia?dia_operacional=eq.2030-01-01', { volume_visivel: 1 }));
  conferir('coletor não grava bipagem', 'nada', await rest(t, 'POST', 'pedidos_separados', { id_operador: '901', codigo_rastreio: `${marca}-C`, bancada: 'x' }));
  conferir('coletor não altera a meta global', 'nada', await rest(t, 'PATCH', 'configuracoes_gerais?id=eq.1', { meta_horaria_global: 99 }));
});

await etapa('tv', async () => {
  const s = await parear('tv', 'TV Teste', 'Parede das bancadas', 400);
  const t = s.access_token;
  conferir('TV lê as bipagens (Modo TV)', 'algum', await ler(t, 'pedidos_separados', 'id_registro'));
  conferir('TV lê operadores', 'algum', await ler(t, 'operadores_metas', 'id_operador'));
  conferir('TV não lê os itens da fila (loja e rastreio)', 'nada', await ler(t, 'fila_snapshot_itens', 'id'));
  conferir('TV não grava nada', 'nada', await rest(t, 'POST', 'logs_acesso', { bancada: 'TV', id_novo: '901', justificativa: marca }));
});

await etapa('lista e validade', async () => {
  const lista = await rest(admin.access_token, 'POST', 'rpc/listar_dispositivos', {});
  conferir('admin vê os dispositivos na lista', 'algum', lista);
  const tv = (lista.dados ?? []).find((d) => d.id === maquinas.tv?.dispositivoId);
  const dias = tv ? Math.round((Date.parse(tv.expira_em) - Date.now()) / 86_400_000) : null;
  conferirValor('TV pedida com 400 dias fica com 180', 180, dias);
});

await etapa('revogação', async () => {
  for (const tipo of ['bancada', 'coletor', 'tv']) {
    const m = maquinas[tipo];
    if (!m) continue;
    const r = await rest(admin.access_token, 'POST', 'rpc/revogar_dispositivo', { p_id: m.dispositivoId });
    conferirValor(`${tipo}: admin revoga`, 'ok', r.negado ? `negado ${r.status}` : 'ok');
    conferir(`${tipo}: depois de revogada, o mesmo token não lê nada`, 'nada', await ler(m.sessao.access_token, 'operadores_metas', 'id_operador'));
    let renovar = 'aceito';
    try {
      await auth('token?grant_type=refresh_token', { refresh_token: m.sessao.refresh_token });
    } catch {
      renovar = 'recusado';
    }
    conferirValor(`${tipo}: depois de revogada, não renova o token`, 'recusado', renovar);
  }
});

console.log(`\nLimpeza dos dados de teste (rodar no projeto de TESTE):
delete from public.fila_snapshot_itens where num_pedido like '${marca}%';
delete from public.fila_snapshots where origem = '${marca}';
delete from public.previsao_dia where meta_publicada_por = '${marca}';
delete from public.pedidos_separados where codigo_rastreio like '${marca}%';
delete from public.logs_acesso where justificativa = '${marca}';
delete from public.operadores_metas where nome_colaborador = '${marca}';
`);
terminar();
