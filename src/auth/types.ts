/**
 * CONTRATO DE AUTENTICAÇÃO E PERMISSÃO (compartilhado por todas as features).
 *
 * Telas perguntam "pode?" com useCan('expedicao.metas.editar'). Nunca
 * comparam papel (role === 'admin') direto: a matriz abaixo é a única fonte.
 *
 * Os módulos já existem no tipo porque o SaaS vai receber as outras
 * ferramentas da Hope (mapa Omie, etiquetas, conciliação Shopee). A
 * conciliação lida com dado financeiro, então o acesso é POR MÓDULO desde já.
 */

export type ModuleId = 'expedicao' | 'clientes' | 'etiquetas' | 'conciliacao';

export type Role = 'admin' | 'lideranca' | 'leitura' | 'tv';

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrador',
  lideranca: 'Liderança',
  leitura: 'Leitura',
  tv: 'TV do galpão',
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  admin: 'Tudo, inclusive usuários, dispositivos e histórico.',
  lideranca: 'Acompanha a operação, ajusta metas, operadores e previsão.',
  leitura: 'Vê todas as telas e exporta, mas não altera nada.',
  tv: 'Só o Modo TV. Usado por dispositivos pareados, não por pessoas.',
};

export type Permission =
  | 'expedicao.ver'
  | 'expedicao.exportar'
  | 'expedicao.metas.editar'
  | 'expedicao.operadores.gerenciar'
  | 'expedicao.previsao.configurar'
  | 'auditoria.ver'
  | 'usuarios.gerenciar'
  | 'dispositivos.gerenciar'
  | 'notificacoes.configurar'
  | 'tv.ver';

export const ALL_PERMISSIONS: readonly Permission[] = [
  'expedicao.ver',
  'expedicao.exportar',
  'expedicao.metas.editar',
  'expedicao.operadores.gerenciar',
  'expedicao.previsao.configurar',
  'auditoria.ver',
  'usuarios.gerenciar',
  'dispositivos.gerenciar',
  'notificacoes.configurar',
  'tv.ver',
];

/** Matriz papel -> permissões. Única fonte de verdade no front (o banco repete via RLS). */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: ALL_PERMISSIONS,
  lideranca: [
    'expedicao.ver',
    'expedicao.exportar',
    'expedicao.metas.editar',
    'expedicao.operadores.gerenciar',
    'expedicao.previsao.configurar',
    'auditoria.ver',
    'notificacoes.configurar',
    'tv.ver',
  ],
  leitura: ['expedicao.ver', 'expedicao.exportar', 'notificacoes.configurar', 'tv.ver'],
  tv: ['tv.ver'],
};

export interface SessionUser {
  id: string;
  name: string;
  email: string | null;
  initials: string;
  role: Role;
  /** módulos que o usuário pode abrir */
  modules: ModuleId[];
  /** 'dispositivo' = TV pareada (sem pessoa por trás) */
  kind: 'pessoa' | 'dispositivo';
  mfa: { enrolled: boolean; required: boolean };
}

export type AuthStatus = 'loading' | 'signed-out' | 'mfa-required' | 'signed-in';

export type AuthResult = { ok: true } | { ok: false; error: string };

export interface AuthContextValue {
  status: AuthStatus;
  user: SessionUser | null;
  mode: 'demo' | 'supabase';
  signInWithPassword(email: string, password: string): Promise<AuthResult>;
  /** Só no modo demo: entra direto com um perfil de exemplo. */
  signInDemo(role: Role): Promise<AuthResult>;
  verifyMfa(code: string): Promise<AuthResult>;
  requestPasswordReset(email: string): Promise<AuthResult>;
  signOut(): Promise<void>;
}

/* ====================================================================
   ACRÉSCIMOS DO AGENTE DE SEGURANÇA (só campos e tipos novos; nada acima
   foi renomeado ou mudou de tipo). Ver docs/seguranca.md.
   ==================================================================== */

/**
 * Permissões que pertencem a um módulo: só valem se o usuário tiver acesso
 * ao módulo (SessionUser.modules). As que não aparecem aqui são da conta
 * (usuários, dispositivos, histórico, notificações). O banco repete esta
 * tabela em app.permissao_modulo().
 */
export const PERMISSION_MODULE: Partial<Record<Permission, ModuleId>> = {
  'expedicao.ver': 'expedicao',
  'expedicao.exportar': 'expedicao',
  'expedicao.metas.editar': 'expedicao',
  'expedicao.operadores.gerenciar': 'expedicao',
  'expedicao.previsao.configurar': 'expedicao',
  'tv.ver': 'expedicao',
};

/** Papéis que precisam de verificação em duas etapas (TOTP) para entrar. */
export const MFA_REQUIRED_ROLES: readonly Role[] = ['admin', 'lideranca'];

/** Em que passo da verificação em duas etapas a pessoa está. */
export type MfaStage = 'verify' | 'enroll';

/** Dados para cadastrar o aplicativo autenticador (QR code e chave manual). */
export interface MfaEnrollment {
  factorId: string;
  /** imagem do QR code (data URI SVG devolvido pelo Supabase) */
  qrCode: string;
  /** chave para digitar à mão, caso a câmera não leia o QR code */
  secret: string;
  /** otpauth:// completo */
  uri: string;
}

export type MfaEnrollResult = { ok: true; enrollment: MfaEnrollment } | { ok: false; error: string };

/**
 * Logado no Supabase, mas sem direito de abrir o painel. Nunca vira acesso
 * total: status fica 'signed-out', user fica null e can() devolve false.
 *   sem-perfil   conta existe no Auth mas não está em `membros`
 *   desativado   membro com status desativado
 *   sem-modulo   membro sem nenhum módulo liberado
 *   dispositivo  credencial de bancada/coletor tentando abrir o painel
 */
export type AccessDenialReason = 'sem-perfil' | 'desativado' | 'sem-modulo' | 'dispositivo';

export interface AccessDenial {
  reason: AccessDenialReason;
  email: string | null;
}

/** Aviso de encerramento por inatividade. */
export interface IdleState {
  warning: boolean;
  /** segundos até sair (só faz sentido com warning = true) */
  secondsLeft: number;
}

export type SignOutReason = 'manual' | 'inatividade' | 'outra-aba' | 'sessao-expirada' | 'todos-dispositivos';

/**
 * Campos opcionais do AuthContextValue (acrescentados sem quebrar o contrato).
 * A implementação real sempre preenche todos.
 */
export interface AuthContextExtras {
  /** com status 'mfa-required': verificar código ou cadastrar o autenticador */
  mfaStage?: MfaStage | null;
  /** começa o cadastro do autenticador; depois verifyMfa(código) conclui */
  enrollMfa?(): Promise<MfaEnrollResult>;
  /** troca a senha da sessão atual (fluxo de redefinição ou configurações) */
  updatePassword?(newPassword: string): Promise<AuthResult>;
  /** Aceitar o convite do e-mail (`/entrar/convite`). Só no login Supabase. */
  acceptInvite?(tokenHash: string): Promise<AuthResult>;
  /** encerra a sessão em todos os aparelhos da pessoa */
  signOutEverywhere?(): Promise<AuthResult>;
  /** motivo de uma conta logada não poder entrar */
  denied?: AccessDenial | null;
  /** aviso de inatividade (pessoas no computador compartilhado; dispositivo TV é isento) */
  idle?: IdleState;
  /** "continuar conectado" no aviso de inatividade */
  stayActive?(): void;
  /** por que a última sessão terminou (para a tela de login explicar) */
  lastSignOutReason?: SignOutReason | null;
  /** chegou pelo link de redefinição de senha */
  isRecovery?: boolean;
  /** este navegador foi marcado como computador compartilhado no login (12 h e 30 min sem uso) */
  sharedComputer?: boolean;
  /** marca ou desmarca o computador compartilhado (tela de login) */
  setSharedComputer?(shared: boolean): void;
}

/**
 * Mescla com a declaração acima (declaration merging): acrescenta os extras e
 * o token do CAPTCHA (Turnstile) como parâmetro opcional. Quem chama com dois
 * argumentos continua funcionando.
 */
export interface AuthContextValue extends AuthContextExtras {
  signInWithPassword(email: string, password: string, captchaToken?: string): Promise<AuthResult>;
  requestPasswordReset(email: string, captchaToken?: string): Promise<AuthResult>;
}

/** Campo opcional acrescentado ao SessionUser (declaration merging). */
export interface SessionUser {
  /**
   * Papel por módulo, quando difere do papel geral (ex.: liderança na
   * Expedição e leitura na Conciliação). Ausente = o papel geral vale em
   * todos os módulos de `modules`.
   */
  moduleRoles?: Partial<Record<ModuleId, Role>>;
}
