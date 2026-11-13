/**
 * Peças comuns dos scripts que conferem o projeto Supabase de TESTE (conferir-rls, conferir-pareamento).
 *
 * Lê o .env.teste.local, recusa a URL da produção, entra com as contas de teste (com MFA de verdade
 * quando o perfil exige) e monta o relatório. Nunca imprime senha, token nem segredo TOTP.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

const ARQUIVO = new URL('../.env.teste.local', import.meta.url);
const PRODUCAO = new URL('../.env.real.local', import.meta.url);

function lerEnv(arquivo) {
  const env = {};
  for (const linha of readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)=(.*)$/.exec(linha);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

export const env = lerEnv(ARQUIVO);
export const BASE = env.VITE_SUPABASE_URL;
export const CHAVE = env.VITE_SUPABASE_ANON_KEY;
if (!BASE || !CHAVE) {
  console.error('Faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env.teste.local.');
  process.exit(2);
}
if (existsSync(PRODUCAO) && lerEnv(PRODUCAO).VITE_SUPABASE_URL === BASE) {
  console.error('Recusado: a URL do .env.teste.local é a da produção.');
  process.exit(2);
}

export function gravarEnv(chave, valor) {
  const texto = readFileSync(ARQUIVO, 'utf8');
  const linha = `${chave}=${valor}`;
  const re = new RegExp(`^${chave}=.*$`, 'm');
  writeFileSync(ARQUIVO, re.test(texto) ? texto.replace(re, linha) : `${texto.replace(/\s*$/, '')}\n${linha}\n`);
  env[chave] = valor;
}

/* ---------------- Auth ---------------- */

export async function auth(caminho, corpo, token) {
  const headers = { apikey: CHAVE, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}/auth/v1/${caminho}`, { method: 'POST', headers, body: JSON.stringify(corpo ?? {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`auth/${caminho.split('?')[0]}: ${r.status} ${j.msg ?? j.error_description ?? j.message ?? ''}`);
  return j;
}

export function entrar(conta) {
  return auth('token?grant_type=password', { email: env[`TESTE_${conta}_EMAIL`], password: env[`TESTE_${conta}_SENHA`] });
}

export async function usuario(token) {
  const r = await fetch(`${BASE}/auth/v1/user`, { headers: { apikey: CHAVE, Authorization: `Bearer ${token}` } });
  return r.json();
}

function base32(texto) {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of texto.replace(/=+$/, '').toUpperCase()) {
    const v = alfabeto.indexOf(c);
    if (v >= 0) bits += v.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totp(segredo, instante = Date.now()) {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(instante / 30000)));
  const h = createHmac('sha1', base32(segredo)).update(contador).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/** Passa a sessão para aal2 com um fator TOTP (cadastra na primeira vez e guarda o segredo no arquivo). */
export async function comMfa(conta, sessao) {
  const chave = `TESTE_${conta}_TOTP`;
  const u = await usuario(sessao.access_token);
  let fator = (u.factors ?? []).find((f) => f.factor_type === 'totp' && f.status === 'verified');
  let segredo = env[chave];
  if (!fator) {
    const novo = await auth('factors', { factor_type: 'totp', friendly_name: `teste-${Date.now()}` }, sessao.access_token);
    fator = { id: novo.id };
    segredo = novo.totp.secret;
    gravarEnv(chave, segredo);
  } else if (!segredo) {
    throw new Error(`${conta}: já tem TOTP e o segredo não está no .env.teste.local`);
  }
  const desafio = await auth(`factors/${fator.id}/challenge`, {}, sessao.access_token);
  return auth(`factors/${fator.id}/verify`, { challenge_id: desafio.id, code: totp(segredo) }, sessao.access_token);
}

export const claims = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));

/* ---------------- Dados ---------------- */

/** Chamada ao PostgREST. Devolve { linhas, dados } ou { negado, status, codigo }. */
export async function rest(token, metodo, caminho, corpo, prefer = 'return=representation') {
  const headers = { apikey: CHAVE, 'Content-Type': 'application/json', Prefer: prefer };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}/rest/v1/${caminho}`, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  const texto = await r.text();
  let j = null;
  try {
    j = texto ? JSON.parse(texto) : null;
  } catch {
    j = texto;
  }
  if (!r.ok) return { negado: true, status: r.status, codigo: j?.code };
  return { linhas: Array.isArray(j) ? j.length : j == null ? 0 : 1, dados: j };
}

export const ler = (token, tabela, colunas, filtro = '') => rest(token, 'GET', `${tabela}?select=${colunas}${filtro}`);

/* ---------------- Relatório ---------------- */

export function relatorio() {
  const resultados = [];

  /** esperado: 'algum' (1+ linhas), 'nada' (0 linhas ou negado) ou um número exato de linhas. */
  function conferir(nome, esperado, r) {
    const ok =
      esperado === 'algum' ? !r.negado && r.linhas > 0 : esperado === 'nada' ? r.negado || r.linhas === 0 : !r.negado && r.linhas === esperado;
    const obtido = r.negado ? `negado (${r.status}${r.codigo ? ` ${r.codigo}` : ''})` : `${r.linhas} linha(s)`;
    resultados.push({ ok, nome, esperado: String(esperado), obtido });
  }

  function conferirValor(nome, esperado, obtido) {
    resultados.push({ ok: esperado === obtido, nome, esperado: String(esperado), obtido: String(obtido) });
  }

  async function etapa(titulo, fn) {
    try {
      await fn();
    } catch (e) {
      resultados.push({ ok: false, nome: `${titulo}: não terminou`, esperado: 'sem erro', obtido: e instanceof Error ? e.message : String(e) });
    }
  }

  function terminar() {
    const falhas = resultados.filter((r) => !r.ok);
    for (const r of resultados) {
      console.log(`${r.ok ? 'ok    ' : 'FALHOU'}  ${r.nome}${r.ok ? '' : `  (esperado: ${r.esperado}; obtido: ${r.obtido})`}`);
    }
    console.log(`\n${resultados.length - falhas.length} de ${resultados.length} conferências passaram.`);
    process.exit(falhas.length ? 1 : 0);
  }

  return { conferir, conferirValor, etapa, terminar };
}
