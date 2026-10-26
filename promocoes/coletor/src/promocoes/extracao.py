"""Le o encarte em imagem: extrator, validador e regras sem IA.

1. Gemini le a pagina e devolve os produtos.
2. Nemotron (outra familia) olha a mesma imagem e marca cada item ok | corrigido | inexistente.
3. Divergencia: o Gemini confere de novo so aqueles itens. Se agora bate com o
   validador, vale o valor corrigido; senao o item vai para "revisar".
4. Regras deterministicas por cima de tudo.
"""

import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .ia import IA
from .modelos import EncarteBaixado, Oferta
from .regras import aplicar_regras

PARALELO = 4

CATEGORIAS = [
    "Mercearia", "Bebidas", "Carnes", "Frios e Laticínios", "Hortifruti", "Padaria",
    "Congelados", "Doces e Biscoitos", "Limpeza", "Perfumaria e Higiene", "Bebê", "Pet", "Utilidades", "Outros",
]

SCHEMA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            "produto": {"type": "STRING"},
            "marca": {"type": "STRING"},
            "tamanho": {"type": "STRING"},
            "categoria": {"type": "STRING", "enum": CATEGORIAS},
            "preco_normal": {"type": "NUMBER", "nullable": True},
            "preco_app": {"type": "NUMBER", "nullable": True},
            "condicao": {"type": "STRING", "nullable": True},
            "confianca": {"type": "NUMBER"},
        },
        "required": ["produto", "categoria", "preco_normal", "preco_app", "confianca"],
    },
}

# Instrucoes por mercado: cada encarte tem seu jeito de mostrar preco.
CONTEXTO = {
    "mundial": (
        "Encarte do supermercado Mundial (Rio de Janeiro). Cada produto tem um preço normal (em cima, cinza) "
        "e um preço menor 'NO APP MUNDIAL TOTAL' (vermelho)."
    ),
    "guanabara": (
        "Encarte do supermercado Guanabara (Rio de Janeiro). Cada produto tem um só preço de oferta, "
        "em amarelo: coloque-o em preco_app e deixe preco_normal null."
    ),
    "supermarket": (
        "Encarte do supermercado Supermarket (Rio de Janeiro). Cada produto tem um só preço de oferta, "
        "no selo vermelho com 'CADA' ou 'KG': coloque-o em preco_app e deixe preco_normal null."
    ),
}
# Condicao que vale para o encarte inteiro.
CONDICAO = {"mundial": "No App Mundial Total", "supermarket": "Com CPF no caixa"}

PERGUNTA = """{ctx}
Liste TODOS os produtos com preço desta página. Responda só JSON.
Preço com ponto decimal (4,95 -> 4.95). Sem preço do app, use null.
Promoção com condição (ex.: 50% na 2ª unidade, leve 3 pague 2) vai em 'condicao'.
confianca de 0 a 1: quão legível estava o preço."""

PERGUNTA_VALIDA = """Você confere a leitura de um encarte de supermercado. Compare cada item da lista com a IMAGEM.
Para cada item devolva status: ok (produto e os dois preços batem), corrigido (existe mas algum preço está errado;
mande os valores certos) ou inexistente (não está na imagem). Depois liste em 'faltando' produtos com preço
visíveis na imagem que não estão na lista.
Responda só JSON: {{"itens":[{{"i":0,"status":"ok","preco_normal":4.95,"preco_app":3.95}}],"faltando":[{{"produto":"","preco_normal":0,"preco_app":0}}]}}

LISTA:
{lista}"""

PERGUNTA_RECONFERE = """{ctx}
Confira com cuidado SÓ estes produtos na imagem e devolva o preço normal e o do app de cada um.
Responda só JSON, uma entrada por produto, na mesma ordem: {nomes}"""

SCHEMA_RECONFERE = {
    "type": "ARRAY",
    "items": {"type": "OBJECT", "properties": {
        "produto": {"type": "STRING"},
        "preco_normal": {"type": "NUMBER", "nullable": True},
        "preco_app": {"type": "NUMBER", "nullable": True},
    }, "required": ["produto", "preco_normal", "preco_app"]},
}


def _igual(a, b) -> bool:
    if a is None or b is None:
        return a is None and b is None
    return abs(float(a) - float(b)) < 0.005


def _precos_iguais(x: dict, y: dict) -> bool:
    return _igual(x.get("preco_normal"), y.get("preco_normal")) and _igual(x.get("preco_app"), y.get("preco_app"))


def ler_pagina(ia: IA, img: bytes, mercado: str) -> list[dict]:
    ctx = CONTEXTO.get(mercado, "Encarte de supermercado.")
    itens = ia.gemini(img, PERGUNTA.format(ctx=ctx), SCHEMA)
    for it in itens:
        it["status"], it["motivo"] = "ok", None
    if not itens:
        return []

    lista = [{"i": i, "produto": f"{e['produto']} {e.get('marca', '')}".strip(),
              "preco_normal": e["preco_normal"], "preco_app": e["preco_app"]} for i, e in enumerate(itens)]
    v = ia.openrouter(img, PERGUNTA_VALIDA.format(lista=json.dumps(lista, ensure_ascii=False)))
    veredito = {int(x["i"]): x for x in v.get("itens", []) if str(x.get("i", "")).isdigit()}

    divergentes = [i for i, x in veredito.items() if i < len(itens) and x.get("status") in ("corrigido", "inexistente")]
    for i, it in enumerate(itens):
        if i not in veredito:
            it["status"], it["motivo"] = "revisar", "O validador não respondeu sobre este item."

    if divergentes:
        nomes = json.dumps([lista[i]["produto"] for i in divergentes], ensure_ascii=False)
        segunda = ia.gemini(img, PERGUNTA_RECONFERE.format(ctx=ctx, nomes=nomes), SCHEMA_RECONFERE)
        for k, i in enumerate(divergentes):
            it, val = itens[i], veredito[i]
            nova = segunda[k] if k < len(segunda) else None
            if val["status"] == "inexistente":
                it["status"], it["motivo"] = "revisar", "O validador não achou este produto na página."
            elif nova and _precos_iguais(nova, val):
                it["preco_normal"], it["preco_app"] = nova["preco_normal"], nova["preco_app"]
                it["motivo"] = "Corrigido: as duas IAs concordaram na segunda leitura."
            elif nova and _precos_iguais(nova, it):
                it["status"] = "revisar"
                it["motivo"] = (f"As IAs discordam: leitura {it['preco_normal']} / {it['preco_app']}, "
                                f"conferente {val.get('preco_normal')} / {val.get('preco_app')}.")
            else:
                it["status"], it["motivo"] = "revisar", "Leituras diferentes nas três tentativas."

    for f in v.get("faltando") or []:
        if f.get("produto"):
            itens.append({**f, "categoria": "Outros", "marca": "", "tamanho": "", "confianca": 0,
                          "status": "revisar", "motivo": "Só o conferente viu este produto."})
    return itens


def extrair(enc: EncarteBaixado, pasta: Path, base: Path, historico: dict[str, float]) -> list[Oferta]:
    ia = IA(base)
    e = enc.encarte
    ofertas = []

    def uma(n_nome):
        n, nome = n_nome
        itens = ler_pagina(ia, (pasta / nome).read_bytes(), e.mercado)
        print(f"  {e.mercado} pagina {n}/{len(enc.paginas)}: {len(itens)} itens", flush=True)
        return n, itens

    # O conferente gratuito leva ~2 min por pagina; 4 em paralelo ficam bem abaixo de 20 req/min.
    with ThreadPoolExecutor(PARALELO) as ex:
        lidas = sorted(ex.map(uma, enumerate(enc.paginas, start=1)))
    for n, itens in lidas:
        for it in itens:
            normal, app = it.get("preco_normal"), it.get("preco_app")
            por = app or normal
            if not por:
                continue
            o = Oferta(
                mercado=e.mercado,
                produto=it["produto"],
                marca=it.get("marca") or "",
                tamanho=it.get("tamanho") or "",
                categoria=it.get("categoria") or "Outros",
                preco_por=por,
                preco_de=normal if app else None,
                condicao=it.get("condicao") or (CONDICAO.get(e.mercado) if app else None),
                inicio=e.inicio,
                fim=e.fim,
                pagina=n,
                status=it["status"],
                motivo=it["motivo"],
                ref=f"{e.id}-p{n}",
            )
            ofertas.append(aplicar_regras(o, historico))
    return ofertas
