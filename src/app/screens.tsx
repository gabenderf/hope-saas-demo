/** Telas de partida e de erro fatal: sem dependência de provider nenhum. */
import { Logo } from '@/components/brand/Logo';

export function BootScreen() {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg" aria-busy="true" aria-label="Carregando">
      <div className="grid justify-items-center gap-4">
        <Logo className="w-32" />
        <span className="skeleton block h-1.5 w-40" />
      </div>
    </div>
  );
}

export function FatalScreen({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg p-6">
      <div className="grid max-w-md justify-items-start gap-3 rounded-lg border border-line bg-surface p-6">
        <Logo className="w-28" />
        <h1 className="text-lg">{title}</h1>
        {detail ? <p className="text-ink-2">{detail}</p> : null}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-2 h-[30px] rounded-md border border-line-strong bg-surface px-3 font-medium hover:bg-hover"
        >
          Tentar de novo
        </button>
      </div>
    </div>
  );
}
