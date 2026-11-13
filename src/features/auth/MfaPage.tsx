/**
 * Verificação em duas etapas (/entrar/verificacao).
 *   verify  pede o código do aplicativo autenticador
 *   enroll  o papel exige (admin, liderança) e ainda não há autenticador
 * Sem verificação pendente, a tela não tem o que fazer e redireciona.
 */
import { LogOut } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { useAuth } from '@/auth';
import { AuthLayout } from '@/auth/layout';
import { LOGIN_PATH, safeRedirectPath } from '@/auth/redirect';
import { ROLE_LABEL } from '@/auth/types';
import { Button } from '@/components/ui';
import { CodeInput } from './CodeInput';
import { isCodeComplete } from './code-input';
import { MfaEnroll } from './MfaEnroll';

export default function MfaPage() {
  const { status, mfaStage, user, signOut } = useAuth();
  const [params] = useSearchParams();
  const target = safeRedirectPath(params.get('para'));

  if (status === 'loading') return null;
  if (status === 'signed-in') return <Navigate to={target} replace />;
  if (status !== 'mfa-required' || !user) return <Navigate to={LOGIN_PATH} replace />;

  const leave = (
    <Button variant="ghost" icon={<LogOut />} onClick={() => void signOut()}>
      Sair e entrar com outra conta
    </Button>
  );

  if (mfaStage === 'enroll') {
    return (
      <AuthLayout
        width="md"
        title="Cadastre a verificação em duas etapas"
        subtitle={`O perfil ${ROLE_LABEL[user.role]} exige um código do celular além da senha. Leva um minuto e só é feito uma vez.`}
        footer={leave}
      >
        <MfaEnroll />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Verificação em duas etapas" subtitle="Abra o aplicativo autenticador e digite o código de 6 números." footer={leave}>
      <VerifyForm />
    </AuthLayout>
  );
}

function VerifyForm() {
  const { verifyMfa } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const errorId = useId();

  async function send(value: string) {
    if (busy) return;
    if (!isCodeComplete(value.split(''))) {
      setError('Digite os 6 números do aplicativo autenticador.');
      return;
    }
    setBusy(true);
    setError(null);
    const r = await verifyMfa(value);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      setCode('');
      setResetKey((k) => k + 1);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void send(code);
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <div className="grid gap-1.5">
        <CodeInput
          key={resetKey}
          autoFocus
          onChange={setCode}
          onComplete={(c) => void send(c)}
          invalid={Boolean(error)}
          describedBy={error ? errorId : undefined}
          disabled={busy}
        />
        {error ? (
          <p id={errorId} role="alert" className="text-xs text-crit">
            {error}
          </p>
        ) : null}
      </div>
      <Button type="submit" variant="primary" size="lg" loading={busy}>
        Verificar
      </Button>
      <p className="text-xs text-ink-3">
        Perdeu o celular? Peça a um administrador para remover o autenticador da sua conta. Depois você cadastra outro.
      </p>
    </form>
  );
}
