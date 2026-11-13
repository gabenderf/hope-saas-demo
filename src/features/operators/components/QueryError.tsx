import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';

/** Erro de carregamento no lugar do conteúdo, com tentar de novo. */
export function QueryError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <Notice
      tone="crit"
      title={`Não foi possível carregar ${what}.`}
      action={
        <Button size="sm" onClick={onRetry}>
          Tentar de novo
        </Button>
      }
    >
      Confira a conexão. Se continuar, a fonte de dados pode estar fora do ar.
    </Notice>
  );
}
