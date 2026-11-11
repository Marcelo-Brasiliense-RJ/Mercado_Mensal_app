# Fluxos do n8n

Importar no n8n: **Create workflow ▸ ⋯ ▸ Import from File**. Todos vêm desligados.

| Arquivo | Fluxo | O que faz |
|---|---|---|
| `assistente-dispensa.json` | 1. Assistente de Dispensa (Telegram) | Bot: áudio/texto/foto → IA → Supabase |
| `baixa-diaria.json` | 2. Baixa diária do estoque | Todo dia 4h (Rio) chama `mercado_daily_depletion` |
| `ocr-nota-web.json` | 3. Ler nota por foto (app web) | Webhook que o app chama em `/api/receipt-ocr`; lê a foto com Groq (3 chaves em cascata) |

## Credenciais (criar no n8n, nunca em arquivo)

| Nome | Tipo | Valor |
|---|---|---|
| Supabase (service_role) | Custom Auth | `{"headers":{"apikey":"<service_role>","Authorization":"Bearer <service_role>"}}` |
| Groq Transcricao 1, 2, 3 | Header Auth | `Authorization` = `Bearer <chave Groq>` |
| Segredo OCR nota (x-receipt-secret) | Header Auth | `x-receipt-secret` = um segredo inventado por você |
| Bot Telegram | Telegram API | token do BotFather (só fluxo 1) |

Depois de importar, abra cada nó com aviso vermelho e escolha a credencial.

## Ligar o fluxo 3 no app

Na Vercel (variáveis do projeto `web`):

- `N8N_RECEIPT_WEBHOOK_URL` = `https://<seu-n8n>/webhook/mercado-nota-ocr`
- `N8N_RECEIPT_SECRET` = o mesmo segredo da credencial acima

## Cuidado

A baixa diária **não pode rodar duas vezes no mesmo dia** (desconta em dobro). Não ligue retry nela
nem a execute à mão depois que já rodou.
