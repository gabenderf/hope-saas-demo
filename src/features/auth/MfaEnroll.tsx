/**
 * Cadastro do aplicativo autenticador (TOTP): passo a passo, QR code, chave
 * manual e o primeiro código. Usado no login (papel que exige MFA e ainda
 * não tem) e em Configurações > Segurança (cadastrar ou trocar).
 *
 * O QR code chega como data URI de SVG e vai num <img>: nunca é HTML
 * injetado na página.
 */
import { Copy, RefreshCw } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '@/auth';
import type { MfaEnrollment } from '@/auth/types';
import { Button, Notice, Skeleton, toast } from '@/components/ui';
import { CodeInput } from './CodeInput';
import { isCodeComplete } from './code-input';

/** Aceita só a imagem do QR code em data URI (formato que o Supabase devolve). */
function safeQrSrc(src: string): string | null {
  return /^data:image\/(svg\+xml|png)[;,]/.test(src) ? src : null;
}

function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim();
}

export function MfaEnroll({ onDone, submitLabel = 'Confirmar e entrar' }: { onDone?: () => void; submitLabel?: string }) {
  const { enrollMfa, verifyMfa } = useAuth();
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const started = useRef<number | null>(null);
  const errorId = useId();

  useEffect(() => {
    // Uma chamada por tentativa (o StrictMode roda o efeito duas vezes em desenvolvimento).
    if (started.current === attempt || !enrollMfa) return;
    started.current = attempt;
    let alive = true;
    void enrollMfa().then((r) => {
      if (!alive) return;
      if (r.ok) setEnrollment(r.enrollment);
      else setLoadError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [attempt, enrollMfa]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!isCodeComplete(code.split(''))) {
      setError('Digite os 6 números do aplicativo autenticador.');
      return;
    }
    setBusy(true);
    setError(null);
    const r = await verifyMfa(code);
    setBusy(false);
    if (r.ok) onDone?.();
    else setError(r.error);
  }

  function restart() {
    setEnrollment(null);
    setLoadError(null);
    setError(null);
    setAttempt((a) => a + 1);
  }

  if (loadError) {
    return (
      <Notice
        tone="crit"
        title="Não foi possível começar o cadastro"
        action={
          <Button size="sm" icon={<RefreshCw />} onClick={restart}>
            Tentar de novo
          </Button>
        }
      >
        {loadError}
      </Notice>
    );
  }

  const qr = enrollment ? safeQrSrc(enrollment.qrCode) : null;

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <ol className="grid list-decimal gap-1.5 pl-5 text-ink-2">
        <li>Instale um aplicativo autenticador no celular (Google Authenticator, Microsoft Authenticator ou 1Password).</li>
        <li>No aplicativo, toque em adicionar conta e leia o QR code abaixo.</li>
        <li>Digite o código de 6 números que o aplicativo mostrar.</li>
      </ol>

      <div className="grid items-start gap-4 sm:grid-cols-[176px_1fr]">
        <div className="grid size-44 place-items-center rounded-md border border-line bg-[#ffffff] p-2">
          {qr ? (
            <img src={qr} alt="QR code para cadastrar o autenticador" className="size-40" />
          ) : (
            <Skeleton className="size-40" />
          )}
        </div>
        <div className="grid min-w-0 gap-1.5">
          <p className="text-xs font-medium">A câmera não leu? Digite esta chave no aplicativo:</p>
          {enrollment ? (
            <div className="flex items-center gap-2">
              <code className="min-w-0 break-all rounded-sm bg-sunk px-2 py-1 font-mono text-sm">{groupSecret(enrollment.secret)}</code>
              <Button
                size="sm"
                icon={<Copy />}
                onClick={() =>
                  void navigator.clipboard
                    ?.writeText(enrollment.secret)
                    .then(() => toast.success('Chave copiada'))
                    .catch(() => toast.error('Não foi possível copiar. Selecione e copie à mão.'))
                }
              >
                Copiar
              </Button>
            </div>
          ) : (
            <Skeleton className="h-7 w-56" />
          )}
          <p className="text-xs text-ink-3">Tipo: baseado em tempo (TOTP), 6 dígitos, 30 segundos.</p>
        </div>
      </div>

      <div className="grid gap-1.5">
        <p className="text-xs font-medium">Código do aplicativo</p>
        <CodeInput onChange={setCode} onComplete={() => undefined} invalid={Boolean(error)} describedBy={error ? errorId : undefined} disabled={!enrollment} />
        {error ? (
          <p id={errorId} role="alert" className="text-xs text-crit">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!enrollment}>
          {submitLabel}
        </Button>
        <Button variant="ghost" size="lg" icon={<RefreshCw />} onClick={restart} disabled={busy}>
          Gerar outro QR code
        </Button>
      </div>
    </form>
  );
}
