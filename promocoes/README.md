# Monitor de Promoções

Isolado do app: não toca em `web/` nem no Supabase.

## Protótipo visual (dados de exemplo)

    cd promocoes/prototipo
    python3 -m http.server 8080

Abrir http://localhost:8080

## Coletor (Fase 1)

Baixa o encarte vigente e gera uma imagem por página em `coletor/data/`.
- **Mundial:** baixa o PDF do encarte (vem no JSON da página) e gera uma imagem por página.
- **Superbom:** o site é loja online, então lê nome e preço direto, sem IA. Fixa a loja
  de Curicica (sem isso o site mostra Campos dos Goytacazes).

    cd promocoes/coletor
    uv run promocoes coletar          # todos os mercados com coletor
    uv run promocoes exportar         # leva as ofertas reais para o protótipo
    uv run pytest -q
