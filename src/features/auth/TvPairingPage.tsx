/**
 * Parear TV (/tv/parear, pública). A TV mostra um código grande; um admin
 * digita em Configurações > Dispositivos no computador; a TV entra sozinha
 * no Modo TV com credencial própria (só leitura, revogável, com validade).
 *
 * Fluxo completo e regras em docs/seguranca.md, seção 8.
 */
import { LogIn, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { useAuth } from '@/auth';
import { Logo } from '@/components/brand/Logo';
import { Button, Notice, Skeleton } from '@/components/ui';
import {
  clearDemoPairing,
  DEMO_PAIRING_KEY,
  devicesApi,
  DevicesUnavailableError,
  registerDemoTv,
  type PairingTicket,
} from './data/devices';
import { formatCountdown, formatPairingCode } from './data/pairing';

export default function TvPairingPage() {
  const { status } = useAuth();
  if (status === 'signed-in') return <Navigate to="/tv" replace />;
  if (status === 'loading') return null;
  return <PairingScreen />;
}

function PairingScreen() {
  const { mode, signInDemo } = useAuth();
  const api = useMemo(() => devicesApi(mode), [mode]);
  const [ticket, setTicket] = useState<PairingTicket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [entering, setEntering] = useState(false);

  /* pede um código (de novo a cada geração) */
  useEffect(() => {
    let alive = true;
    api
      .startPairing()
      .then((t) => {
        if (!alive) return;
        setTicket(t);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof DevicesUnavailableError ? e.message : 'Não foi possível gerar o código. Confira a internet.');
      });
    return () => {
      alive = false;
    };
  }, [api, generation]);

  /* relógio da contagem */
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  /* espera a aprovação; código vencido gera outro sozinho */
  useEffect(() => {
    if (!ticket) return;
    let alive = true;
    const restart = () => {
      setTicket(null);
      setGeneration((g) => g + 1);
    };
    const check = async () => {
      if (!alive) return;
      if (Date.now() >= ticket.expiresAt) return restart();
      try {
        const r = await api.pollPairing(ticket);
        if (!alive) return;
        if (r.status === 'expirado') restart();
        else if (r.status === 'aprovado') {
          setEntering(true);
          // No modo real a sessão já foi criada pelo token de uso único; no demo, entra como TV.
          if (mode === 'demo') {
            clearDemoPairing();
            await signInDemo('tv');
          }
        }
      } catch {
        /* rede oscilou: tenta na próxima volta */
      }
    };
    const id = setInterval(() => void check(), mode === 'demo' ? 2000 : 5000);
    // No demo, a aprovação feita em outra aba chega na hora pelo evento de storage.
    const onStorage = (e: StorageEvent) => {
      if (e.key === DEMO_PAIRING_KEY) void check();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener('storage', onStorage);
    };
  }, [ticket, api, mode, signInDemo]);

  async function simulate() {
    setEntering(true);
    registerDemoTv('Demonstração');
    clearDemoPairing();
    await signInDemo('tv');
  }

  const remaining = ticket ? ticket.expiresAt - now : 0;

  return (
    <main className="grid min-h-dvh grid-rows-[auto_1fr_auto] gap-6 bg-bg px-6 py-8 text-ink sm:px-12">
      <Logo className="w-36" />

      <section aria-labelledby="tv-pair-title" className="grid content-center justify-items-center gap-6 text-center">
        <h1 id="tv-pair-title" className="text-2xl">
          Parear esta TV
        </h1>
        <p className="max-w-[40ch] text-xl text-ink-2">
          Abra <span className="font-medium text-ink">Configurações &gt; Dispositivos</span> no computador e digite este código.
        </p>

        {error ? (
          <div className="grid w-full max-w-xl gap-3 text-left">
            <Notice
              tone="warn"
              title="Pareamento indisponível"
              action={
                <Button icon={<RefreshCw />} onClick={() => setGeneration((g) => g + 1)}>
                  Tentar de novo
                </Button>
              }
            >
              {error}
            </Notice>
          </div>
        ) : ticket ? (
          <>
            <p
              className="select-all font-mono text-[clamp(3.5rem,13vw,9rem)] font-semibold leading-none tracking-[0.08em] tabular"
              aria-label={`Código ${ticket.code.split('').join(' ')}`}
            >
              {formatPairingCode(ticket.code)}
            </p>
            <p className="text-lg text-ink-2" aria-live="polite">
              {entering ? (
                'Aprovado. Abrindo o Modo TV...'
              ) : (
                <>
                  Aguardando aprovação. Vale por mais <span className="tabular font-medium text-ink">{formatCountdown(remaining)}</span>.
                </>
              )}
            </p>
          </>
        ) : (
          <Skeleton className="h-[clamp(3.5rem,13vw,9rem)] w-[min(90vw,44rem)]" />
        )}

        {mode === 'demo' && !error ? (
          <Button variant="primary" size="lg" onClick={() => void simulate()} loading={entering}>
            Simular aprovação (demonstração)
          </Button>
        ) : null}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 text-ink-3">
        <p>O código troca sozinho quando vence. A TV só lê o painel: não altera nada.</p>
        <Link
          to="/entrar?para=%2Ftv"
          className="inline-flex items-center gap-1.5 text-accent underline underline-offset-2 focus-visible:shadow-focus"
        >
          <LogIn className="size-4" aria-hidden="true" />
          Entrar com e-mail
        </Link>
      </footer>
    </main>
  );
}
