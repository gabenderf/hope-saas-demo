import { useCallback, useState } from 'react';

function read(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** Colunas ocultas, guardadas no navegador. */
export function useColumnVisibility(key: string): [string[], (hidden: string[]) => void] {
  const [hidden, setState] = useState<string[]>(() => read(key));
  const set = useCallback(
    (next: string[]) => {
      setState(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* navegador sem armazenamento: vale só nesta sessão */
      }
    },
    [key],
  );
  return [hidden, set];
}
