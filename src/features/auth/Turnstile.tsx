/**
 * Cloudflare Turnstile (CAPTCHA) no login e na recuperação de senha.
 *
 * Só aparece com VITE_TURNSTILE_SITE_KEY configurada. O script é o único
 * terceiro liberado na CSP (docs/seguranca.md, seção 10). O token vale uma vez:
 * depois de cada tentativa, a tela troca a `resetKey` para pedir outro.
 */
import { useEffect, useRef, useState } from 'react';
import { Notice } from '@/components/ui';

interface TurnstileApi {
  render(
    el: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
      theme?: 'auto' | 'light' | 'dark';
      language?: string;
      size?: 'normal' | 'flexible' | 'compact';
    },
  ): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')));
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('turnstile'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (token: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onTokenRef.current = onToken;
  });

  useEffect(() => {
    let widgetId: string | null = null;
    let alive = true;
    loadTurnstile()
      .then((api) => {
        if (!alive || !ref.current) return;
        widgetId = api.render(ref.current, {
          sitekey: siteKey,
          callback: (t) => onTokenRef.current(t),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
          theme: 'auto',
          language: 'pt-br',
          size: 'flexible',
        });
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey]);

  if (failed) {
    return (
      <Notice tone="warn" title="Verificação anti-robô indisponível">
        Não foi possível carregar a verificação. Confira a internet e recarregue a página.
      </Notice>
    );
  }
  return <div ref={ref} className="min-h-[65px]" />;
}
