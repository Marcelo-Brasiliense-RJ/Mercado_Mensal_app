# Mercado Mensal - Contexto do projeto (handoff)

Documento para retomar o trabalho em qualquer sessão (VS Code, Claude Code, etc).
Atualizado ao final da sessão de planejamento e construção do backend.

---

## 1. O que é

App para controlar a dispensa e as compras do mês da casa, operado principalmente
por voz no Telegram, com um painel web mobile-first. O usuário manda um áudio
("comprei arroz 5 reais, dois pacotes"), o sistema transcreve, entende a intenção e
atualiza estoque, lista de compras, histórico de preços e economia.

---

## 2. Decisões travadas

| Tema | Decisão |
| --- | --- |
| Canal principal | Telegram (WhatsApp fica para fase 2) |
| IA / custo | Sem mensalidade: Groq (transcrição e LLM), NVIDIA e OpenRouter disponíveis |
| Transcrição | Groq Whisper (whisper-large-v3), pt-BR |
| Interpretação | LLM via agente conversacional (Groq llama-3.3-70b) |
| Orquestração | n8n (instância braziotech-n8n.cloudfy.live) |
| Banco | Supabase (Postgres) - projeto dedicado |
| Estilo do bot | Assistente conversacional com memória, tom amigável e breve, confirma só quando está incerto |
| Estoque | Nível genérico de produto (marca é detalhe da compra) |
| Baixa de estoque | Estimativa automática (job diário) + conferência por voz que sobrescreve e recalibra a taxa |
| Alerta "já tenho" | Só avisa se estoque acima do nível normal |
| Economia | Duas visões: vs histórico de preço e vs orçamento mensal |
| Ciclo | Mensal |
| Multi-família | Cada família tem sua dispensa; entra-se por código de convite |
| Login web | E-mail e senha (Supabase Auth) |
| Convite | Web e Telegram |
| Primeira dispensa | Duas opções no onboarding, padrão "primeira compra do mês monta o estoque" |
| Dashboard | Web App PWA mobile-first, sem loja de app; Telegram leva ao mesmo painel |
| Visão | Cada usuário só vê a própria família |

---

## 3. Arquitetura

```
Telegram (audio e texto)
   -> n8n (workflow "Assistente de Dispensa")
        -> Groq Whisper (transcricao)
        -> Agente LLM (Groq) com memoria por chat_id
        -> decide acao e chama RPC no Supabase
        -> responde no chat de forma conversacional
Supabase (Postgres + Auth + RLS)  <-  Web App PWA (dashboard mobile-first)
```

Toda a regra de negócio vive em funções SQL no Supabase (RPC). O n8n e o app só chamam.

---

## 4. Estado atual

### Feito
- Modelo de dados completo no Supabase (migrations 0001, 0002, 0003 aplicadas).
- Regras de negócio como funções SQL: compra, conferência, lista, consumo, baixa diária, criar/entrar família, dispatcher.
- Multi-família com convite e RLS por família.
- Workflow do n8n reconstruído como assistente conversacional com memória (validado, 0 erros). ID: `al56Kfii1scgHOCv`.
- Repositório GitHub com README de demonstração.

### Pendente
1. Rodar a migration **0004_dispatch.sql** no Supabase (as 0001-0003 já foram aplicadas; a 0004 ainda não).
2. Plugar credenciais no n8n e ativar o workflow (ver seção 6).
3. Testar o bot ponta a ponta (primeiro áudio real revela ajustes de prompt e transcrição).
4. Implementar o dashboard web a partir do `Dispensa.dc.html` (ver seção 7).
5. Onboarding da primeira dispensa (as duas opções).
6. Workflow 2: job diário chamando `mercado_daily_depletion` (n8n Schedule Trigger).
7. Fase 2: canal WhatsApp.

---

## 5. Recursos e endereços

- Supabase (projeto dedicado): `https://eqguqkojztovfoafjqji.supabase.co`
  - Banco direto (para memória do n8n): host `db.eqguqkojztovfoafjqji.supabase.co`, porta 5432, database `postgres`, usuário `postgres`.
- n8n: `https://braziotech-n8n.cloudfy.live` (MCP conectado como `n8n-prod-SA`).
  - Workflow: `Mercado_app — 1. Assistente de Dispensa (Telegram)`, ID `al56Kfii1scgHOCv`.
- Bot Telegram: `@Mercado_cellks_bot`.
- GitHub: `https://github.com/Marcelo-Brasiliense-RJ/Mercado_Mensal_app`.

---

## 6. Credenciais a configurar no n8n

Nada de segredo em arquivo ou no chat. Tudo no cofre de credenciais do n8n.

| Credencial | Tipo | Nós que usam |
| --- | --- | --- |
| Bot Telegram | Telegram API | Telegram Trigger, Resp. criar, Resp. entrar, Responder |
| Groq (modelo) | Groq API | Groq Model |
| Groq (transcrição) | Header Auth (`Authorization` = `Bearer <chave>`) | Transcrever (Groq) |
| Supabase | Custom Auth (`apikey` + `Authorization` com service_role) | Aplicar, Criar família, Entrar família |
| Postgres (memória) | Postgres apontando para o banco do Supabase | Memoria |

Depois: rodar 0004, ligar as credenciais, ativar o workflow (toggle Active registra o webhook).

Teste: `/start` ou "oi" -> instruções; "criar família Casa" -> devolve código; áudio "comprei arroz 5 reais dois pacotes" -> confirma e grava.

---

## 7. Dashboard web (próximo grande passo)

O design foi feito no Claude Design (arquivo `Dispensa.dc.html`, mobile-first, tema claro/escuro).
Não consegui puxar o arquivo automaticamente (o Claude Design exige login interativo).

Para continuar:
1. Exporte/baixe o `Dispensa.dc.html` do Claude Design e salve em `web/Dispensa.dc.html`.
2. Implementar significa transformar a maquete em app real:
   - Base visual a partir do HTML/CSS do design.
   - Login e-mail/senha via Supabase Auth.
   - Ler estoque, lista e economia do Supabase respeitando o RLS por família (funções `mercado_my_household`, e leitura das tabelas).
   - Telas: Estoque, Lista de compras (com total a pagar), Economia; landing "Como usar"; criar/entrar família com código.
   - PWA mobile-first (manifest + instalável). Deploy na Vercel.

Stack recomendada: **Next.js (App Router) + Supabase JS**, por causa de auth, rotas e crescimento.
Alternativa mais simples: HTML/CSS/JS puro + Supabase JS (deploy estático).

Chaves para o app web: use a **anon key** do Supabase no cliente (o RLS protege por família). Nunca use a service_role no navegador.

---

## 8. Segurança (importante)

Foram coladas chaves no chat durante a construção. **Rotacione** antes de ir a produção:
- Token do bot Telegram (BotFather `/revoke`).
- Chaves Groq, OpenRouter e NVIDIA.
Depois, segredos só em cofre do n8n e em variáveis de ambiente da Vercel.

---

## 9. Estrutura do repositório

```
supabase/migrations/
  0001_init.sql          Tabelas base
  0002_functions.sql     Regras de negocio (RPC)
  0003_multitenant.sql   Multi-familia, convite e RLS
  0004_dispatch.sql      Funcao despachante por intencao
web/                     Dashboard web (a implementar; coloque Dispensa.dc.html aqui)
README.md                Apresentacao do projeto
CONTEXTO.md              Este documento
```

O workflow do n8n vive na instância. Para versionar, exporte o JSON e salve em `n8n/`.
