import { Command } from 'cmdk';
import {
  Bell,
  CalendarClock,
  CalendarRange,
  FileDown,
  type LucideIcon,
  MonitorPlay,
  Moon,
  Search,
  Settings,
  Sun,
  Target,
  Tv,
  UserPlus,
  UserRoundPlus,
  Component,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { INTENTS, operatorPath, overviewPath } from '@/app/intents';
import { NAV_ITEMS } from '@/app/nav';
import { useResolvedTheme } from '@/app/theme';
import { useUiStore } from '@/app/ui-store';
import { can, useAuth } from '@/auth';
import { ROLE_LABEL, ROLE_PERMISSIONS, type Permission, type Role } from '@/auth/types';
import { Kbd } from '@/components/ui';
import { useOperators } from '@/data/hooks';
import { matchScore } from './search';
import { pushRecent, readRecents, usePaletteStore } from './palette-store';

interface Cmd {
  id: string;
  group: 'ir' | 'acoes';
  label: string;
  icon: LucideIcon;
  keywords?: string[];
  permission?: Permission;
  run: () => void;
}

const ROLE_ORDER: Role[] = ['leitura', 'lideranca', 'admin'];

/** "exige Liderança": o menor perfil que tem a permissão. */
function requiredRoleText(permission: Permission): string {
  const role = ROLE_ORDER.find((r) => ROLE_PERMISSIONS[r].includes(permission));
  return role ? `exige ${ROLE_LABEL[role]}` : 'sem acesso';
}

const itemClass =
  'flex min-h-[34px] cursor-pointer items-center gap-3 rounded-sm px-3 text-sm text-ink outline-none data-[disabled=true]:cursor-not-allowed data-[disabled=true]:text-ink-3 data-[selected=true]:bg-hover';
const headingClass = '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-ink-3';

export function CommandPalette() {
  const open = usePaletteStore((s) => s.paletteOpen);
  const setOpen = usePaletteStore((s) => s.setPaletteOpen);
  const setHelpOpen = usePaletteStore((s) => s.setHelpOpen);
  const navigate = useNavigate();
  const { user } = useAuth();
  const operators = useOperators();
  const resolved = useResolvedTheme();
  const setTheme = useUiStore((s) => s.setTheme);
  const [search, setSearch] = useState('');
  const [recents, setRecents] = useState<string[]>([]);

  const go = useCallback((to: string) => void navigate(to), [navigate]);

  const commands = useMemo<Cmd[]>(() => {
    const nav: Cmd[] = NAV_ITEMS.map((i) => ({
      id: `ir-${i.id}`,
      group: 'ir',
      label: i.label,
      icon: i.icon,
      keywords: [i.description, ...(i.keywords ?? [])],
      permission: i.permission,
      run: () => go(i.to),
    }));
    nav.push(
      { id: 'ir-notificacoes', group: 'ir', label: 'Notificações', icon: Bell, keywords: ['alertas', 'avisos'], run: () => go('/notificacoes') },
      { id: 'ir-configuracoes', group: 'ir', label: 'Configurações', icon: Settings, keywords: ['tema', 'perfil', 'seguranca'], run: () => go('/configuracoes') },
      { id: 'ir-tv', group: 'ir', label: 'Modo TV', icon: Tv, keywords: ['painel', 'televisao'], permission: 'tv.ver', run: () => go('/tv') },
    );
    const actions: Cmd[] = [
      { id: 'acao-meta-global', group: 'acoes', label: 'Definir meta global', icon: Target, keywords: ['meta do dia'], permission: 'expedicao.metas.editar', run: () => go(INTENTS.metaGlobal) },
      { id: 'acao-programar-metas', group: 'acoes', label: 'Programar metas', icon: CalendarClock, keywords: ['agenda', 'meta por dia'], permission: 'expedicao.metas.editar', run: () => go(INTENTS.agendaMetas) },
      { id: 'acao-novo-operador', group: 'acoes', label: 'Novo operador', icon: UserPlus, keywords: ['cadastrar'], permission: 'expedicao.operadores.gerenciar', run: () => go(INTENTS.novoOperador) },
      { id: 'acao-exportar', group: 'acoes', label: 'Exportar relatório', icon: FileDown, keywords: ['csv', 'excel'], permission: 'expedicao.exportar', run: () => go(INTENTS.exportarRelatorio) },
      { id: 'acao-convidar', group: 'acoes', label: 'Convidar usuário', icon: UserRoundPlus, keywords: ['acesso', 'convite'], permission: 'usuarios.gerenciar', run: () => go(INTENTS.convidarUsuario) },
      { id: 'acao-parear-tv', group: 'acoes', label: 'Parear dispositivo', icon: MonitorPlay, keywords: ['tv', 'televisao', 'bancada', 'coletor'], permission: 'dispositivos.gerenciar', run: () => go(INTENTS.parearTv) },
      { id: 'acao-periodo-hoje', group: 'acoes', label: 'Período: Hoje', icon: CalendarRange, keywords: ['visao geral'], permission: 'expedicao.ver', run: () => go(overviewPath('hoje')) },
      { id: 'acao-periodo-7d', group: 'acoes', label: 'Período: 7 dias úteis', icon: CalendarRange, keywords: ['semana', 'visao geral'], permission: 'expedicao.ver', run: () => go(overviewPath('7d')) },
      { id: 'acao-periodo-30d', group: 'acoes', label: 'Período: 30 dias', icon: CalendarRange, keywords: ['mes', 'visao geral'], permission: 'expedicao.ver', run: () => go(overviewPath('30d')) },
      {
        id: 'acao-tema',
        group: 'acoes',
        label: 'Alternar tema',
        icon: resolved === 'dark' ? Sun : Moon,
        keywords: ['claro', 'escuro'],
        run: () => setTheme(resolved === 'dark' ? 'light' : 'dark'),
      },
      { id: 'acao-guia', group: 'acoes', label: 'Abrir guia de componentes', icon: Component, keywords: ['design system'], run: () => go('/dev/ui') },
      { id: 'acao-atalhos', group: 'acoes', label: 'Atalhos de teclado', icon: Search, keywords: ['ajuda'], run: () => setHelpOpen(true) },
    ];
    // Guia de componentes: só em desenvolvimento (a rota nem existe no build de produção).
    return [...nav, ...actions].filter((c) => c.id !== 'acao-guia' || import.meta.env.DEV);
  }, [go, resolved, setTheme, setHelpOpen]);

  const allowed = useCallback((c: Cmd) => !c.permission || can(user, c.permission), [user]);

  // Navegação sem permissão some; ação sem permissão aparece desabilitada com o motivo.
  const visible = useMemo(() => commands.filter((c) => c.group === 'acoes' || allowed(c)), [commands, allowed]);

  const run = (c: Cmd) => {
    pushRecent(c.id);
    setOpen(false);
    c.run();
  };

  const onOpenChange = (next: boolean) => {
    if (next) setRecents(readRecents());
    else setSearch('');
    setOpen(next);
  };

  // Atualiza os recentes sempre que a paleta abre, inclusive por atalho.
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setRecents(readRecents());
  }

  const recentCmds = recents.map((id) => visible.find((c) => c.id === id)).filter((c): c is Cmd => Boolean(c));
  const ops = (operators.data ?? []).filter((o) => o.registration === 'ativo');
  const groups: { id: Cmd['group']; heading: string }[] = [
    { id: 'ir', heading: 'Ir para' },
    { id: 'acoes', heading: 'Ações' },
  ];

  const renderItem = (c: Cmd, prefix = '') => {
    const ok = allowed(c);
    return (
      <Command.Item
        key={prefix + c.id}
        value={`${prefix}${c.label}`}
        keywords={c.keywords}
        disabled={!ok}
        onSelect={() => run(c)}
        className={itemClass}
      >
        <c.icon className="size-4 shrink-0 text-ink-2" aria-hidden="true" />
        <span className="flex-1 truncate">{c.label}</span>
        {!ok && c.permission ? <span className="text-xs text-ink-3">{requiredRoleText(c.permission)}</span> : null}
      </Command.Item>
    );
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Buscar ou executar um comando"
      filter={(value, q, keywords) => matchScore(q, value, keywords)}
      overlayClassName="fixed inset-0 z-50 animate-fade-in bg-scrim"
      contentClassName="fixed left-1/2 top-[14vh] z-50 w-[min(600px,calc(100vw-24px))] -translate-x-1/2 animate-pop-in overflow-hidden rounded-lg border border-line bg-surface shadow-popover"
    >
      <div className="flex items-center gap-2 border-b border-line px-3">
        <Search className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
        <Command.Input
          value={search}
          onValueChange={setSearch}
          placeholder="Buscar tela, operador ou ação"
          className="h-11 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
        />
        <Kbd>Esc</Kbd>
      </div>
      <Command.List className={`max-h-[min(420px,60dvh)] overflow-y-auto p-1.5 ${headingClass}`}>
        <Command.Empty className="px-3 py-8 text-center text-ink-2">Nada encontrado. Tente outro nome.</Command.Empty>
        {search === '' && recentCmds.length > 0 ? (
          <Command.Group heading="Recentes">{recentCmds.map((c) => renderItem(c, 'recente '))}</Command.Group>
        ) : null}
        {groups.map((g) => (
          <Command.Group key={g.id} heading={g.heading}>
            {visible.filter((c) => c.group === g.id).map((c) => renderItem(c))}
          </Command.Group>
        ))}
        {ops.length > 0 ? (
          <Command.Group heading="Operadores">
            {ops.map((o) => (
              <Command.Item
                key={o.id}
                value={`${o.name} ${o.id}`}
                keywords={[o.id, 'operador']}
                onSelect={() => {
                  setOpen(false);
                  go(operatorPath(o.id));
                }}
                className={itemClass}
              >
                <span className="grid size-4 shrink-0 place-items-center text-2xs font-semibold text-ink-2" aria-hidden="true">
                  {o.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="flex-1 truncate">{o.name}</span>
                <span className="font-mono text-xs text-ink-3">{o.id}</span>
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}
      </Command.List>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-sunk px-3 py-2 text-xs text-ink-3">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> navegar
        </span>
        <span className="flex items-center gap-1">
          <Kbd>Enter</Kbd> abrir
        </span>
        <span className="flex items-center gap-1">
          <Kbd>Esc</Kbd> fechar
        </span>
      </div>
    </Command.Dialog>
  );
}
