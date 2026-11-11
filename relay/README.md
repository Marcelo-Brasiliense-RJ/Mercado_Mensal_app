# Ler a nota do RJ pelo QR (intermediário)

O site da SEFAZ-RJ bloqueia acesso vindo de servidor (Vercel, Supabase, nuvem). Do
celular ou de casa ele abre normal. O app então pede a página por um **intermediário**
com internet brasileira comum, e o resto (ler itens, conferir com o carrinho) é no app.

Nos dois caminhos, o app precisa de duas variáveis na Vercel (Settings → Environment
Variables), e de um novo deploy depois de salvar:

| Variável | Valor |
|---|---|
| `NFCE_RELAY_URL` | endereço do intermediário |
| `NFCE_RELAY_SECRET` | um segredo longo, o mesmo configurado no intermediário |

Sem essas variáveis o app continua como hoje: lê o QR, guarda a chave e pede a foto.

## Caminho 1: n8n (teste de 5 minutos)

1. No n8n, **Import from file** → `n8n/relay-nfce.json`.
2. No nó **Segredo e endereço ok?**, troque `TROQUE-PELO-SEGREDO-LONGO` pelo seu segredo.
3. Ative o workflow. O endereço é `https://SEU-N8N/webhook/nfce-relay`.
4. Teste com o link de uma nota (o que está no QR do cupom):

```bash
curl -s -X POST https://SEU-N8N/webhook/nfce-relay -H "content-type: application/json" -H "x-relay-secret: SEU-SEGREDO" -d '{"url":"COLE-O-LINK-DO-QR"}' | head -c 400
```

- Veio HTML com os itens (`tabResult`)? Funciona: configure as variáveis na Vercel.
- Veio "As operadoras de telecomunicação..."? O IP do servidor do n8n também é
  bloqueado: use o caminho 2.

## Caminho 2: um computador em casa

Precisa de Node 18+ e ficar ligado quando for ler nota.

```bash
NFCE_RELAY_SECRET=SEU-SEGREDO node relay/nfce-relay.mjs
```

Para o app (na Vercel) alcançar o seu computador, abra um túnel, por exemplo com o
Cloudflare Tunnel:

```bash
cloudflared tunnel --url http://localhost:8787
```

Ele mostra um endereço `https://....trycloudflare.com`: esse é o `NFCE_RELAY_URL`.
O túnel rápido muda de endereço quando reinicia; para fixo, crie um túnel nomeado
na conta Cloudflare.

## Segurança

- O intermediário só busca endereços de nota do governo (`*.fazenda.XX.gov.br`):
  não serve de proxy para outros sites.
- Sem o segredo certo ele recusa.
- Não guarda nada: só repassa a página.
