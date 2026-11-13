import type { ColumnDef, RowSelectionState } from '@tanstack/react-table';
import { Activity, Bell, Download, Lock, Moon, PackageCheck, Plus, RefreshCw, Search, Settings, Sun, Trash2, Users } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useUiStore } from '@/app/ui-store';
import { BarCompareChart, DayLine, Delta, Meter, MiniBars, Sparkline } from '@/components/charts';
import { DataTable, KpiCard } from '@/components/data';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTrigger,
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Field,
  IconButton,
  InfoTip,
  Input,
  Kbd,
  Notice,
  PageHeader,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RadioGroup,
  RadioItem,
  SegmentedControl,
  Select,
  Sheet,
  SheetContent,
  SheetTrigger,
  Skeleton,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
  toast,
} from '@/components/ui';

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-md">{title}</h2>
      {description && <p className="mb-3 text-ink-3">{description}</p>}
      <div className={description ? '' : 'mt-3'}>{children}</div>
    </section>
  );
}

const Row = ({ children, label }: { children: ReactNode; label?: string }) => (
  <div className="mb-3">
    {label && <p className="mb-1.5 text-xs text-ink-3">{label}</p>}
    <div className="flex flex-wrap items-center gap-2">{children}</div>
  </div>
);

/* Dados fictícios */
const HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
const hourly = HOURS.map((h, i) => {
  const cur = [38, 92, 118, 126, 104, 61, 88, 121, 109, 74, null, null, null][i] ?? null;
  return {
    label: `${String(h).padStart(2, '0')}h`,
    value: cur,
    compare: [30, 80, 105, 119, 110, 58, 83, 99, 101, 88, 70, 44, 20][i],
    partial: h === 16,
  };
});
const days = ['qui', 'sex', 'sáb', 'seg', 'ter', 'qua', 'hoje'].map((label, i) => ({ label, value: [840, 910, 410, 1150, 980, 905, 620][i]! }));

interface Op {
  id: string;
  name: string;
  orders: number;
  rate: number | null;
  goal: number;
  mixed: number;
}
const OPS: Op[] = [
  { id: '1', name: 'Larissa Mendonça', orders: 248, rate: 41.2, goal: 35, mixed: 12 },
  { id: '2', name: 'Bruno Tavares', orders: 201, rate: 33.5, goal: 35, mixed: 8 },
  { id: '3', name: 'Camila Rocha', orders: 176, rate: 27.1, goal: 35, mixed: 21 },
  { id: '4', name: 'Diego Paiva', orders: 0, rate: null, goal: 35, mixed: 0 },
];
const opColumns: ColumnDef<Op>[] = [
  {
    accessorKey: 'name',
    header: 'Operador',
    sortDescFirst: false,
    cell: ({ row }) => (
      <span className="flex items-center gap-2">
        <Avatar name={row.original.name} />
        <b className="font-medium">{row.original.name}</b>
      </span>
    ),
  },
  { accessorKey: 'orders', header: 'Pedidos', meta: { align: 'right' } },
  {
    accessorKey: 'rate',
    header: 'Ritmo',
    cell: ({ row }) => <Meter value={row.original.rate} goal={row.original.goal} />,
  },
  { accessorKey: 'mixed', header: 'Mistos', meta: { align: 'right' } },
];

export default function UiGuidePage() {
  const { theme, setTheme } = useUiStore();
  const dark = theme === 'dark';
  const [seg, setSeg] = useState('hoje');
  const [sel, setSel] = useState<RowSelectionState>({});
  const [kpi, setKpi] = useState('pedidos');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [menuDensity, setMenuDensity] = useState('comfortable');
  const [showMixed, setShowMixed] = useState(true);
  const [tableState, setTableState] = useState<'ok' | 'loading' | 'empty'>('ok');

  return (
    <div className="mx-auto max-w-[1100px] p-4 sm:p-6">
      <PageHeader
        title="Guia de componentes"
        breadcrumbs={[{ label: 'Desenvolvimento' }, { label: 'Guia de componentes' }]}
        meta="Dados fictícios"
        actions={
          <Button
            icon={dark ? <Sun /> : <Moon />}
            onClick={() => setTheme(dark ? 'light' : 'dark')}
            aria-label={dark ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
          >
            {dark ? 'Tema claro' : 'Tema escuro'}
          </Button>
        }
      />

      <Section title="Botões" description="Variantes, tamanhos e estados. Pressionar desloca 1px.">
        <Row label="Variantes">
          <Button variant="primary">Salvar</Button>
          <Button>Secundário</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger" icon={<Trash2 />}>
            Remover
          </Button>
        </Row>
        <Row label="Tamanhos">
          <Button size="sm">Pequeno 26</Button>
          <Button size="md">Médio 30</Button>
          <Button size="lg" variant="primary">
            Grande 36
          </Button>
          <IconButton aria-label="Atualizar" variant="secondary">
            <RefreshCw />
          </IconButton>
        </Row>
        <Row label="Estados: com ícone, carregando, desabilitado, sem permissão (aria-disabled)">
          <Button icon={<Download />}>Exportar</Button>
          <Button variant="primary" loading>
            Salvando
          </Button>
          <Button disabled>Desabilitado</Button>
          <Button
            aria-disabled="true"
            icon={<Lock />}
            onClick={() => toast('Seu perfil é Leitura. Alterar meta exige perfil Administrador.')}
          >
            Alterar meta
          </Button>
        </Row>
      </Section>

      <Section title="Campos">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome do operador" help="Como aparece no ranking." required>
            <Input placeholder="Ex.: Larissa" />
          </Field>
          <Field label="Meta por hora" error="Precisa ser um número inteiro entre 1 e 200.">
            <Input defaultValue="350" inputMode="numeric" />
          </Field>
          <Field label="Perfil">
            <Select
              placeholder="Escolha o perfil"
              options={[
                { value: 'admin', label: 'Administrador' },
                { value: 'lider', label: 'Líder' },
                { value: 'leitura', label: 'Leitura' },
                { value: 'x', label: 'Indisponível', disabled: true },
              ]}
            />
          </Field>
          <Field label="Campo desabilitado">
            <Input disabled defaultValue="Somente leitura" />
          </Field>
          <Field label="Observação" className="sm:col-span-2">
            <Textarea placeholder="Opcional" />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-start gap-8">
          <div className="grid gap-2">
            <label className="flex items-center gap-2">
              <Checkbox defaultChecked /> Marcado
            </label>
            <label className="flex items-center gap-2">
              <Checkbox checked="indeterminate" /> Parcial
            </label>
            <label className="flex items-center gap-2 text-ink-3">
              <Checkbox disabled /> Desabilitado
            </label>
          </div>
          <div className="grid gap-2">
            <label className="flex items-center gap-2">
              <Switch defaultChecked /> Notificações
            </label>
            <label className="flex items-center gap-2 text-ink-3">
              <Switch disabled /> Desabilitado
            </label>
          </div>
          <RadioGroup defaultValue="a" aria-label="Comparar com">
            <label className="flex items-center gap-2">
              <RadioItem value="a" /> Semana passada
            </label>
            <label className="flex items-center gap-2">
              <RadioItem value="b" /> Ontem
            </label>
          </RadioGroup>
          <SegmentedControl
            aria-label="Período"
            value={seg}
            onValueChange={setSeg}
            options={[
              { value: 'hoje', label: 'Hoje' },
              { value: '7d', label: '7 dias' },
              { value: 'mes', label: 'Mês' },
            ]}
          />
        </div>
      </Section>

      <Section title="Selos, avisos e estados">
        <Row label="Badge">
          <Badge>Neutro</Badge>
          <Badge tone="accent">Selecionado</Badge>
          <Badge tone="ok" icon={<PackageCheck />}>
            No alvo
          </Badge>
          <Badge tone="warn">Abaixo da meta</Badge>
          <Badge tone="crit">Sem conexão</Badge>
          <Kbd>Ctrl K</Kbd>
          <Avatar name="Ana Lima" size="sm" />
          <Avatar name="Bruno Tavares" />
          <Avatar name="Camila Rocha" size="lg" />
        </Row>
        <div className="grid gap-2">
          <Notice title="Dia de fila curta">Todo mundo cai junto quando falta pedido na fila. Ritmo mede volume também.</Notice>
          <Notice tone="ok" title="Meta salva">A meta global vale para todos até ser removida.</Notice>
          <Notice tone="warn" title="Sem coleta de dados há 2 horas" action={<Button size="sm">Ver detalhes</Button>}>
            Confira se o computador da expedição está ligado.
          </Notice>
          <Notice tone="crit" title="Sem conexão com o banco">
            Os números abaixo podem estar desatualizados.
          </Notice>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Card>
            <CardHeader title="Carregando" description="Esqueleto com o formato final" />
            <CardBody className="grid gap-2" aria-busy="true">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </CardBody>
          </Card>
          <Card>
            <EmptyState
              icon={<Activity />}
              title="Nenhuma bipagem hoje"
              description="Os pedidos aparecem aqui assim que a extensão do UpSeller registrar a primeira bipagem do dia."
              action={<Button size="sm">Ver ontem</Button>}
            />
          </Card>
          <Card>
            <EmptyState
              icon={<RefreshCw />}
              title="Não foi possível carregar"
              description="A leitura do banco falhou. Seus dados não foram alterados."
              action={<Button size="sm" icon={<RefreshCw />}>Tentar de novo</Button>}
            />
          </Card>
          <Card>
            <EmptyState
              icon={<Lock />}
              title="Você não tem acesso a esta área"
              description="Precisa do perfil Administrador. Peça a quem gerencia os usuários."
            />
          </Card>
        </div>
      </Section>

      <Section title="Cartão">
        <Card>
          <CardHeader title="Pedidos por hora" description="Hoje contra a semana passada" actions={<Button size="sm">Exportar</Button>} />
          <CardBody>Conteúdo do cartão. Borda no lugar de sombra.</CardBody>
          <CardFooter>Atualizado há 12 s</CardFooter>
        </Card>
      </Section>

      <Section title="Camadas" description="Tudo que abre vem do Radix: foco preso, Esc fecha, devolve o foco.">
        <Row>
          <Tooltip content="Atualizar dados agora">
            <IconButton aria-label="Atualizar" variant="secondary">
              <RefreshCw />
            </IconButton>
          </Tooltip>
          <InfoTip label="Ritmo" definition="Pedidos divididos pelas horas de turno, contadas a partir do login." source="pedidos_separados" />
          <Popover>
            <PopoverTrigger asChild>
              <Button>Popover</Button>
            </PopoverTrigger>
            <PopoverContent>Texto de apoio curto, que abre ao clicar ou tocar.</PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button icon={<Settings />}>Menu</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Exibir</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={showMixed} onCheckedChange={setShowMixed}>
                Pedidos mistos
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Densidade</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={menuDensity} onValueChange={setMenuDensity}>
                <DropdownMenuRadioItem value="comfortable">Confortável</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="compact">Compacta</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={<Download />} shortcut="Ctrl E">
                Exportar CSV
              </DropdownMenuItem>
              <DropdownMenuItem icon={<Trash2 />} disabled disabledReason="Seu perfil é Leitura. Precisa de Administrador.">
                Remover operador
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Dialog>
            <DialogTrigger asChild>
              <Button>Diálogo</Button>
            </DialogTrigger>
            <DialogContent
              title="Meta global do dia"
              description="Vale para todos os operadores até ser removida."
              footer={
                <>
                  <DialogClose asChild>
                    <Button>Cancelar</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button variant="primary" onClick={() => toast.success('Meta global salva.')}>
                      Salvar
                    </Button>
                  </DialogClose>
                </>
              }
            >
              <Field label="Meta por hora" help="Número inteiro entre 1 e 200.">
                <Input defaultValue="35" inputMode="numeric" />
              </Field>
            </DialogContent>
          </Dialog>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="danger">Confirmação</Button>
            </AlertDialogTrigger>
            <AlertDialogContent
              title="Remover Diego Paiva?"
              description="O histórico de pedidos dele continua nos relatórios."
              confirmLabel="Remover"
              danger
              onConfirm={() => toast.undoable('Diego Paiva removido.', () => {
                toast('Remoção desfeita.');
              })}
            />
          </AlertDialog>
          <Sheet>
            <SheetTrigger asChild>
              <Button>Painel lateral</Button>
            </SheetTrigger>
            <SheetContent title="Larissa Mendonça" description="Bancada 2 · ativa" header={<Avatar name="Larissa Mendonça" size="lg" />}>
              <MiniBars data={days} aria-label="Pedidos por dia, últimos 7 dias" />
              <Meter value={41.2} goal={35} />
            </SheetContent>
          </Sheet>
        </Row>
        <Row label="Avisos (toast)">
          <Button onClick={() => toast('Filtro aplicado.')}>Simples</Button>
          <Button onClick={() => toast.success('Operador salvo.')}>Sucesso</Button>
          <Button onClick={() => toast.error('Não foi possível salvar.')}>Erro</Button>
          <Button onClick={() => toast.undoable('Meta de Larissa: 35 para 40/h.', () => {
                toast('Meta restaurada.');
              })}>Com desfazer</Button>
        </Row>
        <Tabs defaultValue="a" className="mt-2">
          <TabsList>
            <TabsTrigger value="a">Visão geral</TabsTrigger>
            <TabsTrigger value="b">Por hora</TabsTrigger>
            <TabsTrigger value="c" disabled>
              Desabilitada
            </TabsTrigger>
          </TabsList>
          <TabsContent value="a">Conteúdo da primeira aba.</TabsContent>
          <TabsContent value="b">Conteúdo da segunda aba.</TabsContent>
        </Tabs>
      </Section>

      <Section title="Indicadores" description="KpiCard selecionável, estado carregando e variação sem cor para métrica neutra.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Pedidos"
            icon={<PackageCheck />}
            info={{ definition: 'Pedidos bipados no período.', source: 'pedidos_separados' }}
            value="1.284"
            spark={[420, 610, 580, 820, 910, 1010, 1284]}
            compare={{ text: 'vs. 999', delta: { value: 28.5 } }}
            selected={kpi === 'pedidos'}
            onSelect={() => setKpi('pedidos')}
          />
          <KpiCard
            label="Ritmo médio"
            icon={<Activity />}
            info={{ definition: 'Média simples dos ritmos individuais.', source: 'logs_acesso' }}
            value="34,2"
            unit="/h"
            spark={[30, 33, 29, 35, 36, 31, 34]}
            compare={{ text: 'vs. 37,1/h', delta: { value: -7.8 } }}
            selected={kpi === 'ritmo'}
            onSelect={() => setKpi('ritmo')}
          />
          <KpiCard
            label="Pedidos mistos"
            icon={<Users />}
            value="17,3"
            unit="%"
            compare={{ text: 'vs. 15,9%', delta: { value: 1.4, kind: 'points', tone: 'none' } }}
            selected={kpi === 'mistos'}
            onSelect={() => setKpi('mistos')}
          />
          <KpiCard label="Carregando" loading value="" />
        </div>
        <Row label="Peças pequenas: Sparkline, Delta, Meter, DayLine">
          <Sparkline values={[3, 5, 4, 8, 7, 9]} />
          <Sparkline values={[3, 5, 4, 8, 7, 9]} highlight />
          <Delta value={12.4} />
          <Delta value={-6} />
          <Delta value={0.1} />
          <Delta value={null} />
          <Delta value={1.4} kind="points" tone="none" />
          <Delta value={-2} kind="absolute" />
        </Row>
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <div className="grid gap-3">
            <Meter value={41.2} goal={35} />
            <Meter value={32} goal={35} />
            <Meter value={21} goal={35} />
            <Meter value={null} goal={35} />
            <div className="flex gap-4">
              <Meter variant="mini" value={41.2} goal={35} />
              <Meter variant="mini" value={21} goal={35} />
            </div>
          </div>
          <div className="grid content-start gap-4">
            <DayLine realized={620} expected={540} />
            <DayLine realized={380} expected={540} />
            <MiniBars data={days} aria-label="Pedidos por dia, últimos 7 dias" />
          </div>
        </div>
      </Section>

      <Section title="Gráfico de barras por hora" description="Barra clara é a hora em andamento; tracejada é a semana passada; horas futuras ficam vazias.">
        <Card>
          <CardHeader title="Pedidos por hora" description="Hoje contra a semana passada" />
          <CardBody>
            <BarCompareChart
              data={hourly}
              valueLabel="Hoje"
              compareLabel="Semana passada"
              goal={110}
              goalLabel="Meta da equipe"
              summary="Pedidos por hora, de 07h a 19h, hoje contra a semana passada. Pico de 126 pedidos às 10h."
            />
          </CardBody>
        </Card>
      </Section>

      <Section title="Tabela de dados" description="Ordene pelo cabeçalho, selecione linhas, clique ou use Enter na linha. Abaixo de 768px vira lista de cards.">
        <Row>
          <SegmentedControl
            aria-label="Estado da tabela"
            value={tableState}
            onValueChange={(v) => setTableState(v as typeof tableState)}
            options={[
              { value: 'ok', label: 'Com dados' },
              { value: 'loading', label: 'Carregando' },
              { value: 'empty', label: 'Vazia' },
            ]}
          />
          <SegmentedControl
            aria-label="Densidade"
            value={density}
            onValueChange={(v) => setDensity(v as typeof density)}
            options={[
              { value: 'comfortable', label: 'Confortável' },
              { value: 'compact', label: 'Compacta' },
            ]}
          />
        </Row>
        <Card>
          <DataTable
            aria-label="Operadores de exemplo"
            data={tableState === 'empty' ? [] : OPS}
            columns={opColumns}
            getRowId={(r) => r.id}
            loading={tableState === 'loading'}
            density={density}
            selectable
            rowSelection={sel}
            onRowSelectionChange={setSel}
            onRowClick={(r) => toast(`Abrir ${r.name}`)}
            empty={<EmptyState icon={<Search />} title="Nenhum operador" description="Cadastre operadores na área de gestão para vê-los aqui." />}
            footer={
              <>
                <span>4 operadores</span>
                <span className="tabular ml-auto">
                  Total <b className="font-semibold text-ink">625</b> pedidos
                </span>
              </>
            }
            bulkActions={() => (
              <>
                <Button size="sm" icon={<Download />}>
                  Exportar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSel({})}>
                  Limpar seleção
                </Button>
              </>
            )}
            renderMobileCard={(r) => (
              <div className="grid gap-2">
                <span className="flex items-center gap-2">
                  <Avatar name={r.name} />
                  <b className="font-medium">{r.name}</b>
                  <span className="tabular ml-auto font-semibold">{r.orders}</span>
                </span>
                <Meter value={r.rate} goal={r.goal} />
              </div>
            )}
          />
        </Card>
      </Section>

      <Section title="Ícones e notificações">
        <Row>
          <IconButton aria-label="Notificações" variant="secondary">
            <Bell />
          </IconButton>
          <IconButton aria-label="Novo operador" variant="secondary">
            <Plus />
          </IconButton>
        </Row>
      </Section>
    </div>
  );
}
