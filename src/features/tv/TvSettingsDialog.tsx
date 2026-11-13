import { Copy } from 'lucide-react';
import { useState } from 'react';
import { Button, Checkbox, Dialog, DialogClose, DialogContent, Field, Input, SegmentedControl, toast } from '@/components/ui';
import {
  ALL_PANELS,
  clampInterval,
  kioskQuery,
  MAX_INTERVAL,
  MIN_INTERVAL,
  PANEL_LABEL,
  PRIVACY_LABEL,
  PRIVACY_MODES,
  type PanelId,
  type Privacy,
  type TvSettings,
} from './model';

export interface TvSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: TvSettings;
  onSave: (next: TvSettings) => void;
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
}

export function TvSettingsDialog({ open, onOpenChange, settings, onSave, theme, onThemeChange }: TvSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <SettingsBody settings={settings} onSave={onSave} theme={theme} onThemeChange={onThemeChange} />}
    </Dialog>
  );
}

function SettingsBody({ settings, onSave, theme, onThemeChange }: Omit<TvSettingsDialogProps, 'open' | 'onOpenChange'>) {
  const [panels, setPanels] = useState<PanelId[]>(settings.panels);
  const [interval, setIntervalText] = useState(String(settings.intervalSec));
  const [privacy, setPrivacy] = useState<Privacy>(settings.privacy);

  const draft: TvSettings = {
    panels: panels.length ? panels : ['agora'],
    intervalSec: clampInterval(Number(interval)),
    privacy,
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/tv?${kioskQuery(draft)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link de quiosque copiado');
    } catch {
      toast.error('Não foi possível copiar. Selecione o endereço da barra do navegador.');
    }
  };

  return (
    <DialogContent
      title="Configurações do Modo TV"
      description="Ficam salvas neste aparelho. O link de quiosque leva as mesmas escolhas para outra TV."
      footer={
        <>
          <Button icon={<Copy />} onClick={() => void copyLink()}>
            Copiar link de quiosque
          </Button>
          <DialogClose asChild>
            <Button variant="ghost">Cancelar</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant="primary" onClick={() => onSave(draft)}>
              Salvar
            </Button>
          </DialogClose>
        </>
      }
    >
      <div className="grid gap-5">
        <Field label={`Tempo de cada painel, em segundos (${MIN_INTERVAL} a ${MAX_INTERVAL})`}>
          <Input type="number" min={MIN_INTERVAL} max={MAX_INTERVAL} step={1} inputMode="numeric" value={interval} onChange={(e) => setIntervalText(e.target.value)} />
        </Field>

        <fieldset className="grid gap-2">
          <legend className="mb-1 font-medium">Painéis no rodízio</legend>
          {ALL_PANELS.map((p) => (
            <label key={p} className="flex items-center gap-2">
              <Checkbox
                checked={panels.includes(p)}
                onCheckedChange={(v) => setPanels((cur) => (v === true ? [...cur, p] : cur.filter((x) => x !== p)))}
              />
              {PANEL_LABEL[p]}
              {p === 'previsao' && <span className="text-ink-3">(só quando há previsão)</span>}
            </label>
          ))}
        </fieldset>

        <div className="grid gap-1.5">
          <span className="font-medium">Privacidade dos operadores</span>
          <SegmentedControl
            aria-label="Privacidade dos operadores"
            value={privacy}
            onValueChange={(v) => setPrivacy(v as Privacy)}
            options={PRIVACY_MODES.map((m) => ({ value: m, label: m === 'completo' ? 'Completo' : m === 'sem-ranking' ? 'Sem ranking' : 'Só equipe' }))}
          />
          <p className="text-ink-2">{PRIVACY_LABEL[privacy]}. Nomes e ritmos ficam à vista de todo o galpão.</p>
        </div>

        <div className="grid gap-1.5">
          <span className="font-medium">Tema da TV</span>
          <SegmentedControl
            aria-label="Tema da TV"
            value={theme}
            onValueChange={(v) => onThemeChange(v as 'light' | 'dark')}
            options={[
              { value: 'dark', label: 'Escuro' },
              { value: 'light', label: 'Claro' },
            ]}
          />
        </div>
      </div>
    </DialogContent>
  );
}
