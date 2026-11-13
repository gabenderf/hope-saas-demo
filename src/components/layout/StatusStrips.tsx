import { Eye, FlaskConical } from 'lucide-react';
import { Link } from 'react-router';
import { CriticalAlertBanner } from '@/features/notifications';
import { useCapabilities, useDataMode } from '@/data/hooks';

const strip = 'flex items-center gap-2 border-b border-line px-4 py-1.5 text-xs text-ink-2 md:px-6';

/** Faixas discretas abaixo da barra superior, só quando se aplicam. */
export function StatusStrips() {
  const caps = useCapabilities();
  const mode = useDataMode();
  return (
    <>
      {caps.write === false ? (
        <div role="status" data-app-chrome className={`${strip} bg-sunk`}>
          <Eye className="size-3.5 shrink-0" aria-hidden="true" />
          <p>Dados reais em modo somente leitura. Alterações ficam para a fase da nuvem.</p>
        </div>
      ) : null}
      {mode === 'demo' ? (
        <div role="status" data-app-chrome className={`${strip} bg-sunk`}>
          <FlaskConical className="size-3.5 shrink-0" aria-hidden="true" />
          <p>
            Dados de demonstração.{' '}
            <Link to="/configuracoes/demonstracao" className="font-medium text-accent underline underline-offset-2">
              Ajustar a demonstração
            </Link>
          </p>
        </div>
      ) : null}
      <div data-app-chrome><CriticalAlertBanner /></div>
    </>
  );
}
