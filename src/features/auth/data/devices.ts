/**
 * Dispositivos pareados (TVs) e o pareamento por código.
 *
 *   demo      tudo no localStorage deste navegador. A TV em /tv/parear e o
 *             admin em Configurações > Dispositivos conversam pelo mesmo
 *             storage (abas diferentes do mesmo navegador).
 *   supabase  RPCs de supabase/migrations/0006 (listar_dispositivos,
 *             aprovar_pareamento, revogar_dispositivo) e a Edge Function
 *             `dispositivos` (iniciar, consultar). Nada disso existe no banco
 *             ainda: depende da fase da nuvem (docs/seguranca.md).
 */
import {
  formatPairingCode,
  generatePairingCode,
  isValidPairingCode,
  normalizePairingCode,
  PAIRING_TTL_MS,
} from './pairing';

export type DeviceKind = 'tv' | 'bancada' | 'coletor';

export interface PairedDevice {
  id: string;
  kind: DeviceKind;
  name: string;
  /** onde fica ("Parede das bancadas") */
  location: string | null;
  status: 'ativo' | 'revogado';
  pairedAt: string;
  approvedBy: string | null;
  lastSeenAt: string | null;
  expiresAt: string;
}

export interface ApproveInput {
  code: string;
  name: string;
  location: string;
  validityDays: number;
  approvedBy: string;
}

export interface PairingTicket {
  code: string;
  expiresAt: number;
  /** segredo de consulta (só no modo real; a TV guarda em memória) */
  secret?: string;
}

export type PairingPoll = { status: 'aguardando' } | { status: 'expirado' } | { status: 'aprovado'; tokenHash?: string };

export class DevicesUnavailableError extends Error {
  constructor() {
    super('O pareamento de dispositivos depende da fase da nuvem e ainda não está ativo neste ambiente.');
    this.name = 'DevicesUnavailableError';
  }
}

export const VALIDITY_OPTIONS = [30, 90, 180, 365] as const;
/** Teto por tipo, igual ao da aprovar_pareamento (0006): TV fica à vista no galpão, por isso menos. */
export const MAX_VALIDITY_DAYS: Record<DeviceKind, number> = { tv: 180, bancada: 365, coletor: 365 };
export const DEVICE_KIND_LABEL: Record<DeviceKind, string> = { tv: 'TV', bancada: 'Bancada', coletor: 'Coletor' };

/* ====================================================================
   DEMO
   ==================================================================== */

const DEMO_DEVICES_KEY = 'hope.demo.dispositivos';
export const DEMO_PAIRING_KEY = 'hope.demo.pareamento';

interface DemoPairing {
  code: string;
  expiresAt: number;
  status: 'aguardando' | 'aprovado';
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sem storage: a demonstração perde o estado ao recarregar */
  }
}

function seedDevices(): PairedDevice[] {
  const now = Date.now();
  return [
    {
      id: 'demo-tv-1',
      kind: 'tv',
      name: 'TV das bancadas',
      location: 'Parede das bancadas',
      status: 'ativo',
      pairedAt: new Date(now - 16 * 86_400_000).toISOString(),
      approvedBy: 'Gabriel',
      lastSeenAt: new Date(now - 3 * 60_000).toISOString(),
      expiresAt: new Date(now + 74 * 86_400_000).toISOString(),
    },
  ];
}

function demoList(): PairedDevice[] {
  const stored = readJson<PairedDevice[]>(DEMO_DEVICES_KEY);
  if (Array.isArray(stored)) return stored;
  const seeded = seedDevices();
  writeJson(DEMO_DEVICES_KEY, seeded);
  return seeded;
}

function demoSave(list: PairedDevice[]) {
  writeJson(DEMO_DEVICES_KEY, list);
}

export function readDemoPairing(): DemoPairing | null {
  const p = readJson<DemoPairing>(DEMO_PAIRING_KEY);
  return p && typeof p.code === 'string' && typeof p.expiresAt === 'number' ? p : null;
}

/** A TV de demonstração anuncia o código que está mostrando. */
export function startDemoPairing(): PairingTicket {
  const ticket = { code: generatePairingCode(), expiresAt: Date.now() + PAIRING_TTL_MS };
  writeJson(DEMO_PAIRING_KEY, { ...ticket, status: 'aguardando' } satisfies DemoPairing);
  return ticket;
}

export function clearDemoPairing() {
  try {
    localStorage.removeItem(DEMO_PAIRING_KEY);
  } catch {
    /* nada */
  }
}

/** Registra a TV de demonstração direto (botão "Simular aprovação"). */
export function registerDemoTv(approvedBy: string): PairedDevice {
  const now = Date.now();
  const device: PairedDevice = {
    id: `demo-tv-${now}`,
    kind: 'tv',
    name: 'TV de demonstração',
    location: 'Galpão',
    status: 'ativo',
    pairedAt: new Date(now).toISOString(),
    approvedBy,
    lastSeenAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 90 * 86_400_000).toISOString(),
  };
  demoSave([device, ...demoList()]);
  return device;
}

/* ====================================================================
   API usada pelas telas
   ==================================================================== */

export interface DevicesApi {
  list(): Promise<PairedDevice[]>;
  /** aprova o código mostrado na TV; `undo` desfaz no demo (no modo real, revogue) */
  approve(input: ApproveInput): Promise<{ undo: (() => Promise<void>) | null }>;
  /** devolve `undo` só quando desfazer é possível (no modo real, revogar é definitivo) */
  revoke(id: string): Promise<{ undo: (() => Promise<void>) | null }>;
  /** lado da TV */
  startPairing(): Promise<PairingTicket>;
  pollPairing(ticket: PairingTicket): Promise<PairingPoll>;
}

const demoApi: DevicesApi = {
  async list() {
    return demoList();
  },
  async approve(input) {
    const code = normalizePairingCode(input.code);
    if (!isValidPairingCode(code)) throw new Error('Código inválido. São 8 letras e números, como aparecem na TV.');
    const pending = readDemoPairing();
    // Com uma TV de demonstração aberta, o código precisa bater. Sem nenhuma, qualquer código bem formado serve.
    if (pending && pending.status === 'aguardando' && pending.expiresAt > Date.now() && pending.code !== code) {
      throw new Error('Código inválido ou expirado. Confira o que está na tela da TV.');
    }
    const now = Date.now();
    const device: PairedDevice = {
      id: `demo-${code}-${now}`,
      kind: 'tv',
      name: input.name.trim(),
      location: input.location.trim() || null,
      status: 'ativo',
      pairedAt: new Date(now).toISOString(),
      approvedBy: input.approvedBy,
      lastSeenAt: null,
      expiresAt: new Date(now + input.validityDays * 86_400_000).toISOString(),
    };
    demoSave([device, ...demoList()]);
    if (pending && pending.code === code) writeJson(DEMO_PAIRING_KEY, { ...pending, status: 'aprovado' } satisfies DemoPairing);
    return {
      undo: async () => {
        demoSave(demoList().filter((d) => d.id !== device.id));
      },
    };
  },
  async revoke(id) {
    const before = demoList();
    const target = before.find((d) => d.id === id);
    if (!target) return { undo: null };
    demoSave(before.map((d) => (d.id === id ? { ...d, status: 'revogado' as const } : d)));
    return {
      undo: async () => {
        demoSave(demoList().map((d) => (d.id === id ? target : d)));
      },
    };
  },
  async startPairing() {
    return startDemoPairing();
  },
  async pollPairing(ticket) {
    const p = readDemoPairing();
    if (!p || p.code !== ticket.code) return { status: 'expirado' };
    if (p.status === 'aprovado') return { status: 'aprovado' };
    return p.expiresAt > Date.now() ? { status: 'aguardando' } : { status: 'expirado' };
  },
};

/* ====================================================================
   SUPABASE (fase da nuvem)
   ==================================================================== */

interface DeviceRow {
  id: string;
  tipo: DeviceKind;
  nome: string;
  local: string | null;
  status: 'ativo' | 'revogado';
  expira_em: string;
  aprovado_por_nome: string | null;
  aprovado_em: string;
  ultimo_uso_em: string | null;
}

/** Função ou RPC que ainda não existe no banco: PostgREST 404/PGRST202, Edge Function 404. */
function isMissing(error: { code?: string; message?: string; status?: number } | null | undefined): boolean {
  if (!error) return false;
  return error.code === 'PGRST202' || error.code === '42883' || error.status === 404 || /not found/i.test(error.message ?? '');
}

async function sb() {
  const m = await import('@/lib/supabase');
  return m.getSupabase();
}

const supabaseApi: DevicesApi = {
  async list() {
    const c = await sb();
    const { data, error } = await c.rpc('listar_dispositivos');
    if (isMissing(error)) throw new DevicesUnavailableError();
    if (error) throw new Error('Não foi possível carregar os dispositivos.');
    return ((data ?? []) as DeviceRow[]).map((r) => ({
      id: r.id,
      kind: r.tipo,
      name: r.nome,
      location: r.local,
      status: r.status,
      pairedAt: r.aprovado_em,
      approvedBy: r.aprovado_por_nome,
      lastSeenAt: r.ultimo_uso_em,
      expiresAt: r.expira_em,
    }));
  },
  async approve(input) {
    const code = normalizePairingCode(input.code);
    if (!isValidPairingCode(code)) throw new Error('Código inválido. São 8 letras e números, como aparecem na TV.');
    const c = await sb();
    const { error } = await c.rpc('aprovar_pareamento', {
      p_codigo: code,
      p_nome: input.name.trim(),
      p_validade_dias: input.validityDays,
      p_local: input.location.trim() || null,
    });
    if (isMissing(error)) throw new DevicesUnavailableError();
    if (error) throw new Error('Código inválido ou expirado. Confira o que está na tela da TV.');
    return { undo: null };
  },
  async revoke(id) {
    const c = await sb();
    const { error } = await c.rpc('revogar_dispositivo', { p_id: id });
    if (isMissing(error)) throw new DevicesUnavailableError();
    if (error) throw new Error('Não foi possível revogar. Tente de novo.');
    return { undo: null };
  },
  async startPairing() {
    const c = await sb();
    const { data, error } = await c.functions.invoke<{ codigo: string; segredo: string; expira_em: string }>('dispositivos', {
      body: { acao: 'iniciar', tipo: 'tv' },
    });
    if (error || !data) throw new DevicesUnavailableError();
    return { code: data.codigo, secret: data.segredo, expiresAt: Date.parse(data.expira_em) };
  },
  async pollPairing(ticket) {
    const c = await sb();
    const { data, error } = await c.functions.invoke<{ status: string; token_hash?: string }>('dispositivos', {
      body: { acao: 'consultar', codigo: ticket.code, segredo: ticket.secret },
    });
    if (error || !data) throw new DevicesUnavailableError();
    if (data.status === 'aprovado' && data.token_hash) {
      // Token de uso único: vira a sessão própria da TV (refresh rotativo daqui em diante).
      const { error: otpError } = await c.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
      if (otpError) return { status: 'expirado' };
      return { status: 'aprovado', tokenHash: data.token_hash };
    }
    return data.status === 'aguardando' ? { status: 'aguardando' } : { status: 'expirado' };
  },
};

export function devicesApi(mode: 'demo' | 'supabase'): DevicesApi {
  return mode === 'supabase' ? supabaseApi : demoApi;
}

export { formatPairingCode };
