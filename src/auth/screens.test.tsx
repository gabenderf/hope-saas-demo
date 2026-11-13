import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccessDeniedScreen, IdleWarning } from './screens';

describe('aviso de inatividade', () => {
  afterEach(cleanup);

  it('fechado quando não há aviso', () => {
    render(<IdleWarning idle={{ warning: false, secondsLeft: 0 }} onStay={vi.fn()} onSignOut={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('mostra a contagem e "Continuar conectado" mantém a sessão', async () => {
    const user = userEvent.setup();
    const onStay = vi.fn();
    render(<IdleWarning idle={{ warning: true, secondsLeft: 42 }} onStay={onStay} onSignOut={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Sua sessão vai terminar' });
    expect(dialog).toHaveTextContent('42');
    expect(screen.getByRole('button', { name: 'Continuar conectado' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Continuar conectado' }));
    expect(onStay).toHaveBeenCalled();
  });

  it('Esc também conta como continuar (a pessoa está ali)', async () => {
    const user = userEvent.setup();
    const onStay = vi.fn();
    render(<IdleWarning idle={{ warning: true, secondsLeft: 10 }} onStay={onStay} onSignOut={vi.fn()} />);
    await user.keyboard('{Escape}');
    expect(onStay).toHaveBeenCalled();
  });

  it('"Sair agora" sai', async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn();
    render(<IdleWarning idle={{ warning: true, secondsLeft: 10 }} onStay={vi.fn()} onSignOut={onSignOut} />);
    await user.click(screen.getByRole('button', { name: 'Sair agora' }));
    expect(onSignOut).toHaveBeenCalled();
  });
});

describe('acesso negado', () => {
  afterEach(cleanup);

  it('diz o motivo, o que fazer e oferece sair', async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn();
    render(<AccessDeniedScreen denial={{ reason: 'sem-perfil', email: 'ana@hope.com.br' }} onSignOut={onSignOut} />);
    expect(screen.getByRole('heading', { name: 'Sua conta ainda não tem acesso ao painel' })).toBeInTheDocument();
    expect(screen.getByText('ana@hope.com.br')).toBeInTheDocument();
    expect(screen.getByText('O que fazer')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sair e entrar com outra conta' }));
    expect(onSignOut).toHaveBeenCalled();
  });
});
