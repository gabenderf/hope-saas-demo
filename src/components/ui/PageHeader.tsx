import type { ReactNode } from 'react';
import { Breadcrumbs, type BreadcrumbsProps } from './Breadcrumbs';

export interface PageHeaderProps {
  title: string;
  breadcrumbs?: BreadcrumbsProps['items'];
  renderLink?: BreadcrumbsProps['renderLink'];
  /** Ao lado do título, ex.: "Atualizado há 12 s". */
  meta?: ReactNode;
  actions?: ReactNode;
}

/** No celular o título ocupa a linha e as ações descem, com quebra. */
export function PageHeader({ title, breadcrumbs, renderLink, meta, actions }: PageHeaderProps) {
  return (
    <header className="mb-4 grid gap-1">
      {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} renderLink={renderLink} />}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-lg">{title}</h1>
        {meta && <div className="text-ink-3">{meta}</div>}
        {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">{actions}</div>}
      </div>
    </header>
  );
}
