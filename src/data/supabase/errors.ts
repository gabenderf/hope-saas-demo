/**
 * Erros da fonte Supabase. A mensagem é para a tela (português, sem detalhe
 * técnico); o erro original vai para o console.error e fica em `cause`.
 */

/**
 * Gravação sem permissão de gravar: preview de dados reais (login de demonstração
 * sobre o banco de produção) ou cliente sem sessão. A UI já desliga os controles
 * por `capabilities.write`; isto é a segunda trava, dentro da fonte.
 */
export class ReadOnlyError extends Error {
  readonly code = 'somente-leitura';
  constructor() {
    super('Modo somente leitura: com os dados reais, este painel ainda não grava alterações. Use o painel antigo para alterar.');
    this.name = 'ReadOnlyError';
  }
}

export class DataLoadError extends Error {
  readonly code = 'falha-de-carga';
  constructor(cause?: unknown) {
    super('Não foi possível carregar os dados do banco. Verifique a conexão e tente de novo.', { cause });
    this.name = 'DataLoadError';
  }
}

/** Registra o detalhe técnico e devolve o erro com mensagem amigável. */
export function friendly(context: string, error: unknown): DataLoadError {
  if (error instanceof DataLoadError) return error;
  console.error(`[dados supabase] ${context}`, error);
  return new DataLoadError(error);
}

/** Gravação recusada ou inválida. A mensagem já é para a tela. */
export class WriteError extends Error {
  readonly code: 'sem-permissao' | 'fora-do-intervalo';
  constructor(message: string, code: 'sem-permissao' | 'fora-do-intervalo', cause?: unknown) {
    super(message, { cause });
    this.name = 'WriteError';
    this.code = code;
  }
}

export const ACCESS_DENIED_MESSAGE =
  'Seu acesso não permite esta alteração. Se o seu perfil exige verificação em duas etapas, entre de novo.';
export const OUT_OF_RANGE_MESSAGE = 'Valor fora do intervalo permitido.';

/** Erro do PostgREST (objeto simples com `code`/`message`, não é instância de Error). */
function postgrestInfo(error: unknown): { code: string; message: string } | null {
  if (!error || typeof error !== 'object') return null;
  const e = error as { code?: unknown; message?: unknown };
  return {
    code: typeof e.code === 'string' ? e.code : '',
    message: typeof e.message === 'string' ? e.message : '',
  };
}

/** Erro de gravação do banco traduzido para a tela; o detalhe técnico vai ao console. */
export function friendlyWrite(context: string, error: unknown): Error {
  if (error instanceof ReadOnlyError || error instanceof WriteError || error instanceof DataLoadError) return error;
  console.error(`[dados supabase] ${context}`, error);
  const info = postgrestInfo(error);
  if (info?.code === '42501' || /row-level security/i.test(info?.message ?? '')) {
    return new WriteError(ACCESS_DENIED_MESSAGE, 'sem-permissao', error);
  }
  if (info?.code === '23514') return new WriteError(OUT_OF_RANGE_MESSAGE, 'fora-do-intervalo', error);
  return new DataLoadError(error);
}

/** Update que não afetou linha: é assim que o RLS barra um update (sem erro, sem linha). */
export function accessDenied(): WriteError {
  return new WriteError(ACCESS_DENIED_MESSAGE, 'sem-permissao');
}
