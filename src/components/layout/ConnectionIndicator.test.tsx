import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionState } from '@/data/types';
import { ConnectionIndicator } from './ConnectionIndicator';

let state: ConnectionState = 'connecting';
vi.mock('@/data/hooks', () => ({ useConnectionState: () => state }));

afterEach(cleanup);

describe('ConnectionIndicator', () => {
  it('abrindo a página: "Conectando", neutro (sem cor de alerta)', () => {
    state = 'connecting';
    render(<ConnectionIndicator />);
    const el = screen.getByRole('status');
    expect(el.textContent).toBe('Conectando');
    expect(el.className).toContain('text-ink-3');
    expect(el.className).not.toMatch(/text-(warn|crit)/);
  });

  it('âmbar só quando caiu e está tentando de novo', () => {
    state = 'reconnecting';
    render(<ConnectionIndicator />);
    const el = screen.getByRole('status');
    expect(el.textContent).toBe('Reconectando');
    expect(el.className).toContain('text-warn');
  });

  it('ao vivo e sem conexão', () => {
    state = 'live';
    const { unmount } = render(<ConnectionIndicator />);
    expect(screen.getByRole('status').textContent).toBe('Ao vivo');
    unmount();
    state = 'offline';
    render(<ConnectionIndicator />);
    expect(screen.getByRole('status').className).toContain('text-crit');
  });
});
