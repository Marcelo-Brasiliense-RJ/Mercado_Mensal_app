# Fase 0 - Descoberta das fontes de encarte (26/10/2026)

> Levantado via busca web. O ambiente de execução bloqueou acesso direto
> aos sites (403 no proxy), então **robots.txt, formato exato (img/PDF) e
> necessidade de JS ainda precisam ser confirmados** com acesso liberado.

| Mercado | Fonte principal | Fallback | Formato (provável) | Frequência | Dificuldade |
|---|---|---|---|---|---|
| Mundial | supermercadosmundial.com.br/encarte (vigente 16-28/10) | 365ofertas, Tiendeo | páginas em imagem | quinzenal | Baixa/Média |
| Guanabara | supermercadosguanabara.com.br/encarte (tem download) | portafolhetos, seusfolhetos | imagem/PDF | diário (fds + "barato do dia") | Média (volume alto) |
| Superbom (Curicica, Estr. Bandeirantes 7150) | redesuperbom.com.br/lojas/ofertas | Shopfully | indefinido | indefinido | Alta (homônimo no DF/Campos nos agregadores) |
| Rede Economia | redeconomia.encarte.br.com / site oficial | catalogosofertas, mercadomomento | imagem | varia por loja/associado | Alta (encarte por loja; associação de donos diferentes) |
| Supermarket | redesupermarket.com.br/ofertas e ofertas.redesupermarket.com.br | app Superclube, catalogosofertas | imagem | sex-dom + diário em redes | Média (preço exige CPF no caixa) |

## Pontos de atenção
- Tiendeo aparece com dados antigos (jul-ago/2026) para quase todos: **não usar como fonte principal**.
- Superbom e Rede Economia podem não ter encarte da loja de Curicica online. Alternativa: receber o encarte por WhatsApp/Instagram da loja e jogar numa pasta/inbox que o pipeline lê.
- Guanabara muda quase todo dia: rodar 2-3x/semana nele, 1x nos demais.

## OpenRouter - par sugerido (a confirmar via GET /api/v1/models)
- Camada 1 (extrator): `google/gemma-4-31b-it:free`
- Camada 2 (validador, outra família): `nvidia/nemotron-3.5-super-vl:free` (id exato a confirmar)
