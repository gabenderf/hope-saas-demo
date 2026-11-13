/**
 * Estado de filtro na URL (?periodo=7d&vs=semana-passada): link
 * compartilhável, voltar do navegador funciona, e recarregar mantém a tela.
 *
 * Valor inválido ou ausente cai no padrão (nunca quebra a tela por URL
 * digitada à mão). O padrão não é escrito na URL, para ela ficar limpa.
 */
import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

export function useUrlEnum<const T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (value: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const value = raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;

  const set = useCallback(
    (next: T) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === fallback) p.delete(key);
          else p.set(key, next);
          return p;
        },
        { replace: true },
      );
    },
    [key, fallback, setParams],
  );

  return [value, set];
}

export function useUrlString(key: string, fallback = ''): [string, (value: string) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? fallback;
  const set = useCallback(
    (next: string) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (!next || next === fallback) p.delete(key);
          else p.set(key, next);
          return p;
        },
        { replace: true },
      );
    },
    [key, fallback, setParams],
  );
  return [value, set];
}

/**
 * Lê e consome uma intenção (?acao=...) uma única vez.
 * Uso: const acao = useConsumeIntent(); if (acao === 'meta-global') abrir();
 */
export function useIntent(): [string | null, () => void] {
  const [params, setParams] = useSearchParams();
  const intent = params.get('acao');
  const clear = useCallback(() => {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete('acao');
        return p;
      },
      { replace: true },
    );
  }, [setParams]);
  return [intent, clear];
}
