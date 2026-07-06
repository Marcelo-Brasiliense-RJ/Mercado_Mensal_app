# Dispensa (web)

Dashboard PWA mobile-first do projeto Mercado Mensal. Next.js (App Router) + Tailwind v4, reproduzindo o design `Dispensa.dc.html`.

## Telas
- Landing "Como usar"
- Estoque (busca, secoes Repor / No estoque, nivel por barra)
- Lista de compras (total a pagar, marcar comprado)
- Economia (economia vs historico, orcamento, gasto por mes)
- Familia / Configuracoes (codigo de convite, membros, tema)

Tema claro/escuro. Nesta fatia inicial as telas usam dados de exemplo (seed em `src/lib/seed.ts`). A ligacao com o Supabase (auth e-mail/senha, RLS por familia, leitura e escrita reais via RPCs `_web`) e a proxima fase, descrita em `../docs/superpowers/`.

## Desenvolvimento

```bash
cd web
npm install
cp .env.local.example .env.local   # preencher NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

App em http://localhost:3000.

## Deploy (Vercel)
- Projeto: `mercado-mensal-app`
- Root Directory: `web`
- Producao pela branch `main`
- Apenas a anon key no cliente (`NEXT_PUBLIC_*`); service_role nunca no navegador.

Contexto geral do projeto em `../CONTEXTO.md`. Design de origem: `Dispensa.dc.html`.
