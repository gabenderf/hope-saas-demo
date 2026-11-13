/**
 * Mensagens de erro do login. São genéricas DE PROPÓSITO: nenhuma delas
 * diz se o e-mail existe, se a conta está bloqueada ou se só a senha está
 * errada. Quem tenta adivinhar contas recebe sempre a mesma frase.
 */
import type { AccessDenialReason } from './types';

export const MSG = {
  credentials: 'E-mail ou senha incorretos.',
  rateLimited: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
  captcha: 'Não foi possível confirmar que você não é um robô. Tente de novo.',
  network: 'Sem conexão com o servidor. Confira a internet e tente de novo.',
  generic: 'Não foi possível concluir agora. Tente de novo em instantes.',
  mfaCode: 'Código incorreto ou expirado. Confira o horário do celular e tente de novo.',
  mfaFormat: 'Digite os 6 números do aplicativo autenticador.',
  mfaRestart: 'O cadastro do autenticador expirou. Comece de novo.',
  resetSent: 'Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha.',
  demoOnly: 'No modo de demonstração, escolha um perfil para entrar.',
  supabaseOnly: 'Disponível só com o login real.',
  samePassword: 'A nova senha precisa ser diferente da atual.',
  weakPassword: 'Essa senha é fraca ou já apareceu em vazamentos conhecidos. Escolha outra.',
  reauth: 'Por segurança, entre de novo antes de trocar a senha.',
  inviteInvalid: 'Este convite não vale mais: ele já foi usado ou expirou. Peça um convite novo a um administrador.',
  signOutEverywhere: 'Não foi possível encerrar as outras sessões agora. Esta sessão foi encerrada.',
} as const;

export const DENIAL_MESSAGE: Record<AccessDenialReason, { title: string; body: string }> = {
  'sem-perfil': {
    title: 'Sua conta ainda não tem acesso ao painel',
    body: 'O login funcionou, mas nenhum perfil foi liberado para esta conta. Peça a um administrador para liberar o seu acesso.',
  },
  desativado: {
    title: 'Acesso desativado',
    body: 'Esta conta foi desativada. Se isso não era esperado, fale com um administrador.',
  },
  'sem-modulo': {
    title: 'Nenhum módulo liberado',
    body: 'Sua conta existe, mas não tem nenhum módulo liberado. Peça a um administrador para liberar a Expedição.',
  },
  dispositivo: {
    title: 'Credencial de máquina',
    body: 'Esta credencial é de uma bancada ou do coletor de dados e não abre o painel.',
  },
};

export const PASSWORD_MIN_LENGTH = 12;
/** bcrypt ignora o que passa de 72 bytes */
export const PASSWORD_MAX_LENGTH = 72;

/** Validação local da senha nova. O Supabase repete (tamanho e lista de senhas vazadas). */
export function validateNewPassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_LENGTH) return `Use no máximo ${PASSWORD_MAX_LENGTH} caracteres.`;
  if (/^(.)\1+$/.test(password)) return 'A senha não pode ser um caractere repetido.';
  return null;
}

export interface AuthErrorLike {
  status?: number;
  code?: string;
  name?: string;
}

/** Traduz erro do Supabase Auth para uma das mensagens genéricas acima. */
export function loginErrorMessage(error: AuthErrorLike | null | undefined): string {
  if (!error) return MSG.generic;
  const code = error.code ?? '';
  if (error.status === 429 || code.startsWith('over_')) return MSG.rateLimited;
  if (code === 'captcha_failed') return MSG.captcha;
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return MSG.network;
  // credencial errada, e-mail não confirmado, conta banida: a mesma frase
  return MSG.credentials;
}

export function mfaErrorMessage(error: AuthErrorLike | null | undefined): string {
  if (!error) return MSG.generic;
  if (error.status === 429 || (error.code ?? '').startsWith('over_')) return MSG.rateLimited;
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return MSG.network;
  return MSG.mfaCode;
}

export interface PasswordCheck {
  id: 'tamanho' | 'maximo' | 'variedade' | 'confirmacao';
  label: string;
  ok: boolean;
}

/**
 * Regras da senha nova, para mostrar enquanto a pessoa digita. Mesmas regras
 * de validateNewPassword, mais a confirmação. O Supabase ainda confere a lista
 * de senhas vazadas no servidor.
 */
export function passwordChecks(password: string, confirmation: string): PasswordCheck[] {
  return [
    { id: 'tamanho', label: `Pelo menos ${PASSWORD_MIN_LENGTH} caracteres`, ok: password.length >= PASSWORD_MIN_LENGTH },
    {
      id: 'maximo',
      label: `No máximo ${PASSWORD_MAX_LENGTH} caracteres`,
      ok: new TextEncoder().encode(password).length <= PASSWORD_MAX_LENGTH,
    },
    { id: 'variedade', label: 'Não é um caractere repetido', ok: password.length > 0 && !/^(.)\1+$/.test(password) },
    { id: 'confirmacao', label: 'As duas senhas são iguais', ok: password.length > 0 && password === confirmation },
  ];
}
