# Importar compra pela NFC-e (QR code da nota) — Design

Data: 2026-07-08
Autor: sessão de brainstorming (Marcelo + Claude Code)
Status: aprovado para virar plano de implementação

## 1. Problema

Hoje registrar uma compra pela nota exige fotografar item a item, ou uma sequência
de fotos de um cupom que pode ter mais de um metro. É lento e o OCR erra em papel
térmico apagado. O cupom que os mercados emitem é uma NFC-e (Nota Fiscal de
Consumidor Eletrônica): tem QR code e chave de acesso de 44 dígitos. Dá para
escanear só o QR (uma área pequena, uma tomada) e puxar a lista de itens já
estruturada da SEFAZ, em vez de ler a nota inteira por imagem.

## 2. Decisões travadas (do brainstorming)

| Tema | Decisão |
| --- | --- |
| Onde roda | Nos dois canais: app web e Telegram (lógica de consulta compartilhada) |
| Estados | Só RJ. Foco 100% no portal da SEFAZ-RJ |
| Abordagem | QR + consulta SEFAZ-RJ + normalização por LLM. Telegram reusa o rascunho/revisão/confirmação da 0005; web faz revisão client-side e grava por RPC nova. Os dois convergem no mesmo miolo de aplicar compra. OCR atual vira fallback automático |
| Faseamento | Fase 1 = web (o `ReceiptModal` já está stubado esperando isso). Fase 2 = Telegram |
| Serviço compartilhado | Supabase Edge Function `nfce-consulta` (Deno/TS) |
| Custo | Sem mensalidade. Groq no free tier para normalização. API paga (Infosimples) fica como opção futura, não agora |

## 3. Realidade técnica confirmada (SEFAZ-RJ)

- URL do QR (desde 19/12/2023): `https://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode?p=<chave>|<versão>|<ambiente>|...|<hash>`.
- O link do QR é assinado por hash. A página que exige CAPTCHA é a de digitação
  manual da chave (`consultaChaveAcesso.faces`), não o caminho do QR. Existem
  ferramentas que baixam NFC-e do RJ em lote sem CAPTCHA, o que reforça que o
  caminho autenticado por hash não pede CAPTCHA.
- O QR sozinho não traz os itens (só chave, versão, ambiente, data, total, hash).
  Os itens vêm da requisição à página da SEFAZ, que lista tudo estruturado.
- Libs existentes fazem esse scraping por estado (ex.: `nfceget`, para PR).
  Nenhuma pronta para RJ; o parser do RJ será escrito neste projeto.
- Risco principal: o HTML da SEFAZ-RJ pode mudar e quebrar o parser. Mitigado com
  checagem soma-dos-itens × total e fallback para OCR.

Fontes: portal.fazenda.rj.gov.br/dfe, invoisys (URLs de consulta NFCe),
github.com/brunopenso/python-nfce-get, infosimples SEFAZ-RJ NFCe, ndd.tech
(alteração da URL do QRCode RJ).

## 4. Não-objetivos (YAGNI)

- Outros estados além do RJ.
- API paga.
- Rascunho no web que sobrevive a reload (a revisão vive no estado do React; só o
  confirm grava). Persistência de rascunho web fica para depois se fizer falta.
- Leitura da nota por foto continua existindo como fallback, mas não é aprimorada
  neste trabalho.
- Vincular cada `purchase` a um `receipt_id` (a tabela `receipts` do MVP serve só
  para dedup e cache; a coluna de vínculo pode vir depois).

## 5. Arquitetura

```
                    ┌─────────────────────────────┐
   Web (câmera) ───▶│  nfce-consulta (Edge Fn)     │
                    │  1. decodifica QR (se imagem)│
   Telegram ───────▶│  2. GET página SEFAZ-RJ      │───▶ SEFAZ-RJ
   (foto do QR)     │  3. parseia itens (HTML)     │
                    │  4. normaliza (LLM Groq)     │
                    │  5. confere soma × total     │
                    └──────────────┬───────────────┘
                                   │ itens {nome,marca,qtd,preco,unidade,desc_fiscal}
                                   │ + chave + emitente + total + total_confere
                    ┌──────────────┴───────────────┐
                    ▼                               ▼
        Web: revisão no ReceiptModal     Telegram: mercado_draft_set_items
        → mercado_apply_receipt_web      → reusa edit/confirm/apply da 0005
```

A peça compartilhada é a consulta à SEFAZ (o navegador não pode buscar a SEFAZ
direto por causa de CORS, então um servidor é obrigatório de qualquer forma). O
resto (revisão e gravação) é específico de cada canal, mas os dois convergem para
o mesmo miolo de aplicar compra no SQL.

## 6. Serviço `nfce-consulta` (Edge Function, Deno/TS)

### Entrada
```jsonc
{ "qr_url": "https://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode?p=..." } // web
{ "image_base64": "..." }                                                      // Telegram
```

### Passos
1. Se veio imagem, decodifica o QR (zxing-wasm no Deno) para obter `qr_url`.
   Do parâmetro `p`: extrai chave (44 díg.), versão, ambiente, total.
2. `GET` na `qr_url` com User-Agent de navegador, timeout curto, sem retry storm.
3. Parseia o HTML (deno-dom) em: linhas de item (descrição fiscal, código, qtd,
   unidade, valor unitário, valor total) + cabeçalho (emitente, CNPJ, data, total).
4. Normaliza cada descrição fiscal via Groq: devolve `nome` (genérico, minúsculo)
   e `marca`. Os números (qtd, preço, unidade) vêm da SEFAZ e NÃO passam por LLM.
5. Valida: `soma(qtd × preço) ≈ total da nota` com tolerância para desconto e
   arredondamento. Devolve os dois totais e o flag `total_confere`.

### Saída
```jsonc
{
  "ok": true,
  "chave": "3326...2300",
  "emitente": "...", "cnpj": "...", "data": "2026-07-06T22:27:14",
  "total_nota": 1542.46, "total_itens": 1542.46, "total_confere": true,
  "itens": [
    { "nome": "sabonete", "marca": "francis", "qtd": 1, "preco": 3.99,
      "unidade": "un", "desc_fiscal": "SABONETE FRANCIS BRAS L DOCE AMOR" }
  ]
}
```

### Erros (sempre `ok:false` + código)
`qr_invalido`, `sefaz_indisponivel`, `parse_falhou`, `total_nao_confere`,
`captcha_detectado`, `rate_limited`.

### Contrato de item (igual ao da 0005)
`{ nome, marca, qtd, preco, unidade }` mais `desc_fiscal` (só para a tela de
revisão mostrar o original ao lado do normalizado). `nome` genérico minúsculo,
marca separada, qtd/preço como número com ponto decimal.

## 7. Fase 1: caminho web

### Captura (ReceiptModal, fase "capture")
- Ação principal passa a ser "Escanear QR da nota".
- Usa a API `BarcodeDetector` onde existe; fallback para lib JS de QR
  (zxing-wasm ou jsQR) no iOS Safari, que não tem `BarcodeDetector` estável.
- Abre a câmera via `getUserMedia` (exige HTTPS; a Vercel já entrega). Detecta o
  QR e extrai a `qr_url`.
- O input de foto atual (`capture="environment"`) permanece como fallback OCR.

### Processando
- `supabase.functions.invoke('nfce-consulta', { qr_url })`.

### Revisão
- Substitui o array `SAMPLE` por itens reais.
- Cada linha: `desc_fiscal` → nome/marca (editáveis), qtd × preço. Editar no
  mínimo: remover item, corrigir nome, qtd, preço.
- Total no rodapé. Selo de aviso quando `total_confere` for falso.

### Confirmar
- `supabase.rpc('mercado_apply_receipt_web', { p_items, p_chave })`, depois
  `reloadData()` e toast.
- `confirmReceipt` local deixa de ser mock e passa a refletir o retorno da RPC.

### Arquivos tocados (web)
- `web/src/components/receipt/ReceiptModal.tsx` (captura QR + revisão real).
- `web/src/lib/store.tsx` (`confirmReceipt` chama a RPC real; possível novo método
  `importReceipt`).
- Novo helper de scan de QR em `web/src/lib/` (ex.: `nfce.ts`), isolando
  `BarcodeDetector`/lib de fallback atrás de uma função só.
- Aviso do repo: a versão do Next.js aqui tem breaking changes; ler
  `node_modules/next/dist/docs/` antes de codar (ver `web/AGENTS.md`).

## 8. Fase 2: caminho Telegram

Reaproveita quase toda a 0005.
- O bot recebe foto. n8n baixa a imagem e chama `nfce-consulta` com
  `image_base64`. Recebe itens normalizados + chave.
- n8n chama `mercado_draft_set_items(chat_id, itens)` → status `revisao` (já
  existe). O resto (`mercado_draft_edit`, `mercado_apply_receipt`) fica igual.
- Roteamento no bot: se a foto decodifica como QR, caminho QR; se não, cai no OCR
  atual (fallback nativo).
- Dedup: estender `mercado_apply_receipt` (chat_id) para registrar/checar a chave
  na tabela `receipts`, mesma lógica do web.

## 9. Mudanças no banco (migration 0014)

- **Refactor pontual**: extrair o miolo de `mercado_apply_purchase(chat_id, ...)`
  para `mercado_apply_purchase_h(h uuid, name, brand, price, qty, unit)`. As duas
  pontas (Telegram via chat_id, web via auth.uid()) chamam o miolo, sem duplicar a
  lógica de estoque / preço / par_level / baixa da lista.
- **Nova RPC** `mercado_apply_receipt_web(p_items jsonb, p_chave text)`:
  - `security definer`, resolve household pelo helper `_web` existente
    (`auth.uid()` → household);
  - dedup pela chave (se já importada para o household, devolve `ja_importada` sem
    aplicar);
  - aplica item a item via `mercado_apply_purchase_h`, tudo em uma transação;
  - `grant execute ... to authenticated`.
- **Tabela `receipts`** (enxuta, dedup + cache):
  `household_id uuid, chave text, emitente text, total numeric, source text
  ('web'|'telegram'), imported_at timestamptz`, único por `(household_id, chave)`.
  RLS ligado no padrão do projeto.
- **Telegram**: estender `mercado_apply_receipt(chat_id)` para gravar/checar a
  chave em `receipts` antes de aplicar.

## 10. Fallback e erros

- **Web**: se `nfce-consulta` falhar ou o scan não pegar, o modal revela o caminho
  de foto/OCR e o link do Telegram. Em `total_nao_confere`, mostra os itens com
  aviso para conferência manual antes de confirmar.
- **Telegram**: em falha, o bot pede as fotos e segue no fluxo 0005.

## 11. Segurança, custo, LGPD

- Chave Groq como secret da Edge Function (Supabase secrets); nunca no cliente.
  Alinhado ao `SECURITY.md` e à migration 0007.
- A Edge Function exige autenticação: web chama com o JWT do usuário
  (`functions.invoke` já anexa); n8n chama com a service key.
- Rate limit por household na `nfce-consulta` (reusar/estender o mecanismo da
  0007) para não martelar SEFAZ nem Groq.
- Cache por chave (a própria tabela `receipts` ou cache curto na função) evita
  refazer parse/consulta da mesma nota.
- LGPD: guardar itens, chave, loja e totais. Não guardar CPF do consumidor.

## 12. Riscos e mitigação

| Risco | Mitigação |
| --- | --- |
| HTML da SEFAZ-RJ muda e quebra o parser | Fixtures de HTML real em teste; checagem soma × total; fallback OCR; erro claro `parse_falhou` |
| SEFAZ fora do ar / lenta | Timeout curto, mensagem clara, fallback OCR |
| iOS Safari sem `BarcodeDetector` | Lib JS de fallback (zxing-wasm/jsQR) |
| QR ilegível na foto (Telegram) | Roteia para OCR |
| Nota já importada | Dedup pela chave em `receipts` |
| Normalização do LLM erra nome/marca | Revisão editável antes de confirmar; números não passam por LLM |

## 13. Testes

- **Parser RJ (o ponto frágil)**: fixtures de HTML de nota real do RJ; asserts de
  itens, qtd, preço, unidade e total. Dependência: obter o HTML/URL de uma nota
  real do usuário na implementação.
- **Invariante em runtime**: soma dos itens × total (o `total_confere`).
- **SQL smoke test** de `mercado_apply_receipt_web` e do refactor
  `mercado_apply_purchase_h` (nos moldes do smoke test da 0005), incluindo dedup
  pela chave.
- **E2E manual**: escanear o cupom real da foto de referência e conferir estoque,
  preço, par_level e economia.

## 14. Dependência para implementar

Para escrever o parser do RJ com confiança é preciso o HTML de uma NFC-e real do
usuário (ou a URL do QR de um cupom). Vira fixture de teste. Coletar no início da
implementação da Edge Function.

## 15. Ordem de implementação (resumo)

1. Migration 0014: refactor `_h`, `mercado_apply_receipt_web`, tabela `receipts`.
2. Edge Function `nfce-consulta` (parser RJ + normalização + validação) com
   fixtures de teste.
3. Web: scan de QR + revisão real + confirm via RPC (Fase 1 ponta a ponta).
4. Telegram: roteamento QR no n8n + `mercado_apply_receipt` com dedup (Fase 2).
