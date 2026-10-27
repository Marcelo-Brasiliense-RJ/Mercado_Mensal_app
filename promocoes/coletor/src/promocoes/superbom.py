"""Superbom: o site e uma loja online, entao as ofertas ja vem com nome e preco.

Nao precisa de IA. O detalhe e a loja: sem escolher, o site mostra Campos dos
Goytacazes. A loja fica na sessao, gravada ao salvar um horario de retirada
(so a preferencia do carrinho, nenhum pedido e feito).
"""

import html
import json
import re
import time
from datetime import date, timedelta

import httpx

from .modelos import Oferta

BASE = "https://www.redesuperbom.com.br"
LOJA_CURICICA = "14"  # Estr. dos Bandeirantes, 7150 (pagina /lojas/)
AJAX = {
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Referer": BASE + "/ofertas/",
}


def _preco(s: str | None) -> float | None:
    if not s:
        return None
    m = re.search(r"(\d{1,3}(?:\.\d{3})*,\d{2})", s)
    return float(m.group(1).replace(".", "").replace(",", ".")) if m else None


def local_atual(pagina: str) -> str:
    m = re.search(r'data-unidade="\d+">([^<]+)<', pagina)
    return m.group(1).strip() if m else "?"


def _get(c: httpx.Client, url: str, **kw) -> httpx.Response:
    """GET com 3 tentativas: o site derruba conexao de vez em quando (visto no GitHub Actions)."""
    for n in range(3):
        try:
            r = c.get(url, **kw)
            r.raise_for_status()
            return r
        except (httpx.TransportError, httpx.HTTPStatusError):
            if n == 2:
                raise
            time.sleep(5 * (n + 1))
    raise RuntimeError("sem resposta")


def escolher_loja(c: httpx.Client, loja: str = LOJA_CURICICA) -> None:
    _get(c, BASE + "/ofertas/")
    c.post(BASE + "/carrinho/change-region/", headers=AJAX)
    c.post(BASE + "/carrinho/change-type-ship/", data={"tipo": "2"}, headers=AJAX)
    c.post(BASE + "/carrinho/load-calendar/", data={"type": "2", "ponto_retirada": loja}, headers=AJAX)
    # Primeiro dia com horario livre nos proximos 7.
    for k in range(1, 8):
        d = (date.today() + timedelta(days=k)).strftime("%d/%m/%Y")
        r = c.post(BASE + "/carrinho/load-horarios/", data={"type": "2", "date": d, "ponto_retirada": loja}, headers=AJAX)
        horarios = r.json().get("horarios") or []
        if horarios:
            c.post(
                BASE + "/carrinho/save-schedule/",
                data={"type": "2", "date": d, "horario": str(horarios[0]["id_unidade_horario"]), "ponto_retirada": loja},
                headers=AJAX,
            ).raise_for_status()
            return
    raise RuntimeError("nenhum horario de retirada livre para fixar a loja")


def ler_pagina(pagina: str) -> list[Oferta]:
    ofertas = []
    # Cada produto e um <div class="item-produto ..."> (com variacao ou nao); o link traz um JSON de tracking.
    for bloco in re.split(r'<div class="item-produto(?: [^"]*)?">', pagina)[1:]:
        m = re.search(r'data-tracking="([^"]+)"', bloco)
        if not m:
            continue
        t = json.loads(html.unescape(m.group(1)))
        de = _preco((re.search(r'item-produto__price-de">.*?<span>([^<]+)', bloco, re.S) or [None, None])[1])
        por = _preco((re.search(r'item-produto__price-por">.*?<span>([^<]+)', bloco, re.S) or [None, None])[1])
        por = por or t.get("price")
        if not por:
            continue  # sem preco publico (ex.: so no clube)
        url = re.search(r'href="([^"]+)"', bloco)
        img = re.search(r'<img[^>]+src="([^"]+)"', bloco)
        ofertas.append(
            Oferta(
                mercado="superbom",
                produto=t["name"],
                marca=t.get("brand") or "",
                categoria=t.get("category") or "",
                preco_por=por,
                preco_de=de,
                url=url.group(1) if url else None,
                imagem=img.group(1) if img else None,
                ref=str(t.get("id")),
            )
        )
    return ofertas


def coletar(c: httpx.Client, pausa_s: float = 2.0, max_paginas: int = 120) -> tuple[str, list[Oferta]]:
    escolher_loja(c)
    todas: dict[str, Oferta] = {}
    local = "?"
    for n in range(1, max_paginas + 1):
        r = _get(c, BASE + "/ofertas/", params={"page": n})
        if n == 1:
            local = local_atual(r.text)
            if "curicica" not in local.lower():
                raise RuntimeError(f"loja nao fixou: site mostra {local}")
        novas = [o for o in ler_pagina(r.text) if o.ref not in todas]
        if not novas:
            break
        todas.update((o.ref, o) for o in novas)
        time.sleep(pausa_s)
    return local, list(todas.values())
