# Hope SaaS · painel da liderança da expedição

> **Cópia pública de demonstração.** O código é o mesmo do sistema em uso na expedição da Hope Cirúrgica, publicado para consulta. Ficaram de fora a documentação interna de operação e segurança e qualquer dado real: nenhuma URL ou chave de banco acompanha o repositório, e os dados de exemplo são fictícios. Veja o sistema rodando em modo demonstração no [portfólio](https://gabeand.ia.br).

Painel que a liderança da expedição usa para acompanhar o dia: pedidos separados, ritmo de cada
operador contra a meta, previsão de término da fila e um Modo TV para o galpão. Lê os registros que a
[extensão das bancadas](https://github.com/gabenderf/upseller-extension-demo) grava a cada bipagem.

## O que tem de interessante

- **Ritmo com uma definição só**: o cálculo vive em um módulo puro e testado, e todas as telas
  importam a mesma função.
- **Segurança no banco, não na tela**: permissões por perfil impostas pelo Postgres (RLS), MFA
  obrigatório para administração e liderança e auditoria por trigger (`supabase/migrations`).
- **Modo TV sem login de pessoa**: a TV mostra um código, um administrador aprova e o aparelho
  entra com credencial própria, só de leitura e revogável.
- **Fonte de dados trocável**: uma variável de ambiente escolhe entre dados de demonstração gerados
  no navegador e o Supabase. Só três pastas falam com o banco, e o lint barra o resto.
- **Mais de 500 testes** (Vitest) e conferências de RLS e de pareamento em `scripts/`.

## Rodar em modo demonstração

```bash
npm install
npm run dev     # VITE_DATA_SOURCE=demo e VITE_AUTH_MODE=demo são o padrão (.env.example)
npm run check   # typecheck, lint, conferência de texto e testes
```

Stack: React 19, TypeScript, Vite, Tailwind, TanStack Query, Recharts, Supabase (Postgres, Auth, RLS) e Vitest.
