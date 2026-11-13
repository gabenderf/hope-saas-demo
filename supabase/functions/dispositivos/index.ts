/**
 * Edge Function `dispositivos`: pareamento de TV, bancada e coletor por código.
 * Plano em docs/seguranca.md §8; tabelas, aprovação e revogação na migration 0006.
 *
 * Duas ações, as duas sem login (a máquina ainda não tem conta):
 *   iniciar   { acao: 'iniciar', tipo }              -> { codigo, segredo, expira_em }
 *   consultar { acao: 'consultar', codigo, segredo } -> { status: 'aguardando' | 'aprovado' | 'expirado', token_hash? }
 *
 * O admin aprova o código pela tela Configurações > Dispositivos (rpc aprovar_pareamento, com MFA).
 * Aprovado, a próxima consulta cria a conta da máquina no Auth e devolve UMA vez um token de login
 * de uso único (magic link). A máquina troca por sessão em /auth/v1/verify e daí em diante vive de
 * refresh token rotativo.
 *
 * Publicada com verify_jwt = false. Usa a chave de serviço do próprio ambiente da função; nada
 * dela sai daqui. Contrato do lado do navegador: src/features/auth/data/devices.ts.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const TIPOS = new Set(['tv', 'bancada', 'coletor']);
/** O mesmo alfabeto do check da tabela (^[A-HJKMNP-Z2-9]{8}$): sem 0/O e 1/I/L, para ler de longe. */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const JANELA_MS = 10 * 60_000;
/** Pedidos de código por IP a cada 10 min (§8). */
const LIMITE_POR_IP = 10;
/** Pedidos de código no projeto todo a cada 10 min: segura quem troca de IP. */
const LIMITE_GERAL = 100;
const DOMINIO_CONTA = 'dispositivos.hope.invalid';
const VALIDADE_MAXIMA: Record<string, number> = { tv: 180, bancada: 365, coletor: 365 };

// Sem cookie nem credencial ambiente: a origem não muda o que a função entrega, então '*' não
// abre nada. A extensão chama do service worker, onde CORS não se aplica.
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

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const aleatorio = (n: number) => crypto.getRandomValues(new Uint8Array(n));

function gerarCodigo(): string {
  let codigo = '';
  while (codigo.length < 8) {
    for (const b of aleatorio(16)) {
      // 248 = 8 × 31: descartar o resto evita que as primeiras letras saiam mais que as outras.
      if (b < 248 && codigo.length < 8) codigo += ALFABETO[b % 31];
    }
  }
  return codigo;
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256hex(texto: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Comparação em tempo constante: o tempo da resposta não diz quantos caracteres bateram. */
function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

function ipDe(req: Request): string | null {
  const bruto = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]!.trim() || (req.headers.get('cf-connecting-ip') ?? '');
  return /^[0-9a-fA-F:.]{3,45}$/.test(bruto) ? bruto : null;
}

async function contarDesde(desde: string, ip?: string): Promise<number> {
  let q = admin.from('pareamentos').select('id', { count: 'exact', head: true }).gte('criado_em', desde);
  if (ip) q = q.eq('ip', ip);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

async function iniciar(req: Request, tipo: unknown): Promise<Response> {
  if (typeof tipo !== 'string' || !TIPOS.has(tipo)) return responder({ erro: 'tipo inválido' }, 400);

  const ip = ipDe(req);
  const desde = new Date(Date.now() - JANELA_MS).toISOString();
  if ((await contarDesde(desde)) >= LIMITE_GERAL || (ip && (await contarDesde(desde, ip)) >= LIMITE_POR_IP)) {
    return responder({ erro: 'Muitos pedidos de código. Espere alguns minutos.' }, 429);
  }

  const segredo = base64url(aleatorio(32));
  const segredo_hash = await sha256hex(segredo);
  const user_agent = (req.headers.get('user-agent') ?? '').slice(0, 200) || null;

  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const codigo = gerarCodigo();
    const { data, error } = await admin
      .from('pareamentos')
      .insert({ codigo, segredo_hash, tipo, ip, user_agent })
      .select('codigo, expira_em')
      .single();
    if (!error) return responder({ codigo: data.codigo, segredo, expira_em: data.expira_em });
    if (error.code !== '23505') throw error; // 23505 = código já sorteado: tenta outro
  }
  throw new Error('não foi possível sortear um código livre');
}

async function consultar(codigoBruto: unknown, segredo: unknown): Promise<Response> {
  // Mesma resposta para "não existe", "segredo errado" e "expirou": a consulta não serve para
  // descobrir códigos.
  const expirado = () => responder({ status: 'expirado' });
  if (typeof codigoBruto !== 'string' || typeof segredo !== 'string' || segredo.length > 200) return expirado();
  const codigo = codigoBruto.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-HJKMNP-Z2-9]{8}$/.test(codigo)) return expirado();

  const { data: p, error } = await admin
    .from('pareamentos')
    .select('id, segredo_hash, tipo, status, expira_em, nome, local, validade_dias, aprovado_por, aprovado_em')
    .eq('codigo', codigo)
    .maybeSingle();
  if (error) throw error;
  if (!p || !iguais(p.segredo_hash, await sha256hex(segredo))) return expirado();

  const vivo = Date.parse(p.expira_em) > Date.now();
  if (p.status === 'aguardando' && vivo) return responder({ status: 'aguardando' });
  if (p.status !== 'aprovado' || !vivo) return expirado();

  // Reserva: só UMA consulta leva a credencial, mesmo com duas chegando ao mesmo tempo.
  const { data: reservado, error: erroReserva } = await admin
    .from('pareamentos')
    .update({ status: 'consumido' })
    .eq('id', p.id)
    .eq('status', 'aprovado')
    .select('id');
  if (erroReserva) throw erroReserva;
  if (!reservado?.length) return expirado();

  let userId: string | null = null;
  let dispositivoId: string | null = null;
  try {
    const email = `${p.tipo}-${p.id}@${DOMINIO_CONTA}`;
    const conta = await admin.auth.admin.createUser({
      email,
      // Nunca usada nem guardada: a máquina entra pelo token de uso único e vive de refresh token.
      password: base64url(aleatorio(32)),
      email_confirm: true,
    });
    if (conta.error) throw conta.error;
    userId = conta.data.user.id;

    const nome: string = p.nome ?? `${p.tipo} sem nome`;
    const membro = await admin.from('membros').insert({ user_id: userId, nome, tipo: 'dispositivo', papel: p.tipo, status: 'ativo' });
    if (membro.error) throw membro.error;
    const modulo = await admin.from('membros_modulos').insert({ user_id: userId, modulo: 'expedicao', papel: null });
    if (modulo.error) throw modulo.error;

    const dias = Math.min(Math.max(p.validade_dias ?? 90, 1), VALIDADE_MAXIMA[p.tipo] ?? 180);
    const disp = await admin
      .from('dispositivos')
      .insert({
        user_id: userId,
        tipo: p.tipo,
        nome,
        local: p.local,
        status: 'ativo',
        expira_em: new Date(Date.now() + dias * 86_400_000).toISOString(),
        aprovado_por: p.aprovado_por,
        aprovado_em: p.aprovado_em ?? new Date().toISOString(),
      })
      .select('id')
      .single();
    if (disp.error) throw disp.error;
    dispositivoId = disp.data.id;

    const vinculo = await admin.from('pareamentos').update({ dispositivo_id: dispositivoId }).eq('id', p.id);
    if (vinculo.error) throw vinculo.error;

    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (link.error) throw link.error;
    return responder({ status: 'aprovado', token_hash: link.data.properties.hashed_token });
  } catch (e) {
    // Desfaz tudo para a máquina poder consultar de novo dentro dos 5 min da aprovação.
    if (dispositivoId) await admin.from('dispositivos').delete().eq('id', dispositivoId);
    if (userId) await admin.auth.admin.deleteUser(userId); // membros e membros_modulos saem em cascata
    await admin.from('pareamentos').update({ status: 'aprovado', dispositivo_id: null }).eq('id', p.id).eq('status', 'consumido');
    throw e;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ erro: 'use POST' }, 405);

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return responder({ erro: 'corpo inválido' }, 400);
  }
  if (typeof corpo !== 'object' || corpo === null) return responder({ erro: 'corpo inválido' }, 400);
  const pedido = corpo as Record<string, unknown>;

  try {
    if (pedido.acao === 'iniciar') return await iniciar(req, pedido.tipo);
    if (pedido.acao === 'consultar') return await consultar(pedido.codigo, pedido.segredo);
    return responder({ erro: 'ação desconhecida' }, 400);
  } catch (e) {
    // Só a mensagem: nunca o corpo do pedido (tem o segredo).
    console.error('dispositivos:', e instanceof Error ? e.message : String(e));
    return responder({ erro: 'Falha temporária. Tente de novo.' }, 500);
  }
});
