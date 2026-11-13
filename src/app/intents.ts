/**
 * "Intenções" por URL: a paleta de comandos, notificações e links internos
 * pedem uma ação a outra tela pela URL, sem importar o código dela.
 *
 * Cada tela dona da ação lê o parâmetro `acao` e o remove depois de executar
 * (setSearchParams com replace), para o voltar do navegador não repetir.
 */
export const INTENTS = {
  /** abre o editor da meta global (tela Metas) */
  metaGlobal: '/expedicao/metas?acao=meta-global',
  /** abre a agenda de metas (tela Metas) */
  agendaMetas: '/expedicao/metas?acao=agenda',
  /** novo operador (tela Operadores) */
  novoOperador: '/expedicao/operadores?acao=novo',
  /** exportar o período aberto (tela Relatórios) */
  exportarRelatorio: '/expedicao/relatorios?acao=exportar',
  /** convidar usuário (tela Usuários) */
  convidarUsuario: '/admin/usuarios?acao=convidar',
  /** parear uma TV (Configurações > Dispositivos) */
  parearTv: '/configuracoes/dispositivos?acao=parear',
} as const;

/** Detalhe de um operador. */
export const operatorPath = (id: string) => `/expedicao/operadores/${encodeURIComponent(id)}`;

/** Visão Geral com período escolhido. */
export const overviewPath = (range: 'hoje' | '7d' | '30d') => (range === 'hoje' ? '/expedicao' : `/expedicao?periodo=${range}`);
