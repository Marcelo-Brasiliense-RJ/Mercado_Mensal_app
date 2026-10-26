"""Onde cada mercado publica o encarte. Uma funcao por mercado.

Cada funcao recebe o HTML da pagina e devolve os encartes vigentes.
Separar o parse do download deixa testar com o HTML real salvo em fixtures/.
"""

import json
import re
from datetime import datetime

from .modelos import Encarte

URLS = {
    "mundial": "https://www.supermercadosmundial.com.br/encarte",
}


def _next_data(html: str) -> dict:
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        raise ValueError("pagina sem __NEXT_DATA__: o site mudou de formato")
    return json.loads(m.group(1))


def _data(s: str | None) -> datetime | None:
    return datetime.fromisoformat(s.replace("Z", "+00:00")) if s else None


def mundial(html: str) -> list[Encarte]:
    # O site e Next.js: a lista de encartes vem pronta no JSON da pagina,
    # com o PDF completo e as datas de publicacao. Nao precisa renderizar JS.
    itens = _next_data(html)["props"]["pageProps"].get("encartes", [])
    return [
        Encarte(
            mercado="mundial",
            id=str(e["id"]),
            titulo=e.get("description", ""),
            url=e["file"]["url"],
            formato="pdf" if e["file"].get("ext") == "pdf" else "imagem",
            inicio=_data(e.get("publishedIn")),
            fim=_data(e.get("unpublishedIn")),
        )
        for e in itens
        if e.get("status") == "active" and e.get("file", {}).get("url")
    ]


PARSERS = {"mundial": mundial}
