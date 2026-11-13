/** Marcador provisório de tela. Some quando a feature dona entrega a tela real. */
export function PagePlaceholder({ title, owner }: { title: string; owner: string }) {
  return (
    <div className="grid gap-2 p-6">
      <h1 className="text-lg">{title}</h1>
      <p className="text-ink-3">Tela em construção ({owner}).</p>
    </div>
  );
}
