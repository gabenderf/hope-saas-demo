/**
 * Aviso sonoro do Modo TV: dois toques curtos quando aparece um alerta
 * CRÍTICO novo (falha de sistema: sem conexão, sem coleta de dados).
 * Só toca se a preferência "som na TV" estiver ligada (Configurações >
 * Notificações). Nunca toca por desempenho de pessoa: essas regras não são
 * críticas por construção.
 *
 * O navegador só libera áudio depois de uma interação na página. Numa TV em
 * quiosque o primeiro clique (ou a tecla do controle) destrava; antes disso
 * o aviso fica só visual, sem erro.
 */
import { useEffect, useRef } from 'react';
import { useCriticalAlerts, useTvSoundEnabled } from '@/features/notifications';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return null;
  ctx ??= new window.AudioContext();
  return ctx;
}

function chime() {
  const ac = audio();
  if (!ac) return;
  const play = () => {
    const start = ac.currentTime + 0.02;
    [0, 0.28].forEach((offset, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = i === 0 ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, start + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.24);
      osc.connect(gain).connect(ac.destination);
      osc.start(start + offset);
      osc.stop(start + offset + 0.26);
    });
  };
  if (ac.state === 'suspended') ac.resume().then(play, () => {});
  else play();
}

export function useCriticalChime(): void {
  const enabled = useTvSoundEnabled();
  const critical = useCriticalAlerts();
  const seen = useRef<Set<string> | null>(null);

  // Destrava o áudio na primeira interação (política de autoplay).
  useEffect(() => {
    if (!enabled) return;
    const unlock = () => void audio()?.resume().catch(() => {});
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [enabled]);

  useEffect(() => {
    const ids = new Set(critical.map((c) => c.id));
    // Primeira leitura só registra o que já existia: abrir a TV não apita por alerta antigo.
    if (seen.current == null) {
      seen.current = ids;
      return;
    }
    const fresh = critical.some((c) => !seen.current?.has(c.id));
    seen.current = ids;
    if (fresh && enabled) chime();
  }, [critical, enabled]);
}
