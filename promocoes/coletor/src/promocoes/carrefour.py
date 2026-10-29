"""Carrefour Mercado: o mercado que pontua na Livelo, como mais um mercado do app (0047).

A loja online do Carrefour Mercado e VTEX, com o catalogo publico de busca (o mesmo das
outras lojas que o app consulta para codigo de barras e foto). Nao ha encarte: busca so o
que as casas com Livelo precisam (lista + fixos do mes, pela RPC mercado_livelo_termos_h)
e publica o mais barato de cada um. O app desconta os pontos e compara com os encartes.

ponytail: o preco e o da regiao padrao do site (sem CEP). Se divergir muito do Rio, o
upgrade e mandar o sc/regionId da loja de entrega na busca.
"""

import time
import unicodedata

import httpx

from . import lista_app
from .modelos import Oferta

BASE = "https://mercado.carrefour.com.br"
POR_TERMO = 3

# Departamento do site -> categorias usadas nos encartes.
CATEGORIA = {
    "mercearia": "Mercearia", "bebidas": "Bebidas", "limpeza": "Limpeza", "higiene e beleza": "Perfumaria e Higiene",
    "perfumaria": "Perfumaria e Higiene", "frios e laticinios": "Frios e Laticínios", "laticinios": "Frios e Laticínios",
    "carnes": "Carnes", "acougue": "Carnes", "padaria": "Padaria", "hortifruti": "Hortifruti", "congelados": "Congelados",
    "bebe": "Bebê", "pet": "Pet", "pet shop": "Pet", "utilidades": "Utilidades", "doces": "Doces e Biscoitos",
}


def _sem(s: str) -> str:
    return unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower().strip()


def casa(nome: str, termo: str) -> bool:
    """Mesma regra do app (casaItem): a primeira palavra abre o nome, as outras em qualquer lugar."""
    n, (primeira, *resto) = _sem(nome), _sem(termo).split()
    return n.startswith(primeira) and all(p in n for p in resto)


def converter(produtos: list[dict], termo: str) -> list[Oferta]:
    saida = []
    for p in produtos:
        nome = (p.get("productName") or "").strip()
        if not nome or not casa(nome, termo):
            continue
        item = (p.get("items") or [{}])[0]
        oferta = ((item.get("sellers") or [{}])[0]).get("commertialOffer") or {}
        preco, de = oferta.get("Price"), oferta.get("ListPrice")
        if not preco or preco <= 0 or not oferta.get("AvailableQuantity"):
            continue
        img = ((item.get("images") or [{}])[0]).get("imageUrl")
        cat = _sem(((p.get("categories") or ["/"])[0]).strip("/").split("/")[0])
        saida.append(Oferta(
            mercado="carrefour", produto=nome, marca=p.get("brand") or "",
            categoria=CATEGORIA.get(cat, "Outros"), preco_por=float(preco),
            preco_de=float(de) if de and de > preco else None,
            url=f"{BASE}/{p.get('linkText')}/p" if p.get("linkText") else None,
            imagem=img or None, ref=str(p.get("productId") or ""),
            condicao="Online · entrega · pontua na Livelo",
        ))
    return sorted(saida, key=lambda o: o.preco_por)[:POR_TERMO]


def coletar(c: httpx.Client) -> tuple[str, list[Oferta]]:
    termos = lista_app._rpc("mercado_livelo_termos_h", {}) or []
    vistas: dict[str, Oferta] = {}
    for t in termos:
        r = c.get(f"{BASE}/api/catalog_system/pub/products/search", params={"ft": t, "_from": 0, "_to": 19})
        r.raise_for_status()  # bloqueio do site derruba o mercado na hora (o app segue com os outros)
        for o in converter(r.json(), t):
            vistas.setdefault(o.ref or o.produto, o)
        time.sleep(0.4)
    return f"online ({len(termos)} itens buscados)", list(vistas.values())
