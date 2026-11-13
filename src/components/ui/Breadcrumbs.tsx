import { ChevronRight } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';

export interface Crumb {
  label: string;
  /** Sem `to`, é o item atual. */
  to?: string;
}

export interface BreadcrumbsProps {
  items: Crumb[];
  /** Renderiza o link (ex.: `(c) => <Link to={c.to}>...`). Padrão: <a>. */
  renderLink?: (crumb: Crumb & { to: string }) => ReactNode;
}

export function Breadcrumbs({ items, renderLink }: BreadcrumbsProps) {
  return (
    <nav aria-label="Você está em" className="text-ink-3">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((c, i) => (
          <Fragment key={`${c.label}-${i}`}>
            {i > 0 && <ChevronRight className="size-3" aria-hidden="true" />}
            <li className="min-w-0">
              {c.to ? (
                (renderLink?.({ ...c, to: c.to }) ?? (
                  <a href={c.to} className="rounded-sm hover:text-ink">
                    {c.label}
                  </a>
                ))
              ) : (
                <span aria-current="page" className="text-ink-2">
                  {c.label}
                </span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
