/**
 * Entrar (/entrar).
 *   supabase  e-mail e senha (+ Turnstile se configurado). Erro sempre genérico.
 *   demo      cartões de perfil, sem senha, com faixa de demonstração.
 * Depois de entrar, volta para ?para= (só caminho interno: safeRedirectPath).
 */
import { ArrowRight, Eye, Monitor, ShieldCheck, UserCog } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '@/auth';
import { DEMO_PROFILES } from '@/auth/demo';
import { AuthLayout } from '@/auth/layout';
import { DENIAL_MESSAGE } from '@/auth/messages';
import { MFA_PATH, safeRedirectPath } from '@/auth/redirect';
import type { Role, SignOutReason } from '@/auth/types';
import { Button, Field, Input, Notice } from '@/components/ui';
import { env } from '@/lib/env';
import { PasswordInput, SharedComputerField } from './parts';
import { Turnstile } from './Turnstile';

const REASON_TEXT: Partial<Record<SignOutReason, { tone: 'info' | 'warn'; text: string }>> = {
  inatividade: { tone: 'warn', text: 'Neste computador compartilhado, a sessão termina depois de 30 minutos sem uso. Entre de novo para continuar.' },
  'outra-aba': { tone: 'info', text: 'Você saiu do painel em outra aba deste navegador.' },
  'sessao-expirada': {
    tone: 'warn',
    text: 'Sua sessão passou do tempo máximo (15 dias, ou 12 horas em computador compartilhado). Entre de novo para continuar.',
  },
  'todos-dispositivos': { tone: 'info', text: 'Você encerrou a sessão em todos os aparelhos.' },
};

const ROLE_ICON: Record<Role, typeof UserCog> = {
  admin: UserCog,
  lideranca: ShieldCheck,
  leitura: Eye,
  tv: Monitor,
};

export function DemoBanner() {
  // Login demo + dados reais é a combinação de conferência local: o aviso não pode dizer "exemplo".
  if (env.dataSource === 'supabase') {
    return (
      <div role="note" className="border-b border-warn/30 bg-warn-soft px-4 py-2 text-center text-sm text-ink">
        <span className="font-medium">Login de demonstração, sem senha.</span> Os dados são{' '}
        <strong className="font-semibold">reais</strong>, em modo somente leitura.
      </div>
    );
  }
  return (
    <div role="note" className="border-b border-line bg-accent-soft px-4 py-2 text-center text-sm text-ink">
      <span className="font-medium">Modo de demonstração.</span> Os dados são de exemplo e nenhuma senha é pedida.
    </div>
  );
}

export default function LoginPage() {
  const { status, mode, lastSignOutReason, denied, signOut } = useAuth();
  const [params] = useSearchParams();
  const rawPara = params.get('para');
  const target = safeRedirectPath(rawPara);

  if (status === 'signed-in') return <Navigate to={target} replace />;
  if (status === 'mfa-required') {
    return <Navigate to={rawPara ? `${MFA_PATH}?para=${encodeURIComponent(target)}` : MFA_PATH} replace />;
  }

  const reason = lastSignOutReason ? REASON_TEXT[lastSignOutReason] : undefined;
  const notices = (
    <>
      {denied ? (
        <Notice
          tone="crit"
          title={DENIAL_MESSAGE[denied.reason].title}
          action={
            <Button size="sm" onClick={() => void signOut()}>
              Sair
            </Button>
          }
        >
          {DENIAL_MESSAGE[denied.reason].body}
        </Notice>
      ) : null}
      {reason && !denied ? <Notice tone={reason.tone}>{reason.text}</Notice> : null}
    </>
  );

  if (mode === 'demo') return <DemoLogin target={target} notices={notices} />;
  return <PasswordLogin notices={notices} />;
}

function DemoLogin({ target, notices }: { target: string; notices: React.ReactNode }) {
  const { signInDemo } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<Role | null>(null);

  async function enter(role: Role) {
    setBusy(role);
    const r = await signInDemo(role);
    setBusy(null);
    if (!r.ok) return;
    // A TV vai sempre para o Modo TV; as pessoas voltam para onde estavam.
    navigate(role === 'tv' ? '/tv' : target, { replace: true });
  }

  return (
    <AuthLayout
      title="Entrar no painel"
      subtitle="Escolha um perfil para ver o painel com as permissões dele."
      banner={<DemoBanner />}
      width="md"
    >
      {notices}
      <ul className="grid gap-2 sm:grid-cols-2" aria-label="Perfis de demonstração">
        {DEMO_PROFILES.map((p) => {
          const Icon = ROLE_ICON[p.role];
          return (
            <li key={p.role}>
              <button
                type="button"
                onClick={() => void enter(p.role)}
                disabled={busy !== null}
                aria-busy={busy === p.role || undefined}
                className="group grid h-full w-full grid-cols-[auto_1fr_auto] items-start gap-3 rounded-md border border-line-strong bg-surface p-3 text-left transition-colors hover:bg-hover focus-visible:shadow-focus focus-visible:outline-none disabled:opacity-60"
              >
                <span className="grid size-8 place-items-center rounded-md bg-sunk text-ink-2">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="grid gap-0.5">
                  <span className="font-medium text-ink">{p.label}</span>
                  <span className="text-xs text-ink-3">{p.role === 'tv' ? 'Dispositivo pareado' : p.name}</span>
                  <span className="text-ink-2">{p.description}</span>
                </span>
                <ArrowRight className="mt-1 size-4 text-ink-3 group-hover:text-ink" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </AuthLayout>
  );
}

function PasswordLogin({ notices }: { notices: React.ReactNode }) {
  const { signInWithPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const errorId = useId();
  const siteKey = env.turnstileSiteKey ?? null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Preencha o e-mail e a senha.');
      return;
    }
    if (siteKey && !captcha) {
      setError('Conclua a verificação anti-robô abaixo dos campos.');
      return;
    }
    setBusy(true);
    setError(null);
    const r = await signInWithPassword(email, password, captcha ?? undefined);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      setPassword('');
      // o token do Turnstile vale uma vez: pede outro
      setCaptcha(null);
      setCaptchaKey((k) => k + 1);
    }
    // sucesso: o status muda e esta tela redireciona sozinha
  }

  return (
    <AuthLayout title="Entrar no painel" subtitle="Hope, operações">
      {notices}
      <form onSubmit={submit} className="grid gap-4" noValidate aria-describedby={error ? errorId : undefined}>
        {error ? (
          <div id={errorId}>
            <Notice tone="crit">{error}</Notice>
          </div>
        ) : null}
        <Field label="E-mail">
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
        <Field label="Senha">
          <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <SharedComputerField />
        {siteKey ? <Turnstile key={captchaKey} siteKey={siteKey} onToken={setCaptcha} /> : null}
        <Button type="submit" variant="primary" size="lg" loading={busy}>
          Entrar
        </Button>
        <Link to="/entrar/recuperar" className="justify-self-start text-accent underline underline-offset-2 focus-visible:shadow-focus">
          Esqueci a senha
        </Link>
      </form>
    </AuthLayout>
  );
}
