/**
 * Edge Function `usuarios`: convidar e reenviar convite (docs/seguranca.md §7 e §16).
 *
 *   POST { acao: 'convidar', nome, email, papel }  ->  { user_id }
 *   POST { acao: 'reenviar', user_id }             ->  { ok: true }
 *
 * Quem chama manda o próprio JWT (verify_jwt = true). A função só segue se o banco disser que
 * esse chamador tem `usuarios.gerenciar` agora (rpc tenho_permissao: a mesma app.tem_permissao
 * das policies, então MFA, sessão viva e status ativo contam). Admin sem aal2 é recusado.
 *
 * A chave de serviço só cria a conta no Auth e manda o e-mail do convite. As linhas em `membros`
 * e `membros_modulos` são gravadas com o JWT de quem convidou: assim o RLS confere de novo e a
 * auditoria mostra o nome da pessoa, não "sistema". Falhou depois de criar a conta: a conta é
 * apagada, para o convite poder ser refeito. Mas só a conta que ESTE pedido criou: e-mail já
 * presente no painel é recusado antes de chamar o Auth (ver a conferência em `convidar`).
 *
 * `reenviar` só manda o e-mail de novo para quem foi convidado e ainda não aceitou (o Auth gera um
 * token novo e o link anterior deixa de valer). Confere a permissão e a pessoa com o JWT de quem
 * pediu, antes de usar a chave de serviço. NUNCA cria nem apaga conta ou linha: não há o que desfazer.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const PAPEIS = new Set(['admin', 'lideranca', 'leitura']);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Sem cookie: a autorização é o Bearer de cada pedido, então '*' não abre nada.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function responder(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

const URL_PROJETO = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(URL_PROJETO, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Cliente com o JWT de quem pediu: o banco decide se ele pode `usuarios.gerenciar`. */
async function conferirChamador(autorizacao: string) {
  const chamador = createClient(URL_PROJETO, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: pode, error: erroPermissao } = await chamador.rpc('tenho_permissao', { p_permissao: 'usuarios.gerenciar' });
  if (erroPermissao) throw erroPermissao;
  return { chamador, pode: pode === true };
}

async function convidar(autorizacao: string, pedido: Record<string, unknown>): Promise<Response> {
  const nome = typeof pedido.nome === 'string' ? pedido.nome.trim() : '';
  const email = typeof pedido.email === 'string' ? pedido.email.trim().toLowerCase() : '';
  const papel = typeof pedido.papel === 'string' ? pedido.papel : '';
  if (nome.length < 1 || nome.length > 120) return responder({ erro: 'Informe o nome (até 120 caracteres).' }, 400);
  if (!EMAIL.test(email) || email.length > 200) return responder({ erro: 'Informe um e-mail válido.' }, 400);
  if (!PAPEIS.has(papel)) return responder({ erro: 'Perfil inválido.' }, 400);

  const { chamador, pode } = await conferirChamador(autorizacao);
  if (!pode) {
    return responder({ erro: 'Convidar pessoas exige o perfil Administrador, com a verificação em duas etapas feita.' }, 403);
  }

  // ⚠️ O Auth NÃO recusa e-mail de conta que ainda não aceitou o convite: reenvia o convite e devolve
  // a conta que já existia. Sem esta conferência, o insert em `membros` falhava por duplicidade e a
  // limpeza lá embaixo apagava a conta de quem já tinha sido convidado. Também evita reenviar e-mail
  // para conta desativada. Lê com o JWT de quem pediu (a RPC exige usuarios.gerenciar).
  const { data: pessoas, error: erroLista } = await chamador.rpc('listar_usuarios_painel');
  if (erroLista) throw erroLista;
  const existente = (pessoas as { email: string | null; status: string; convite_pendente: boolean }[] | null)?.find(
    (p) => (p.email ?? '').trim().toLowerCase() === email,
  );
  if (existente) {
    const erro =
      existente.status === 'desativado'
        ? 'Este e-mail já tem conta no painel, com o acesso desativado. Reative pela lista.'
        : existente.convite_pendente
          ? 'Esta pessoa já foi convidada e ainda não aceitou o convite.'
          : 'Este e-mail já tem conta no painel.';
    return responder({ erro }, 409);
  }

  const site = Deno.env.get('SITE_URL')?.replace(/\/$/, '');
  const convite = await admin.auth.admin.inviteUserByEmail(email, {
    data: { nome },
    ...(site ? { redirectTo: `${site}/entrar/redefinir` } : {}),
  });
  if (convite.error) {
    if (/already|registered|exists/i.test(convite.error.message)) {
      return responder({ erro: 'Já existe uma conta com este e-mail.' }, 409);
    }
    console.error('usuarios: convite recusado pelo Auth:', convite.error.message);
    return responder({ erro: 'O Supabase não conseguiu enviar o convite. Confira o e-mail de envio (SMTP) do projeto.' }, 502);
  }
  const userId = convite.data.user.id;

  const membro = await chamador.from('membros').insert({ user_id: userId, nome, tipo: 'pessoa', papel, status: 'ativo' });
  if (membro.error) {
    // Duplicidade: outro convite para o mesmo e-mail passou pela conferência ao mesmo tempo, e a
    // conta é DELE. Apagar aqui derrubaria o convite que valeu.
    if (membro.error.code === '23505') {
      return responder({ erro: 'Esta pessoa já foi convidada e ainda não aceitou o convite.' }, 409);
    }
    // Sem a linha em membros a conta não serve para nada: desfaz para o convite poder ser refeito.
    await admin.auth.admin.deleteUser(userId);
    throw membro.error;
  }
  const modulo = await chamador.from('membros_modulos').insert({ user_id: userId, modulo: 'expedicao', papel: null });
  if (modulo.error) {
    // A linha em membros acabou de ser gravada por este pedido: a conta é nossa.
    await admin.auth.admin.deleteUser(userId); // membros e membros_modulos saem em cascata
    throw modulo.error;
  }
  return responder({ user_id: userId });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JA_ACEITOU =
  'Esta pessoa já aceitou o convite. Se esqueceu a senha, ela pode usar "Esqueci a senha" na tela de entrar.';

async function reenviar(autorizacao: string, pedido: Record<string, unknown>): Promise<Response> {
  const userId = typeof pedido.user_id === 'string' ? pedido.user_id.trim() : '';
  if (!UUID.test(userId)) return responder({ erro: 'Usuário inválido.' }, 400);

  const { chamador, pode } = await conferirChamador(autorizacao);
  if (!pode) {
    return responder({ erro: 'Reenviar convites exige o perfil Administrador, com a verificação em duas etapas feita.' }, 403);
  }

  const { data: pessoas, error: erroLista } = await chamador.rpc('listar_usuarios_painel');
  if (erroLista) throw erroLista;
  const pessoa = (
    pessoas as { user_id: string; nome: string; email: string | null; status: string; convite_pendente: boolean }[] | null
  )?.find((p) => p.user_id === userId);
  if (!pessoa || !pessoa.email) return responder({ erro: 'Usuário não encontrado.' }, 404);
  if (pessoa.status === 'desativado') {
    return responder({ erro: 'O acesso desta pessoa está desativado. Reative antes de reenviar o convite.' }, 409);
  }
  if (!pessoa.convite_pendente) return responder({ erro: JA_ACEITOU }, 409);

  // Para conta que ainda não aceitou, o Auth reenvia o convite (token novo) e devolve a conta existente.
  // Nada é criado nem apagado aqui.
  const site = Deno.env.get('SITE_URL')?.replace(/\/$/, '');
  const convite = await admin.auth.admin.inviteUserByEmail(pessoa.email.trim().toLowerCase(), {
    data: { nome: pessoa.nome },
    ...(site ? { redirectTo: `${site}/entrar/redefinir` } : {}),
  });
  if (convite.error) {
    if (/already|registered|exists/i.test(convite.error.message)) return responder({ erro: JA_ACEITOU }, 409);
    if (/rate|limit|too many/i.test(convite.error.message)) {
      return responder({ erro: 'Muitos e-mails enviados em pouco tempo. Tente de novo em alguns minutos.' }, 429);
    }
    console.error('usuarios: reenvio recusado pelo Auth:', convite.error.message);
    return responder({ erro: 'O Supabase não conseguiu enviar o convite. Confira o e-mail de envio (SMTP) do projeto.' }, 502);
  }
  return responder({ ok: true });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ erro: 'use POST' }, 405);

  const autorizacao = req.headers.get('Authorization') ?? '';
  if (!autorizacao.startsWith('Bearer ')) return responder({ erro: 'Entre para convidar.' }, 401);

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return responder({ erro: 'corpo inválido' }, 400);
  }
  if (typeof corpo !== 'object' || corpo === null) return responder({ erro: 'corpo inválido' }, 400);
  const pedido = corpo as Record<string, unknown>;

  try {
    if (pedido.acao === 'convidar') return await convidar(autorizacao, pedido);
    if (pedido.acao === 'reenviar') return await reenviar(autorizacao, pedido);
    return responder({ erro: 'ação desconhecida' }, 400);
  } catch (e) {
    console.error('usuarios:', e instanceof Error ? e.message : String(e));
    return responder({ erro: 'Falha temporária. Tente de novo.' }, 500);
  }
});
