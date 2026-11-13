/**
 * Nova senha (/entrar/redefinir). Chega aqui pelo link do e-mail (PKCE: o
 * supabase-js troca o código da URL por uma sessão de recuperação). Quem
 * tem verificação em duas etapas passa por ela antes (status mfa-required),
 * e volta para cá.
 */
import { useId, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useAuth } from '@/auth';
import { AuthLayout } from '@/auth/layout';
import { passwordChecks } from '@/auth/messages';
import { DEFAULT_AFTER_LOGIN, MFA_PATH, RESET_PATH } from '@/auth/redirect';
import { Button, Field, Notice, toast } from '@/components/ui';
import { DemoBanner } from './LoginPage';
import { PasswordInput, PasswordRules, SharedComputerField } from './parts';

export default function ResetPasswordPage() {
  const { mode, status, isRecovery } = useAuth();

  if (mode === 'demo') {
    return (
      <AuthLayout title="Nova senha" banner={<DemoBanner />} footer={<BackToLogin />}>
        <Notice>No modo de demonstração não há senha.</Notice>
      </AuthLayout>
    );
  }
  if (status === 'loading') return null;
  if (status === 'mfa-required') return <Navigate to={`${MFA_PATH}?para=${encodeURIComponent(RESET_PATH)}`} replace />;
  if (status !== 'signed-in') {
    return (
      <AuthLayout title="Link inválido ou expirado" footer={<BackToLogin />}>
        <Notice tone="warn">
          O link de redefinição vale uma vez, por 1 hora, e só no navegador em que foi pedido. Peça um novo.
        </Notice>
        <Button asChild variant="primary" size="lg">
          <Link to="/entrar/recuperar">Pedir novo link</Link>
        </Button>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout
      title="Crie uma senha nova"
      subtitle={isRecovery ? 'Depois de salvar, você continua conectado.' : 'Troque a senha da sua conta.'}
      footer={<BackToLogin />}
    >
      <NewPasswordForm />
    </AuthLayout>
  );
}

function BackToLogin() {
  return (
    <Link to="/entrar" className="text-accent underline underline-offset-2 focus-visible:shadow-focus">
      Voltar para entrar
    </Link>
  );
}

/** Formulário de senha nova. Também usado em Configurações > Segurança. */
export function NewPasswordForm({ onDone }: { onDone?: () => void }) {
  const { updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rulesId = useId();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!passwordChecks(password, confirmation).every((c) => c.ok)) {
      setError('A senha ainda não cumpre todas as regras da lista.');
      return;
    }
    if (!updatePassword) return;
    setBusy(true);
    setError(null);
    const r = await updatePassword(password);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    toast.success('Senha alterada');
    if (onDone) onDone();
    else navigate(DEFAULT_AFTER_LOGIN, { replace: true });
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      {error ? <Notice tone="crit">{error}</Notice> : null}
      <Field label="Senha nova">
        <PasswordInput autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
      </Field>
      <Field label="Repita a senha nova">
        <PasswordInput autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
      </Field>
      <PasswordRules id={rulesId} password={password} confirmation={confirmation} />
      <p className="text-xs text-ink-3">Senhas que já apareceram em vazamentos conhecidos são recusadas.</p>
      {/* convite e redefinição terminam com a pessoa dentro do painel; Configurações não */}
      {onDone ? null : <SharedComputerField />}
      <Button type="submit" variant="primary" size="lg" loading={busy}>
        Salvar senha
      </Button>
    </form>
  );
}
