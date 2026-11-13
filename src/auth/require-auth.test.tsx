import { act, cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider, useLocation, useSearchParams } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthProvider, RequireAuth, RequirePermission, useAuth } from './index';
import { safeRedirectPath } from './redirect';

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname + loc.search}</p>;
}

function Login() {
  const { status, signInDemo } = useAuth();
  const [params] = useSearchParams();
  return (
    <div>
      <Where />
      <p data-testid="destino">{safeRedirectPath(params.get('para'))}</p>
      <p data-testid="status">{status}</p>
      <button type="button" onClick={() => void signInDemo('leitura')}>
        entrar
      </button>
    </div>
  );
}

function Protected() {
  return (
    <div>
      <Where />
      <RequirePermission permission="expedicao.metas.editar" fallback={<p>sem permissão</p>}>
        <p>pode editar</p>
      </RequirePermission>
    </div>
  );
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
          { path: '/entrar', element: <Login /> },
          {
            element: (
              <RequireAuth>
                <Outlet />
              </RequireAuth>
            ),
            children: [{ path: '/expedicao/*', element: <Protected /> }],
          },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('RequireAuth (modo demo)', () => {
  afterEach(cleanup);
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('sem sessão, manda para /entrar com o caminho em ?para=', () => {
    renderAt('/expedicao/metas?acao=meta-global');
    expect(screen.getByTestId('where').textContent).toBe('/entrar?para=%2Fexpedicao%2Fmetas%3Facao%3Dmeta-global');
    expect(screen.getByTestId('destino').textContent).toBe('/expedicao/metas?acao=meta-global');
    expect(screen.getByTestId('status').textContent).toBe('signed-out');
  });

  it('com sessão demo de leitura, entra mas não edita meta', async () => {
    sessionStorage.setItem('hope.demo.sessao', JSON.stringify({ role: 'leitura' }));
    renderAt('/expedicao/metas');
    expect(screen.getByTestId('where').textContent).toBe('/expedicao/metas');
    expect(screen.getByText('sem permissão')).toBeInTheDocument();
  });

  it('sessão demo de liderança pode editar meta', () => {
    sessionStorage.setItem('hope.demo.sessao', JSON.stringify({ role: 'lideranca' }));
    renderAt('/expedicao/metas');
    expect(screen.getByText('pode editar')).toBeInTheDocument();
  });

  it('papel adulterado no sessionStorage vira sessão nenhuma', () => {
    sessionStorage.setItem('hope.demo.sessao', JSON.stringify({ role: 'superadmin' }));
    renderAt('/expedicao/metas');
    expect(screen.getByTestId('status').textContent).toBe('signed-out');
  });

  it('entrar pelo login demo muda o status', async () => {
    renderAt('/entrar');
    await act(async () => {
      screen.getByRole('button', { name: 'entrar' }).click();
    });
    expect(screen.getByTestId('status').textContent).toBe('signed-in');
  });
});
