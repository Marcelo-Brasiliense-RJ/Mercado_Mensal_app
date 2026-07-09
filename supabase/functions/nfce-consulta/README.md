# nfce-consulta (Edge Function)

Lê uma NFC-e do RJ a partir da URL do QR code, puxa os itens da SEFAZ-RJ,
normaliza a descrição fiscal (nome genérico + marca) via Groq e valida o total.

## Estado

Código escrito, **ainda não verificado localmente** (a máquina não tinha `deno`
no momento da escrita e falta a fixture de HTML real). Para fechar o ciclo:

1. Instalar o Deno: <https://docs.deno.com/runtime/getting_started/installation/>
2. Capturar a fixture real (Task 2 do plano): escanear o QR de um cupom, abrir a
   URL no navegador, salvar o HTML em `fixtures/nfce-rj-sample.html`.
3. Rodar os testes:
   ```
   deno test --allow-read supabase/functions/nfce-consulta/parse_test.ts
   ```
   Sem a fixture, só os testes de `parseBrNumber` rodam; com ela, o teste do
   parser valida os itens. Ajustar os seletores em `parse.ts` se o RJ divergir.
4. Type check:
   ```
   deno check supabase/functions/nfce-consulta/index.ts
   ```

## Deploy

```
supabase secrets set GROQ_API_KEY=<chave-groq>
supabase functions deploy nfce-consulta
```

## Contrato

Entrada: `POST { "qr_url": "https://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode?p=..." }`

Saída ok:
```jsonc
{ "ok": true, "chave": "...", "emitente": "...", "total_nota": 0, "total_itens": 0,
  "total_confere": true,
  "itens": [ { "nome": "sabonete", "marca": "francis", "qtd": 1, "preco": 3.99,
              "unidade": "un", "desc_fiscal": "SABONETE FRANCIS ..." } ] }
```
Erros: `qr_invalido`, `sefaz_indisponivel`, `parse_falhou`, `total_nao_confere`,
`captcha_detectado`.

## Arquivos

- `parse.ts` — parser puro do HTML (sem rede), testável por fixture.
- `normalize.ts` — normalização via Groq (só nome/marca; números vêm da SEFAZ).
- `index.ts` — handler HTTP: fetch SEFAZ + parse + normalize + validação de total.
- `parse_test.ts` — testes (parseBrNumber sempre; fixture quando presente).
