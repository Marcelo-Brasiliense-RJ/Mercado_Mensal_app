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

## No app (aba Ofertas)

1. Aplicar no SQL Editor do Supabase, em ordem: `0037_monitor_promocoes.sql` e `0038_ofertas.sql`.
2. Variáveis do coletor: `SUPABASE_URL`, `SUPABASE_KEY` (service_role) e, para o comando `lista`, `PROMOCOES_CASA`.
3. Rodada da semana (coleta, IA, fotos e publicação):

       ./promocoes/rodar_semana.sh              # todos os mercados
       ./promocoes/rodar_semana.sh guanabara    # só um

   Chaves no ambiente: `GEMINI_API_KEY` (mais `_2`, `_3`: cada uma tem cota própria),
   `OPENROUTER_API_KEY`, `SUPABASE_URL` (ou a `NEXT_PUBLIC_SUPABASE_URL` do app) e
   `SUPABASE_SERVICE_ROLE_KEY`. A anon key do app não serve: publicar exige service_role.

Sem a 0038 aplicada, a aba mostra "As ofertas ainda não foram ligadas" e o resto do app segue igual.

### De olho e aviso no celular (0039)

- `0039_de_olho.sql`: lista "De olho" (⭐ nos cards ou "Ficar de olho" na aba Ofertas) e as
  inscrições de aviso. Sem ela, a seção não aparece.
- Aviso nativo (Web Push): no iPhone só com o app na Tela de Início (iOS 16.4+).
- Quem envia é o passo "Avisar no celular" do workflow (`promocoes avisar`), depois de publicar.
  Precisa do Secret `VAPID_PRIVATE_KEY` (par da chave pública em `web/src/lib/push.ts`).
  Sem ele o passo só avisa que pulou. Cada promoção avisa uma vez por produto.
