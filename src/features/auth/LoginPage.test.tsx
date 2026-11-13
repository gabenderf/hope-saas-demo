import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthProvider, RequireAuth } from '@/auth';
import LoginPage from './LoginPage';

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname + loc.search}</p>;
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        element: (
          <AuthProvider>
            <Outlet />
          </AuthProvider>
        ),
        children: [
          { path: '/entrar', element: <LoginPage /> },
          {
            element: (
              <RequireAuth>
                <Outlet />
              </RequireAuth>
            ),
            children: [{ path: '*', element: <Where /> }],
          },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('login demo: redirecionamento depois de entrar', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });
  afterEach(cleanup);

  it('mostra a faixa de demonstração e os quatro perfis', () => {
    renderAt('/entrar');
    expect(screen.getByRole('note')).toHaveTextContent('Modo de demonstração');
    const perfis = screen.getByRole('list', { name: 'Perfis de demonstração' });
    expect(perfis.querySelectorAll('button')).toHaveLength(4);
  });

  it('página protegida manda para o login e volta para ela depois', async () => {
    const user = userEvent.setup();
    renderAt('/expedicao/metas?acao=meta-global');
    await user.click(await screen.findByRole('button', { name: /Liderança/ }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/expedicao/metas?acao=meta-global');
  });

  it('?para= externo é ignorado: cai na página padrão', async () => {
    const user = userEvent.setup();
    renderAt('/entrar?para=%2F%2Fevil.com');
    await user.click(screen.getByRole('button', { name: /Administrador/ }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/expedicao');
    expect(screen.getByTestId('where')).not.toHaveTextContent('evil');
  });

  it('perfil TV vai sempre para o Modo TV', async () => {
    const user = userEvent.setup();
    renderAt('/entrar?para=%2Fadmin%2Fusuarios');
    await user.click(screen.getByRole('button', { name: /TV do galpão/ }));
    expect(await screen.findByTestId('where')).toHaveTextContent(/^\/tv$/);
  });
});
