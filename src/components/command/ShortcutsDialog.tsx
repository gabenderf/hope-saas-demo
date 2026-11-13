import { Dialog, DialogContent, Kbd } from '@/components/ui';
import { GO_SHORTCUTS } from './shortcuts';
import { usePaletteStore } from './palette-store';

const GENERAL: { keys: string[]; label: string }[] = [
  { keys: ['Ctrl', 'K'], label: 'Abrir a busca e os comandos' },
  { keys: ['/'], label: 'Abrir a busca e os comandos' },
  { keys: ['?'], label: 'Mostrar esta lista de atalhos' },
  { keys: ['Esc'], label: 'Fechar painel, menu ou diálogo' },
];

export function ShortcutsDialog() {
  const open = usePaletteStore((s) => s.helpOpen);
  const setOpen = usePaletteStore((s) => s.setHelpOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title="Atalhos de teclado" description="Não funcionam enquanto você digita num campo.">
        <div className="grid gap-5">
          <section aria-labelledby="atalhos-geral">
            <h3 id="atalhos-geral" className="mb-2 text-base">
              Geral
            </h3>
            <ul className="grid gap-1.5">
              {GENERAL.map((s) => (
                <li key={s.label + s.keys.join()} className="flex items-center justify-between gap-3">
                  <span>{s.label}</span>
                  <span className="flex gap-1">
                    {s.keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="atalhos-ir">
            <h3 id="atalhos-ir" className="mb-2 text-base">
              Ir para uma tela
            </h3>
            <p className="mb-2 text-ink-3">Aperte G e, em seguida, a letra.</p>
            <ul className="grid gap-1.5">
              {GO_SHORTCUTS.map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-3">
                  <span>{s.label}</span>
                  <span className="flex gap-1">
                    <Kbd>G</Kbd>
                    <Kbd>{s.key.toUpperCase()}</Kbd>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
