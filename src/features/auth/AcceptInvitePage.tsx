/**
 * Aceitar convite (/entrar/convite?token_hash=...&type=invite). O link vem do e-mail de convite
 * (modelo "Invite user" do Supabase, ver docs/seguranca.md §7.1). Troca o código de uso único por
 * sessão e manda para a senha nova, que é o primeiro passo de quem acabou de ser convidado.
 */
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '@/auth';
import { AuthLayout } from '@/auth/layout';
import { MSG } from '@/auth/messages';
import { RESET_PATH } from '@/auth/redirect';
import { Notice } from '@/components/ui';

const backLink = (
  <Link to="/entrar" className="inline-flex items-center gap-1.5 text-accent underline underline-offset-2 focus-visible:shadow-focus">
    <ArrowLeft className="size-4" aria-hidden="true" />
    Ir para entrar
  </Link>
);

export default function AcceptInvitePage() {
  const { mode, acceptInvite } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  // O código vale uma vez só: o StrictMode monta o efeito duas vezes em desenvolvimento.
  const started = useRef(false);

  const tokenHash = params.get('token_hash') ?? '';
  const type = params.get('type') ?? 'invite';
  const invalidLink = !tokenHash || type !== 'invite';

  useEffect(() => {
    if (started.current || mode !== 'supabase' || !acceptInvite || invalidLink) return;
    started.current = true;
    void acceptInvite(tokenHash).then((r) => {
      if (r.ok) navigate(RESET_PATH, { replace: true });
      else setError(r.error);
    });
  }, [mode, acceptInvite, tokenHash, invalidLink, navigate]);

  const shownError = invalidLink ? MSG.inviteInvalid : error;

  if (mode !== 'supabase') {
    return (
      <AuthLayout title="Aceitar convite" footer={backLink}>
        <Notice>No modo de demonstração não há convite. Volte e escolha um perfil para entrar.</Notice>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Aceitar convite" footer={shownError ? backLink : undefined}>
      {shownError ? (
        <Notice tone="warn">{shownError}</Notice>
      ) : (
        <p className="flex items-center gap-2 text-ink-2" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Conferindo o convite...
        </p>
      )}
    </AuthLayout>
  );
}
