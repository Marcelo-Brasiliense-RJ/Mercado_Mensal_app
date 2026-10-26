# Monitor de Promoções

Isolado do app: não toca em `web/` nem no Supabase.

## Protótipo visual (dados de exemplo)

    cd promocoes/prototipo
    python3 -m http.server 8080

Abrir http://localhost:8080

## Coletor (Fase 1)

Baixa o encarte vigente e gera uma imagem por página em `coletor/data/`.
Hoje cobre o Mundial (site em Next.js, o PDF vem no JSON da página).

    cd promocoes/coletor
    uv run promocoes coletar          # todos os mercados com coletor
    uv run pytest -q
