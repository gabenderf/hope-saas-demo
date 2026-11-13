import { act, cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { queryClient } from '@/app/query';
import { AuthProvider, RequireAuth, useAuth } from './index';

function Status() {
  const { status, signOut, signInDemo, user } = useAuth();
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="user">{user?.id ?? ''}</p>
      <button type="button" onClick={() => void signOut()}>
        sair
      </button>
      <button type="button" onClick={() => void signInDemo('admin')}>
        entrar admin
      </button>
    </div>
  );
}

function renderApp() {
  const router = createMemoryRouter(
    [
      {
        element: (
          <AuthProvider>
            <Status />
            <Outlet />
          </AuthProvider>
        ),
        children: [
          { path: '/entrar', element: <p>login</p> },
          {
            element: (
              <RequireAuth>
                <Outlet />
              </RequireAuth>
            ),
            children: [{ path: '/expedicao', element: <p>painel</p> }],
          },
        ],
      },
    ],
    { initialEntries: ['/expedicao'] },
  );
  render(<RouterProvider router={router} />);
}

const seed = () => {
  queryClient.setQueryData(['usuarios'], [{ username: 'chefe', role: 'admin' }]);
  queryClient.setQueryData(['auditoria'], [{ id: 1 }]);
};

describe('saída limpa o cache das telas', () => {
  afterEach(() => {
    cleanup();
    queryClient.clear();
  });
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    queryClient.clear();
  });

  it('sair manualmente apaga o cache do React Query', async () => {
    sessionStorage.setItem('hope.demo.sessao', JSON.stringify({ role: 'admin' }));
    renderApp();
    expect(screen.getByText('painel')).toBeInTheDocument();
    seed();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(2);

    await act(async () => {
      screen.getByRole('button', { name: 'sair' }).click();
    });
    expect(screen.getByTestId('status').textContent).toBe('signed-out');
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(queryClient.getQueryData(['usuarios'])).toBeUndefined();
  });

  it('sessão encerrada por fora (outra aba, expiração): também apaga', async () => {
    sessionStorage.setItem('hope.demo.sessao', JSON.stringify({ role: 'lideranca' }));
    renderApp();
    seed();
    // troca de perfil sem passar pela tela de login (outra aba entrou como outro usuário)
    await act(async () => {
      screen.getByRole('button', { name: 'entrar admin' }).click();
    });
    expect(screen.getByTestId('user').textContent).toBe('demo-admin');
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('entrar não apaga nada (só a saída)', async () => {
    renderApp();
    seed();
    await act(async () => {
      screen.getByRole('button', { name: 'entrar admin' }).click();
    });
    expect(screen.getByTestId('status').textContent).toBe('signed-in');
    expect(queryClient.getQueryCache().getAll()).toHaveLength(2);
  });
});
