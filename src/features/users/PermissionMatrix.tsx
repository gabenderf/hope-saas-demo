import { Check, Minus } from 'lucide-react';
import { ALL_PERMISSIONS, ROLE_DESCRIPTION, ROLE_LABEL, ROLE_PERMISSIONS, type Role } from '@/auth/types';
import { Card, CardHeader } from '@/components/ui';
import { PERMISSION_LABEL } from './labels';

const ROLES: Role[] = ['admin', 'lideranca', 'leitura', 'tv'];

export function PermissionMatrix() {
  return (
    <Card>
      <CardHeader title="Perfis e permissões" description="O que cada perfil pode fazer. Esta tabela é a mesma que o banco aplica." />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left">
          <caption className="sr-only">Permissões de cada perfil</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="px-4 py-2 text-xs font-medium text-ink-3">
                Permissão
              </th>
              {ROLES.map((r) => (
                <th key={r} scope="col" className="px-3 py-2 text-center text-xs font-medium text-ink-2" title={ROLE_DESCRIPTION[r]}>
                  {ROLE_LABEL[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_PERMISSIONS.map((p) => (
              <tr key={p} className="border-b border-line last:border-0">
                <th scope="row" className="px-4 py-2 font-normal">
                  {PERMISSION_LABEL[p]}
                </th>
                {ROLES.map((r) => {
                  const yes = ROLE_PERMISSIONS[r].includes(p);
                  return (
                    <td key={r} className="px-3 py-2 text-center">
                      {yes ? (
                        <>
                          <Check className="mx-auto size-4 text-ok" aria-hidden="true" />
                          <span className="sr-only">Pode</span>
                        </>
                      ) : (
                        <>
                          <Minus className="mx-auto size-4 text-ink-3" aria-hidden="true" />
                          <span className="sr-only">Não pode</span>
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
