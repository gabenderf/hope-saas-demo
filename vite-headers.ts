import type { Plugin } from 'vite';

/**
 * Gera o `_headers` do Cloudflare Pages no build (docs/seguranca.md §10.1).
 *
 * Por que gerado e não um arquivo em `public/`: a CSP precisa do endereço do
 * projeto Supabase, e ele não deve ficar gravado no git (nem nas cópias públicas
 * do repositório). Ele vem da `VITE_SUPABASE_URL`, que já está no ambiente de build.
 *
 * Também impede a publicação dos `.map` (o código-fonte e os comentários sairiam junto):
 * - grava um `.assetsignore` com `*.map`, que o `wrangler deploy` respeita (Workers);
 * - apaga os `.map` quando o build roda na Cloudflare (`WORKERS_CI=1` no Workers Builds,
 *   `CF_PAGES=1` no Pages). Fora dela, o build local continua gerando os mapas.
 */
export function cabecalhosCloudflare(supabaseUrl: string | undefined): Plugin {
  return {
    name: 'hope-cabecalhos-cloudflare',
    apply: 'build',
    generateBundle(_opcoes, bundle) {
      this.emitFile({ type: 'asset', fileName: '_headers', source: montarCabecalhos(supabaseUrl) });

      this.emitFile({ type: 'asset', fileName: '.assetsignore', source: '*.map\n' });

      if (process.env.WORKERS_CI === '1' || process.env.CF_PAGES === '1') {
        for (const nome of Object.keys(bundle)) {
          if (nome.endsWith('.map')) delete bundle[nome];
        }
      }
    },
  };
}

export function montarCabecalhos(supabaseUrl: string | undefined): string {
  const conexoes = ["'self'"];
  if (supabaseUrl) {
    const origem = new URL(supabaseUrl);
    if (origem.protocol !== 'https:') {
      throw new Error('VITE_SUPABASE_URL precisa ser https para gerar a CSP de produção.');
    }
    // Erro real de 10/11/2026: colaram o endereço do painel (supabase.com/dashboard/project/...)
    // e a CSP saiu liberando supabase.com, com o app sem conseguir falar com o banco.
    if (origem.hostname === 'supabase.com' || origem.hostname.endsWith('.supabase.com') || origem.pathname !== '/') {
      throw new Error(
        'VITE_SUPABASE_URL deve ser o endereço da API do projeto (https://<id>.supabase.co, sem caminho), ' +
          'não o do painel do Supabase.',
      );
    }
    conexoes.push(origem.origin, `wss://${origem.host}`);
  }

  const csp = [
    "default-src 'none'",
    "script-src 'self' https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${conexoes.join(' ')}`,
    'frame-src https://challenges.cloudflare.com',
    "manifest-src 'self'",
    "worker-src 'self'",
    "form-action 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');

  return [
    '/*',
    `  Content-Security-Policy: ${csp}`,
    // Sem `preload` por enquanto: só entra depois de confirmar HTTPS em todo
    // subdomínio de hopecirurgica.com.br (§10, tabela "Por que cada item").
    '  Strict-Transport-Security: max-age=63072000; includeSubDomains',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Permissions-Policy: fullscreen=(self), screen-wake-lock=(self), camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), browsing-topics=()',
    '  Cross-Origin-Opener-Policy: same-origin',
    '  Cross-Origin-Resource-Policy: same-origin',
    '  X-Frame-Options: DENY',
    '',
    '/index.html',
    '  Cache-Control: no-cache',
    '',
    '/assets/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
  ].join('\n');
}
