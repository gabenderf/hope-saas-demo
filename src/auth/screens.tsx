/**
 * Telas do próprio módulo de autenticação: acesso negado (conta logada sem
 * direito de abrir o painel) e aviso de inatividade.
 */
import { LogOut, ShieldOff } from 'lucide-react';
import { Button, Dialog, DialogContent, Notice } from '@/components/ui';
import { AuthLayout } from './layout';
import { DENIAL_MESSAGE } from './messages';
import type { AccessDenial, AccessDenialReason, IdleState } from './types';

/** O que a pessoa faz em cada caso. */
const NEXT_STEP: Record<AccessDenialReason, string> = {
  'sem-perfil':
    'Mande para um administrador o e-mail abaixo. Depois que ele liberar, saia e entre de novo para o acesso valer.',
  desativado: 'Só um administrador reativa a conta, em Usuários.',
  'sem-modulo': 'Peça a um administrador para liberar o módulo em Usuários. Depois, saia e entre de novo.',
  dispositivo:
    'Para usar o painel, entre com o seu e-mail. Para ligar uma TV, abra o Modo TV nela e use o pareamento.',
};

export function AccessDeniedScreen({ denial, onSignOut }: { denial: AccessDenial; onSignOut: () => void }) {
  const msg = DENIAL_MESSAGE[denial.reason];
  return (
    <AuthLayout title={msg.title} subtitle={msg.body}>
      <Notice title="O que fazer">{NEXT_STEP[denial.reason]}</Notice>
      {denial.email ? (
        <p className="text-ink-2">
          Conta: <span className="font-mono text-ink">{denial.email}</span>
        </p>
      ) : null}
      <Button variant="primary" size="lg" icon={<LogOut />} onClick={onSignOut}>
        Sair e entrar com outra conta
      </Button>
      <p className="flex items-center gap-2 text-ink-3">
        <ShieldOff className="size-4" aria-hidden="true" />
        Nenhum dado do painel foi carregado para esta conta.
      </p>
    </AuthLayout>
  );
}

/**
 * Aviso 60 s antes de sair por inatividade. Fechar o diálogo (Esc, X ou
 * clicar fora) conta como "continuar conectado": a pessoa está ali.
 */
export function IdleWarning({ idle, onStay, onSignOut }: { idle: IdleState; onStay: () => void; onSignOut: () => void }) {
  return (
    <Dialog
      open={idle.warning}
      onOpenChange={(open) => {
        if (!open) onStay();
      }}
    >
      <DialogContent
        title="Sua sessão vai terminar"
        description="Por segurança, o painel sai sozinho depois de 30 minutos sem uso."
        footer={
          <>
            <Button onClick={onSignOut}>Sair agora</Button>
            <Button variant="primary" onClick={onStay} autoFocus>
              Continuar conectado
            </Button>
          </>
        }
      >
        {/* Sem aria-live: anunciar a cada segundo atrapalharia; o título já é lido ao abrir. */}
        <p className="text-ink-2">
          Saída automática em{' '}
          <span className="tabular text-xl font-semibold text-ink">{idle.secondsLeft}</span>{' '}
          {idle.secondsLeft === 1 ? 'segundo' : 'segundos'}.
        </p>
      </DialogContent>
    </Dialog>
  );
}
