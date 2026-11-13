/**
 * Rotas. Cada tela é carregada sob demanda (um arquivo por rota).
 *
 * Camadas:
 *   Root            AuthProvider + tema + toasts (vale para tudo, inclusive login)
 *   AuthedData      exige login e só então cria a fonte de dados. Na nuvem a
 *                   leitura vai exigir sessão autenticada (RLS), então a fonte
 *                   NUNCA existe antes do login.
 *     /tv           Modo TV, layout próprio
 *     AppShell      menu lateral, barra superior, paleta de comandos
 */
/* eslint-disable react-refresh/only-export-components */
import type { ComponentType } from 'react';
import { Navigate, Outlet, createBrowserRouter } from 'react-router';
import { AuthProvider, RequireAuth, RequirePermission } from '@/auth';
import type { Permission } from '@/auth/types';
import { AppShell } from '@/components/layout/AppShell';
import { Toaster } from '@/components/ui/toast';
import { DataSourceProvider } from '@/data/source';
import ForbiddenPage from '@/features/misc/ForbiddenPage';
import { RouteErrorScreen } from './route-error';
import { ThemeSync } from './theme';

const page = (load: () => Promise<{ default: ComponentType }>) => async () => ({ Component: (await load()).default });

function Root() {
  return (
    <AuthProvider>
      <ThemeSync />
      <Outlet />
      <Toaster />
    </AuthProvider>
  );
}

function AuthedData() {
  return (
    <RequireAuth>
      <DataSourceProvider>
        <Outlet />
      </DataSourceProvider>
    </RequireAuth>
  );
}

function Gate({ permission }: { permission: Permission }) {
  return (
    <RequirePermission permission={permission} fallback={<ForbiddenPage />}>
      <Outlet />
    </RequirePermission>
  );
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteErrorScreen />,
    children: [
      /* ---------- público ---------- */
      { path: '/entrar', lazy: page(() => import('@/features/auth/LoginPage')) },
      { path: '/entrar/verificacao', lazy: page(() => import('@/features/auth/MfaPage')) },
      { path: '/entrar/recuperar', lazy: page(() => import('@/features/auth/ForgotPasswordPage')) },
      { path: '/entrar/redefinir', lazy: page(() => import('@/features/auth/ResetPasswordPage')) },
      { path: '/entrar/convite', lazy: page(() => import('@/features/auth/AcceptInvitePage')) },
      /** a TV ainda não pareada mostra o código aqui, sem login */
      { path: '/tv/parear', lazy: page(() => import('@/features/auth/TvPairingPage')) },

      /* ---------- autenticado ---------- */
      {
        element: <AuthedData />,
        children: [
          {
            path: '/tv',
            element: <Gate permission="tv.ver" />,
            children: [{ index: true, lazy: page(() => import('@/features/tv/TvPage')) }],
          },
          {
            element: <AppShell />,
            children: [
              { index: true, element: <Navigate to="/expedicao" replace /> },
              {
                path: 'expedicao',
                element: <Gate permission="expedicao.ver" />,
                children: [
                  { index: true, lazy: page(() => import('@/features/overview/OverviewPage')) },
                  { path: 'operadores', lazy: page(() => import('@/features/operators/OperatorsPage')) },
                  { path: 'operadores/:operatorId', lazy: page(() => import('@/features/operators/OperatorDetailPage')) },
                  { path: 'produtos', lazy: page(() => import('@/features/products/ProductsPage')) },
                  { path: 'atividade', lazy: page(() => import('@/features/activity/ActivityPage')) },
                  { path: 'previsao', lazy: page(() => import('@/features/forecast/ForecastPage')) },
                  { path: 'planejamento', lazy: page(() => import('@/features/planning/PlanningPage')) },
                  { path: 'relatorios', lazy: page(() => import('@/features/reports/ReportsPage')) },
                  { path: 'metas', lazy: page(() => import('@/features/goals/GoalsPage')) },
                ],
              },
              {
                path: 'admin/usuarios',
                element: <Gate permission="usuarios.gerenciar" />,
                children: [{ index: true, lazy: page(() => import('@/features/users/UsersPage')) }],
              },
              {
                path: 'admin/historico',
                element: <Gate permission="auditoria.ver" />,
                children: [{ index: true, lazy: page(() => import('@/features/audit/AuditPage')) }],
              },
              { path: 'notificacoes', lazy: page(() => import('@/features/notifications/NotificationsPage')) },
              { path: 'configuracoes/:secao?', lazy: page(() => import('@/features/settings/SettingsPage')) },
              // Guia de componentes: só em desenvolvimento. No build de produção a rota não existe.
              ...(import.meta.env.DEV ? [{ path: 'dev/ui', lazy: page(() => import('@/features/dev/UiGuidePage')) }] : []),
              { path: '*', lazy: page(() => import('@/features/misc/NotFoundPage')) },
            ],
          },
        ],
      },
    ],
  },
]);
