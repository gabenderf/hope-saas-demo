/**
 * Recuperar senha (/entrar/recuperar). A resposta é a mesma para e-mail
 * cadastrado ou não: a tela nunca confirma se uma conta existe.
 */
import { ArrowLeft, MailCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/auth';
import { AuthLayout } from '@/auth/layout';
import { MSG } from '@/auth/messages';
import { Button, Field, Input, Notice } from '@/components/ui';
import { env } from '@/lib/env';
import { DemoBanner } from './LoginPage';
import { Turnstile } from './Turnstile';

const backLink = (
  <Link to="/entrar" className="inline-flex items-center gap-1.5 text-accent underline underline-offset-2 focus-visible:shadow-focus">
    <ArrowLeft className="size-4" aria-hidden="true" />
    Voltar para entrar
  </Link>
);

export default function ForgotPasswordPage() {
  const { mode, requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const siteKey = env.turnstileSiteKey ?? null;

  if (mode === 'demo') {
    return (
      <AuthLayout title="Recuperar senha" banner={<DemoBanner />} footer={backLink}>
        <Notice>No modo de demonstração não há senha. Volte e escolha um perfil para entrar.</Notice>
      </AuthLayout>
    );
  }

  if (sent) {
    return (
      <AuthLayout title="Confira o seu e-mail" footer={backLink}>
        <Notice tone="ok" title="Pedido recebido">
          {MSG.resetSent} O link vale por 1 hora e só funciona neste navegador.
        </Notice>
        <p className="flex items-start gap-2 text-ink-2">
          <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Não chegou em alguns minutos? Olhe a caixa de spam ou peça a um administrador para conferir o seu e-mail.
        </p>
      </AuthLayout>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Digite um e-mail válido.');
      return;
    }
    if (siteKey && !captcha) {
      setError('Conclua a verificação anti-robô.');
      return;
    }
    setBusy(true);
    setError(null);
    const r = await requestPasswordReset(email, captcha ?? undefined);
    setBusy(false);
    if (r.ok) {
      setSent(true);
      return;
    }
    setError(r.error);
    setCaptcha(null);
    setCaptchaKey((k) => k + 1);
  }

  return (
    <AuthLayout
      title="Recuperar senha"
      subtitle="Informe o e-mail da sua conta. Se ele estiver cadastrado, enviamos um link para criar uma senha nova."
      footer={backLink}
    >
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Field label="E-mail" error={error ?? undefined}>
          <Input
            type="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </Field>
        {siteKey ? <Turnstile key={captchaKey} siteKey={siteKey} onToken={setCaptcha} /> : null}
        <Button type="submit" variant="primary" size="lg" loading={busy}>
          Enviar link
        </Button>
      </form>
    </AuthLayout>
  );
}
