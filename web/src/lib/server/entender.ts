// O "cerebro" do app: a mesma regra para tudo que entra (audio, texto digitado,
// foto da despensa ou de lista escrita). Quem muda e so o jeito de chegar no texto
// ou na imagem; o que sai e sempre {intencao, itens[]} com acao por item, e a tela
// faz o resto igual para todos (estoque, lista, carrinho, nao comprar).
// So no servidor.
import { intencaoValida, interpretarLocal, normalizaItens, type VozIntencao, type VozItem } from "@/lib/voz";
import { gemini, type RespostaGemini } from "./gemini";
import { vocabularioParaIA } from "@/lib/sinonimos";

const GROQ = "https://api.groq.com/openai/v1";
// Em ordem: se a Groq desligar um modelo, o proximo assume. O llama-3.3-70b foi
// desligado em ago/2026 e a voz passou a "ouvir mas nao por nada na lista".
const MODELOS_TEXTO = ["openai/gpt-oss-120b", "qwen/qwen3.6-27b", "openai/gpt-oss-20b"];

export type Tela = "estoque" | "lista" | "mercado" | "auto" | "atualizar";

export const INSTRUCAO = `Você organiza a despensa e as compras de uma família brasileira.
Recebe uma fala (às vezes longa, misturando assuntos) e devolve SOMENTE JSON, no formato:
{"intencao":"lista|carrinho|estoque","itens":[{"nome":"","qtd":1,"unidade":"un","preco_total":null,"duvida":false,"acao":"lista|carrinho|estoque|remover","motivo":null,"zerou":false}]}

Cada ITEM tem a sua "acao", pelo que foi dito sobre ele (uma mesma fala pode ter as quatro):
- "estoque": a pessoa diz o que TEM em casa agora ("eu tenho 5 quilos de arroz", "tem 3 cartelas de ovos", "sobrou meio pacote"). A qtd é o total que tem.
- "lista": ainda precisa comprar ("preciso de", "compra", "falta", "acabou o", "não tenho mais", "anota aí").
- "carrinho": acabou de pegar/comprar no mercado ("peguei", "comprei", "botei no carrinho", "custou").
- "remover": NÃO é para comprar ("não precisa comprar", "não quero", "tira", "cancela", "esquece o", "já tem muito").
A ação vale para os itens seguintes até aparecer outro verbo.
"intencao" é a ação da maioria dos itens (na dúvida, "lista").

"motivo" só para "remover":
- "excesso": SÓ quando a pessoa diz que tem demais ("já tem muito", "tem de sobra", "tá sobrando", "tem bastante"). "Esse mês" sozinho NÃO é motivo.
- "ruim": falou mal do produto ("é ruim", "não presta", "não gostei", "aguado").
- null: não disse o porquê (o app vai perguntar). Ex.: "não comprar leite esse mês" = motivo null.
O mesmo produto dito duas vezes ("não compra fermento, já tem muito fermento") é UM item, com o motivo que apareceu.

Regras dos itens:
- "nome": o produto em minúsculo e singular. Se a pessoa disser a marca, ela vem depois do produto, sem tamanho nem tipo ("arroz da Máximo" = "arroz máximo"; "arroz" sem marca = "arroz"; nunca "arroz máximo tipo 1 5kg").
- "qtd": número. Sem quantidade dita, use 1. "5 detergentes" = qtd 5, nome "detergente".
- "unidade": un, kg, g, L, ml, pct, cx ou dz. Contável sem medida falada ("5 detergentes", "2 sabonetes") é "un". "2 quilos de carne" é kg. Cartela, bandeja, fardo e saco são "pct". Sem certeza, use "un".
- "preco_total": o valor falado é o TOTAL daquele item, em reais, como número. Sem preço dito, null.
- "duvida": true quando você NÃO tem certeza de que entendeu o produto (palavra que não parece produto de mercado, nome cortado ou embolado, só a marca sem dizer o que é). Produto claro = false.
- Não invente preço, quantidade nem item que não foi falado.
- Ignore o que não é produto ("olha só", "eu", "é", "aí", "também", "então", "esse mês", "lista").

Exemplo: "olha só, eu tenho 5 quilos de arroz, tenho 3 cartelas de ovos, mas não precisa comprar leite, não precisa comprar fermento, esse mês já tem muito fermento, e anota café" =
{"intencao":"estoque","itens":[{"nome":"arroz","qtd":5,"unidade":"kg","preco_total":null,"duvida":false,"acao":"estoque","motivo":null},{"nome":"ovo","qtd":3,"unidade":"pct","preco_total":null,"duvida":false,"acao":"estoque","motivo":null},{"nome":"leite","qtd":1,"unidade":"un","preco_total":null,"duvida":false,"acao":"remover","motivo":null},{"nome":"fermento","qtd":1,"unidade":"un","preco_total":null,"duvida":false,"acao":"remover","motivo":"excesso"},{"nome":"café","qtd":1,"unidade":"un","preco_total":null,"duvida":false,"acao":"lista","motivo":null}]}

Exemplo: "tá faltando 1 arroz, 5 detergentes e arroz da Máximo" =
{"intencao":"lista","itens":[{"nome":"arroz","qtd":1,"unidade":"un","preco_total":null,"duvida":false,"acao":"lista","motivo":null},{"nome":"detergente","qtd":5,"unidade":"un","preco_total":null,"duvida":false,"acao":"lista","motivo":null},{"nome":"arroz máximo","qtd":1,"unidade":"un","preco_total":null,"duvida":false,"acao":"lista","motivo":null}]}

Exemplo: "comprei arroz vinte reais, dois pacotes" =
{"intencao":"carrinho","itens":[{"nome":"arroz","qtd":2,"unidade":"pct","preco_total":20,"duvida":false,"acao":"carrinho","motivo":null}]}`;

// Cada um fala de um jeito: a mesma tabela da regra local (lib/sinonimos.ts) vai
// para a IA, para as duas entenderem igual.
const JEITOS = `

Cada pessoa fala de um jeito (gíria, regionalismo, frase pela metade, erro de transcrição). Estes jeitos querem dizer a mesma coisa:
${vocabularioParaIA()}
Quantidade dita com NÚMERO ("tenho 5 kg de arroz", "tem 3 pacotes") = "estoque". Dizer que tem MUITO sem número ("tenho bastante sabonete", "a despensa tá cheia de macarrão", "tem um monte") = "remover" com motivo "excesso".
Entenda pelo SENTIDO, não pela palavra exata: qualquer outro jeito de dizer isso vale igual. Lugar da casa ("despensa", "armário", "geladeira") não é produto.

ATUALIZAR O ESTOQUE (a pessoa corrige quanto TEM agora):
- "vou atualizar meu estoque", "bora conferir a despensa", "fazer a contagem", "inventário" é o PEDIDO, nunca item.
- O número que vale é o de AGORA. "Eu tinha 13 creme de leite, agora tenho 6", "de 13 caiu pra 6", "era 13 agora é 6", "na verdade só tem 6", "o creme de leite tá com 6", "ficou 6", "sobraram 6", "restam 6", "são 6" = UM item "estoque" com qtd 6. Nunca 13, nunca dois itens.
- Mandar mudar também é estoque: "muda o arroz pra 3", "corrige o leite para 4", "deixa o café como 2", "atualiza o feijão pra 1".
- Correção no meio da fala vale a ÚLTIMA: "arroz 5, não, pera, 4" / "quer dizer 4" / "ou melhor 4" = arroz qtd 4. "Pera" aí é "espera", não a fruta.
- O mesmo produto dito duas vezes como estoque = UM item, com o último número.
- "Acabou", "zerou", "não tem mais", "não sobrou nada" = "acao":"lista" com "zerou":true (zero em casa e precisa comprar). "Tá acabando" / "tá no fim" = "lista" com "zerou":false (ainda tem um pouco).
- "Tem arroz", "ainda tem café" SEM número = "estoque" com "qtd": null (o app pergunta quanto). Não invente 1.
- Medida: "meia dúzia" = qtd 0.5 "dz"; "um quilo e meio" = 1.5 "kg"; "meio pacote" = 0.5 "pct"; "500 gramas" = 500 "g".
- "zerou" só é true no "acabou/zerou/não tem mais"; em todo o resto é false.

Exemplo: "vamos atualizar agora o estoque, tem que comprar arroz, não comprar leite, tem 3 feijão. Olha, eu tinha 13 creme de leite, agora eu tenho 6, e acabou o café" =
{"intencao":"estoque","itens":[{"nome":"arroz","qtd":1,"unidade":"un","preco_total":null,"duvida":false,"acao":"lista","motivo":null,"zerou":false},{"nome":"leite","qtd":1,"unidade":"un","preco_total":null,"duvida":false,"acao":"remover","motivo":null,"zerou":false},{"nome":"feijão","qtd":3,"unidade":"un","preco_total":null,"duvida":false,"acao":"estoque","motivo":null,"zerou":false},{"nome":"creme de leite","qtd":6,"unidade":"un","preco_total":null,"duvida":false,"acao":"estoque","motivo":null,"zerou":false},{"nome":"café","qtd":1,"unidade":"un","preco_total":null,"duvida":false,"acao":"lista","motivo":null,"zerou":true}]}`;

// A tela de onde a pessoa mandou ajuda a desempatar ("arroz" sozinho na despensa e estoque).
function contexto(tela: Tela | undefined): string {
  if (tela === "atualizar")
    return "\n\nContexto: a pessoa está ATUALIZANDO o estoque. Item com número e sem verbo = estoque, qtd = quanto tem AGORA. Pedido de comprar continua lista; não comprar continua remover.";
  if (tela === "estoque") return "\n\nContexto: a pessoa está na tela do ESTOQUE (despensa). Item sem verbo = estoque.";
  if (tela === "lista") return "\n\nContexto: a pessoa está montando a LISTA de compras. Item sem verbo = lista.";
  if (tela === "mercado") return "\n\nContexto: a pessoa está DENTRO do mercado. Item sem verbo = carrinho.";
  return "";
}

// "Receita vira lista": a pessoa cola uma receita inteira (ou so diz o prato, "receita
// de lasanha pra 6") e sai a lista de compras. Detectado aqui, no servidor, para valer
// igual no texto digitado e no audio, sem botao novo.
const SINAIS_RECEITA =
  /\b(receita|ingredientes?|modo de preparo|rendimento|rende \d|por[cç](ao|ão|oes|ões)|x[ií]caras?|colher(es)? de (sopa|ch[aá]|caf[eé])|a gosto|pitada)\b/i;

export function pareceReceita(texto: string): boolean {
  if (SINAIS_RECEITA.test(texto)) return true;
  // Lista de ingredientes colada sem cabecalho: varias linhas comecando por medida.
  const linhas = texto.split(/\n/).filter((l) => /^\s*[-•*]?\s*(\d|meia|meio|uma?|duas?)\b.*\b(g|kg|ml|l|x[ií]cara|colher|lata|pacote|caixa|dente)s?\b/i.test(l));
  return linhas.length >= 3;
}

export const RECEITA = `

RECEITA: a pessoa mandou uma receita (colada inteira, só a lista de ingredientes, ou só o nome do prato, ex.: "receita de lasanha pra 6 pessoas").
- Devolva os INGREDIENTES a comprar, todos com "acao":"lista" e "intencao":"lista". Nada de estoque, carrinho ou remover.
- Só o nome do prato: liste os ingredientes típicos dessa receita como se faz no Brasil.
- Medida de cozinha vira compra de mercado: "2 xícaras de farinha" = farinha de trigo 1 "pct"; "3 ovos" = ovo 3 "un"; "200 g de queijo" = 200 "g"; "1 lata de leite condensado" = leite condensado 1 "un"; "2 dentes de alho" = alho 1 "un".
- Ignore água e o modo de preparo. Sal, óleo, açúcar e temperos "a gosto" entram com qtd 1.
- Se disser para quantas pessoas, ajuste as quantidades.
- "nome" é o produto como se compra ("farinha de trigo", "creme de leite", "queijo mussarela"), minúsculo e singular.`;

export type Entendido = { intencao: VozIntencao; itens: VozItem[]; por: "groq" | "gemini" | "regra" };

function ler(txt: string | undefined): { intencao?: unknown; itens?: unknown } | null {
  try {
    return JSON.parse(txt ?? "");
  } catch {
    return null;
  }
}

// Texto -> itens. Groq primeiro (se tiver chave), Gemini de reserva, e a regra local
// por ultimo: frase ouvida nunca volta vazia.
export async function entenderTexto(texto: string, tela?: Tela): Promise<Entendido> {
  const sistema = INSTRUCAO + JEITOS + (pareceReceita(texto) ? RECEITA : contexto(tela));
  const key = process.env.GROQ_API_KEY;
  if (key) {
    for (const modelo of MODELOS_TEXTO) {
      try {
        const ct = await fetch(`${GROQ}/chat/completions`, {
          method: "POST",
          headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
          body: JSON.stringify({
            model: modelo,
            temperature: 0,
            response_format: { type: "json_object" },
            ...(modelo.includes("gpt-oss") ? { reasoning_effort: "low" } : {}),
            messages: [
              { role: "system", content: sistema },
              { role: "user", content: texto },
            ],
          }),
          signal: AbortSignal.timeout(20000),
        });
        if (!ct.ok) {
          console.error("entender: groq", modelo, ct.status, await ct.text().catch(() => ""));
          continue;
        }
        const bruto = (await ct.json()) as { choices?: { message?: { content?: string } }[] };
        const j = ler(bruto.choices?.[0]?.message?.content);
        const itens = normalizaItens(j?.itens);
        if (j && itens.length) return { intencao: intencaoValida(j.intencao), itens, por: "groq" };
      } catch (e) {
        console.error("entender: groq", modelo, String(e));
      }
    }
  }
  const g = await gemini({
    systemInstruction: { parts: [{ text: sistema }] },
    contents: [{ parts: [{ text: texto }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0 },
  });
  if (g.ok) {
    const j = ler(g.texto);
    const itens = normalizaItens(j?.itens);
    if (j && itens.length) return { intencao: intencaoValida(j.intencao), itens, por: "gemini" };
  } else if (g.erro !== "ia_indisponivel") {
    console.error("entender: gemini texto", g.erro);
  }
  return { ...interpretarLocal(texto, tela === "atualizar"), por: "regra" };
}

const FOTO = `A imagem é uma FOTO tirada pela pessoa para registrar produtos de casa. Pode ser:
- prateleira, armário, despensa, geladeira ou bancada com produtos: conte o que aparece; cada produto vira item com "acao":"estoque" e a qtd é quantas unidades/pacotes você VÊ.
- lista de compras escrita à mão ou digitada (papel, quadro, print de conversa): cada linha vira item com "acao":"lista" (linha riscada ou com "não comprar"/"já tem" vira "remover").
- produtos no carrinho ou na esteira do caixa: "acao":"carrinho".
Leia nomes e marcas dos rótulos. Agrupe iguais (3 latas iguais = qtd 3). Não invente o que não dá para ver.
Além dos itens, devolva "texto": uma frase curta dizendo o que você viu (ex.: "Despensa com 5 produtos", "Lista escrita com 8 itens").`;

// Foto (despensa, lista escrita, carrinho) -> itens, pelo Gemini.
export async function entenderFoto(
  dataUrl: string,
  tela?: Tela,
): Promise<{ ok: true; texto: string; intencao: VozIntencao; itens: VozItem[] } | Exclude<RespostaGemini, { ok: true }>> {
  const m = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!m) return { ok: false, erro: "ia_falhou" };
  const g = await gemini(
    {
      systemInstruction: { parts: [{ text: INSTRUCAO + JEITOS + contexto(tela) }] },
      contents: [{ parts: [{ inline_data: { mime_type: m[1], data: m[2] } }, { text: FOTO }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
    },
    true, // varios produtos numa imagem: o modelo mais forte na frente
    45000,
  );
  if (!g.ok) return g;
  const j = ler(g.texto) as { intencao?: unknown; itens?: unknown; texto?: unknown } | null;
  const itens = normalizaItens(j?.itens);
  return {
    ok: true,
    texto: String(j?.texto ?? "").trim() || `Foto com ${itens.length} ${itens.length === 1 ? "produto" : "produtos"}`,
    intencao: intencaoValida(j?.intencao),
    itens,
  };
}
