import { useState } from 'react';
import { Badge, Button, Card, CardBody, CardHeader, Notice, Switch } from '@/components/ui';
import { browserNotificationsAvailable, notify, prefOf } from './notify';
import { RULES } from './rules';
import { useNotificationStore } from './store';

type Permissao = 'granted' | 'denied' | 'default' | 'indisponivel';

function readPermission(): Permissao {
  return browserNotificationsAvailable() ? Notification.permission : 'indisponivel';
}

const OWNER_LABEL = { notificacoes: 'Painel', previsao: 'Previsão' } as const;

/** Seção das Configurações: regras, permissão do navegador, teste e som do Modo TV. */
export function NotificationPreferences() {
  const prefs = useNotificationStore((s) => s.prefs);
  const globals = useNotificationStore((s) => s.globals);
  const setPref = useNotificationStore((s) => s.setPref);
  const setGlobals = useNotificationStore((s) => s.setGlobals);
  const [permission, setPermission] = useState<Permissao>(readPermission);

  const ask = async () => {
    if (!browserNotificationsAvailable()) return;
    setPermission(await Notification.requestPermission());
  };
  const sendTest = () => {
    notify({
      rule: 'teste',
      severity: 'atencao',
      title: 'Notificação de teste',
      body: 'Se você viu este aviso, está tudo certo.',
      href: '/notificacoes',
      dedupeKey: `teste:${Date.now()}`,
    });
  };

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader title="Avisos por regra" description="Escolha o que aparece no sino, em aviso rápido na tela e no navegador." />
        <CardBody className="grid gap-1">
          <div className="hidden grid-cols-[1fr_72px_72px_88px] gap-3 px-1 pb-1 text-xs text-ink-3 sm:grid">
            <span>Regra</span>
            <span>Ligada</span>
            <span>Aviso na tela</span>
            <span>Navegador</span>
          </div>
          <ul className="divide-y divide-line">
            {RULES.map((r) => {
              const p = prefOf(r.id, r.severity, prefs);
              const set = (patch: Partial<typeof p>) => setPref(r.id, patch, p);
              return (
                <li key={r.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_72px_72px_88px] sm:items-center sm:gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                      {r.label}
                      {r.owner === 'previsao' && <Badge>Previsão</Badge>}
                    </p>
                    <p className="text-ink-3">{r.description}</p>
                  </div>
                  <label className="flex items-center gap-2 text-ink-2">
                    <Switch checked={p.ativa} onCheckedChange={(ativa) => set({ ativa })} aria-label={`${r.label}: ligada`} />
                    <span className="sm:sr-only">Ligada</span>
                  </label>
                  <label className="flex items-center gap-2 text-ink-2">
                    <Switch
                      checked={p.toast}
                      disabled={!p.ativa || r.severity === 'info'}
                      onCheckedChange={(toast) => set({ toast })}
                      aria-label={`${r.label}: aviso na tela`}
                    />
                    <span className="sm:sr-only">Aviso na tela</span>
                  </label>
                  <label className="flex items-center gap-2 text-ink-2">
                    <Switch
                      checked={p.navegador}
                      disabled={!p.ativa}
                      onCheckedChange={(navegador) => set({ navegador })}
                      aria-label={`${r.label}: navegador`}
                    />
                    <span className="sm:sr-only">Navegador</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="pt-2 text-xs text-ink-3">
            {`Regras da ${OWNER_LABEL.previsao} são avaliadas pela aba Previsão. Avisos de informação não aparecem em aviso na tela.`}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Notificações do navegador"
          description="Aparecem quando esta aba está escondida, para você não perder um aviso."
          actions={
            permission === 'default' ? (
              <Button variant="primary" onClick={() => void ask()}>
                Permitir no navegador
              </Button>
            ) : undefined
          }
        />
        <CardBody className="grid gap-3">
          {permission === 'granted' && (
            <p className="flex items-center gap-2 text-ink-2">
              <Badge tone="ok">Concedida</Badge> O navegador deixa esta página enviar avisos.
            </p>
          )}
          {permission === 'default' && <p className="text-ink-2">Ainda não pedida. Clique em Permitir e responda ao pedido do navegador.</p>}
          {permission === 'denied' && (
            <Notice tone="warn" title="Negada no navegador">
              Para reativar, abra as configurações do site no navegador (cadeado ao lado do endereço), mude Notificações para Permitir e
              recarregue a página.
            </Notice>
          )}
          {permission === 'indisponivel' && <p className="text-ink-2">Este navegador não oferece notificações. Os avisos continuam no sino.</p>}
          <label className="flex items-center gap-2 text-ink-2">
            <Switch
              checked={globals.navegadorPermitido}
              onCheckedChange={(navegadorPermitido) => setGlobals({ navegadorPermitido })}
              aria-label="Usar notificações do navegador"
            />
            Usar notificações do navegador neste usuário
          </label>
          <div>
            <Button onClick={sendTest}>Enviar notificação de teste</Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Modo TV" />
        <CardBody>
          <label className="flex items-center gap-2 text-ink-2">
            <Switch checked={globals.somNaTv} onCheckedChange={(somNaTv) => setGlobals({ somNaTv })} aria-label="Som na TV" />
            Tocar um aviso sonoro quando surgir um alerta crítico
          </label>
        </CardBody>
      </Card>
    </div>
  );
}
