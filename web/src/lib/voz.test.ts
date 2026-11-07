import { describe, expect, it } from "vitest";
import {
  achaNaLista,
  ehApple,
  escolherMime,
  interpretarLocal,
  motivoNaoComprar,
  numerosPorExtenso,
  extensaoDe,
  intencaoValida,
  normalizaItens,
  segundosFmt,
} from "./voz";

describe("ditado no app", () => {
  it("escolhe o formato que o navegador grava, na ordem de preferencia", () => {
    expect(escolherMime(() => true)).toBe("audio/webm;codecs=opus");
    // iOS Safari: so mp4
    expect(escolherMime((m) => m === "audio/mp4")).toBe("audio/mp4");
    expect(escolherMime(() => false)).toBe(null);
    // iPhone que diz gravar webm: mp4 vem primeiro, webm dele sai mudo
    expect(escolherMime(() => true, true)).toBe("audio/mp4");
  });

  it("reconhece iPhone e Safari, mas nao Chrome", () => {
    expect(ehApple("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit Mobile/15E148")).toBe(true);
    expect(ehApple("Mozilla/5.0 (Macintosh) AppleWebKit Version/18.0 Safari/605.1.15")).toBe(true);
    expect(ehApple("Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36")).toBe(false);
  });

  it("casa extensao com o mime, que e como o Whisper escolhe o decoder", () => {
    expect(extensaoDe("audio/webm;codecs=opus")).toBe("webm");
    expect(extensaoDe("audio/mp4")).toBe("m4a");
    expect(extensaoDe("audio/mpeg")).toBe("mp3");
  });

  it("intencao desconhecida cai em lista, que e o erro barato", () => {
    expect(intencaoValida("carrinho")).toBe("carrinho");
    expect(intencaoValida("estoque")).toBe("estoque");
    expect(intencaoValida("comprar_tudo")).toBe("lista");
    expect(intencaoValida(undefined)).toBe("lista");
  });

  it("divide o preco falado pela quantidade, em codigo", () => {
    // "arroz vinte reais, dois pacotes" = 20 no total, 10 por pacote
    const [arroz] = normalizaItens([{ nome: "arroz", qtd: 2, preco_total: 20 }]);
    expect(arroz.preco).toBe(10);
    expect(arroz.unidade).toBe("kg"); // deduzida do nome
  });

  it("sanea o que o modelo devolveu", () => {
    const itens = normalizaItens([
      { nome: "  leite  ", qtd: "1,5", unidade: "L", preco_total: "7,50" },
      { nome: "", qtd: 3 }, // sem nome, nao entra
      { nome: "cafe", qtd: 0 }, // quantidade invalida vira 1
      "lixo",
    ]);
    expect(itens).toHaveLength(2);
    expect(itens[0]).toEqual({ nome: "leite", qtd: 1.5, unidade: "L", preco: 5 });
    expect(itens[1]).toEqual({ nome: "cafe", qtd: 1, unidade: "pct", preco: null });
    expect(normalizaItens(null)).toEqual([]);
  });

  it("formata o tempo de gravacao", () => {
    expect(segundosFmt(0)).toBe("0:00");
    expect(segundosFmt(9)).toBe("0:09");
    expect(segundosFmt(75)).toBe("1:15");
  });
});

describe("entender a frase sem servidor (plano B)", () => {
  it("resolve numero por extenso, inclusive centavo falado", () => {
    expect(numerosPorExtenso("doze e noventa")).toBe("12.9");
    expect(numerosPorExtenso("vinte e cinco")).toBe("25");
    expect(numerosPorExtenso("dois pacotes")).toBe("2 pacotes");
    expect(numerosPorExtenso("meio quilo")).toBe("0.5 quilo");
  });

  it("entende a frase do README, com dois itens e quantidade depois do preco", () => {
    const r = interpretarLocal(
      "comprei arroz cinco reais, dois pacotes, e café doze e noventa, um",
    );
    expect(r.intencao).toBe("carrinho");
    expect(r.itens).toHaveLength(2);
    // cinco reais era o total dos dois pacotes: 2,50 cada
    expect(r.itens[0]).toMatchObject({ nome: "arroz", qtd: 2, preco: 2.5 });
    expect(r.itens[1]).toMatchObject({ nome: "café", qtd: 1, preco: 12.9 });
  });

  it("classifica pelo verbo", () => {
    expect(interpretarLocal("preciso de sabão em pó").intencao).toBe("lista");
    expect(interpretarLocal("peguei leite 5 reais").intencao).toBe("carrinho");
    expect(interpretarLocal("tenho 3 pacotes de macarrão").intencao).toBe("estoque");
    expect(interpretarLocal("banana").intencao).toBe("lista"); // sem verbo, erro barato
  });

  it("pega quantidade com unidade e preco por quilo", () => {
    const r = interpretarLocal("comprei 2 kg de carne por 60 reais");
    expect(r.itens[0]).toMatchObject({ nome: "carne", qtd: 2, unidade: "kg", preco: 30 });
  });

  it("frase sem numero nenhum ainda vira item", () => {
    const r = interpretarLocal("preciso de detergente");
    expect(r.itens).toEqual([
      { nome: "detergente", qtd: 1, unidade: "L", preco: null, destino: "lista" },
    ]);
  });
});

describe("normalizaItens duvida", () => {
  it("so marca duvida quando o modelo diz true; o resto entra direto", () => {
    const [a, b, c] = normalizaItens([
      { nome: "arroz", qtd: 1, duvida: false },
      { nome: "trem azul", qtd: 1, duvida: true },
      { nome: "feijao", qtd: 1, duvida: "sim" },
    ]);
    expect(a.duvida).toBeUndefined();
    expect(b.duvida).toBe(true);
    expect(c.duvida).toBeUndefined();
  });
});

describe("comprar e nao comprar na mesma frase", () => {
  it("separa o que entra e o que sai da lista", () => {
    const r = interpretarLocal("quero arroz e feijão, mas não quero café e açúcar");
    expect(r.intencao).toBe("lista");
    const por = Object.fromEntries(r.itens.map((i) => [i.nome, !!i.remover]));
    expect(por).toEqual({ arroz: false, "feijão": false, "café": true, "açúcar": true });
  });

  it("negacao primeiro, depois o que quer", () => {
    const r = interpretarLocal("tira o leite da lista, mas preciso de 2 detergentes");
    expect(r.itens.map((i) => [i.nome, !!i.remover, i.qtd])).toEqual([
      ["leite", true, 1],
      ["detergentes", false, 2],
    ]);
  });

  it("o modelo pode marcar remover", () => {
    const [i] = normalizaItens([{ nome: "café", qtd: 1, remover: true }]);
    expect(i.remover).toBe(true);
  });

  it("acha na lista pelo nome falado", () => {
    const lista = [
      { id: "1", name: "Café Pilão", status: "pending" },
      { id: "2", name: "cafeteira", status: "pending" },
      { id: "3", name: "café", status: "bought" },
      { id: "4", name: "leite", status: "pending" },
    ];
    expect(achaNaLista("café", lista).map((i) => i.id)).toEqual(["1"]);
    expect(achaNaLista("leites", lista).map((i) => i.id)).toEqual(["4"]);
    expect(achaNaLista("sabão", lista)).toEqual([]);
  });
});

describe("frase do dono no iPhone", () => {
  it("'nao comprar leite esse mes' tira so o leite", () => {
    const r = interpretarLocal("Não comprar leite esse mês");
    expect(r.itens).toEqual([expect.objectContaining({ nome: "leite", remover: true })]);
  });
});

describe("nao comprar: ruim ou excesso", () => {
  it("pontuacao do ditado nao gruda no nome", () => {
    expect(interpretarLocal("Não. Biscoito plus vita").itens[0]).toMatchObject({ nome: "biscoito plus vita", remover: true });
  });
  it("classifica pela fala", () => {
    expect(motivoNaoComprar("não comprar leite esse mês")).toBe("excesso");
    expect(motivoNaoComprar("tem leite demais, não compra")).toBe("excesso");
    expect(motivoNaoComprar("não compra mais esse café, é ruim")).toBe("ruim");
    expect(motivoNaoComprar("detergente Ypê não presta")).toBe("ruim");
  });
});

describe("audio longo, tudo junto", () => {
  it("estoque, nao comprar e excesso na mesma fala", () => {
    const r = interpretarLocal(
      "Olha só, eu tenho 5 quilos de arroz, eu tenho 3 cartelas de ovos, mas não precisa comprar leite, não precisa comprar fermento, esse mês já tem muito fermento",
    );
    const resumo = r.itens.map((i) => [i.nome, i.qtd, i.unidade, i.remover ? `remover:${i.motivo ?? "?"}` : i.destino]);
    expect(resumo).toEqual([
      ["arroz", 5, "kg", "estoque"],
      ["ovos", 3, "pct", "estoque"],
      ["leite", 1, expect.any(String), "remover:?"],
      ["fermento", 1, expect.any(String), "remover:excesso"],
    ]);
  });

  it("estoque e lista juntos", () => {
    const r = interpretarLocal("tenho 2 pacotes de café, mas preciso de açúcar e 6 leites");
    expect(r.itens.map((i) => [i.nome, i.destino])).toEqual([
      ["café", "estoque"],
      ["açúcar", "lista"],
      ["leites", "lista"],
    ]);
  });

  it("'nao tenho' e de comprar", () => {
    expect(interpretarLocal("não tenho mais arroz").itens[0]).toMatchObject({ nome: "arroz", destino: "lista" });
  });

  it("o modelo diz a acao por item", () => {
    const [a, b] = normalizaItens([
      { nome: "arroz", qtd: 5, unidade: "kg", acao: "estoque" },
      { nome: "fermento", acao: "remover", motivo: "excesso" },
    ]);
    expect(a.destino).toBe("estoque");
    expect(b).toMatchObject({ remover: true, motivo: "excesso" });
  });
});

describe("atualizar estoque falando", () => {
  it("reconhece o pedido", async () => {
    const { querAtualizarEstoque } = await import("./voz");
    expect(querAtualizarEstoque("vou atualizar o meu estoque")).toBe(true);
    expect(querAtualizarEstoque("Vou atualizar a dispensa: arroz 3")).toBe(true);
    expect(querAtualizarEstoque("conferindo a geladeira")).toBe(true);
    expect(querAtualizarEstoque("tenho 5 kg de arroz")).toBe(false);
  });

  it("'de 3 para 5' vale o 5", () => {
    const r = interpretarLocal("vou atualizar meu estoque, arroz de 3 para 5 quilos, leite era 2 agora 4");
    expect(r.itens.map((i) => [i.nome, i.qtd])).toEqual([
      ["arroz", 5],
      ["leite", 4],
    ]);
  });
});

describe("atualizar estoque: como as pessoas falam de verdade", () => {
  const ler = (f: string, atualizar = false) =>
    interpretarLocal(f, atualizar).itens.map((i) => [
      i.nome,
      i.qtd,
      i.remover ? "remover" : i.destino,
      ...(i.zerou ? ["zerou"] : []),
      ...(i.semQtd ? ["semQtd"] : []),
    ]);

  it("audio longo misturando tudo", () => {
    expect(
      ler(
        "Vamos atualizar agora o estoque, tem que comprar arroz, não comprar leite, tem 3 feijão. Olha, eu tinha 13 creme de leite, agora eu tenho 6",
      ),
    ).toEqual([
      ["arroz", 1, "lista"],
      ["leite", 1, "remover"],
      ["feijão", 3, "estoque"],
      ["creme de leite", 6, "estoque"],
    ]);
  });

  it("o valor novo e o que vale", () => {
    expect(ler("na verdade agora eu só tenho 6 creme de leite")).toEqual([["creme de leite", 6, "estoque"]]);
    expect(ler("o creme de leite tá com 6")).toEqual([["creme de leite", 6, "estoque"]]);
    expect(ler("de 13 caiu pra 6 o creme de leite")).toEqual([["creme de leite", 6, "estoque"]]);
    expect(ler("creme de leite agora são 6")).toEqual([["creme de leite", 6, "estoque"]]);
    expect(ler("tinha 13 creme de leite mas agora só tem 6")).toEqual([["creme de leite", 6, "estoque"]]);
    expect(ler("arroz era 5 agora é 2")).toEqual([["arroz", 2, "estoque"]]);
  });

  it("mandar mudar", () => {
    expect(ler("muda o arroz pra 3")).toEqual([["arroz", 3, "estoque"]]);
    expect(ler("corrige o leite para 4")).toEqual([["leite", 4, "estoque"]]);
    expect(ler("deixa o café como 2")).toEqual([["café", 2, "estoque"]]);
  });

  it("se corrigiu no meio da frase", () => {
    expect(ler("tenho arroz 5, não, pera, 4")).toEqual([["arroz", 4, "estoque"]]);
    expect(ler("tenho 5 arroz, quer dizer, 3")).toEqual([["arroz", 3, "estoque"]]);
    expect(ler("tenho 4 leites, na verdade tenho 2 leites")).toEqual([["leites", 2, "estoque"]]);
  });

  it("acabou e zero; acabando nao", () => {
    expect(ler("acabou o leite e zerou o café")).toEqual([
      ["leite", 1, "lista", "zerou"],
      ["café", 1, "lista", "zerou"],
    ]);
    expect(ler("não tem mais sabão")).toEqual([["sabão", 1, "lista", "zerou"]]);
    expect(ler("tá acabando o café")).toEqual([["café", 1, "lista"]]);
  });

  it("muleta de fala e ponto final nao viram produto", () => {
    expect(ler("deixa eu ver, creme de leite tem uns 6, quer dizer, 5. Ah e comprei 2 pacotes de biscoito", true)).toEqual([
      ["creme de leite", 5, "estoque"],
      ["biscoito", 2, "carrinho"],
    ]);
  });

  it("sem numero nao vira 1 calado", () => {
    expect(ler("ainda tem arroz")).toEqual([["arroz", 1, "estoque", "semQtd"]]);
  });

  it("numero e unidade falados de varios jeitos", () => {
    expect(interpretarLocal("tenho um quilo e meio de feijão").itens[0]).toMatchObject({ nome: "feijão", qtd: 1.5, unidade: "kg" });
    expect(ler("sobraram duas latas de milho e ficou só um sabão em pó")).toEqual([
      ["milho", 2, "estoque"],
      ["sabão em pó", 1, "estoque"],
    ]);
    expect(ler("restam 2 sabonetes")).toEqual([["sabonetes", 2, "estoque"]]);
  });

  it("no modo atualizar, numero sem verbo e estoque", () => {
    expect(ler("arroz 3, feijão 2", true)).toEqual([
      ["arroz", 3, "estoque"],
      ["feijão", 2, "estoque"],
    ]);
    expect(ler("fiz a contagem: 4 leites e 2 cafés")).toEqual([
      ["leites", 4, "estoque"],
      ["cafés", 2, "estoque"],
    ]);
  });

  it("reconhece o pedido de varios jeitos", async () => {
    const { querAtualizarEstoque: q } = await import("./voz");
    for (const f of [
      "vamos atualizar agora o estoque",
      "bora arrumar a despensa",
      "deixa eu conferir o que tem em casa",
      "vou fazer o inventário",
      "estoque atualizado: arroz 3",
      "vou corrigir o estoque",
    ])
      expect([f, q(f)]).toEqual([f, true]);
    expect(q("preciso de arroz")).toBe(false);
  });
});
