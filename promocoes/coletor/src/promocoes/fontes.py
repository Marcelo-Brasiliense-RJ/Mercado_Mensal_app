"""Onde cada mercado publica o encarte. Uma funcao por mercado.

Cada funcao recebe o HTML da pagina e devolve os encartes vigentes.
Separar o parse do download deixa testar com o HTML real salvo em fixtures/.
"""

import hashlib
import html as html_lib
import json
import re
from datetime import datetime, timedelta, timezone

from .modelos import Encarte

URLS = {
    "mundial": "https://www.supermercadosmundial.com.br/encarte",
    "guanabara": "https://www.supermercadosguanabara.com.br/encarte",
    "supermarket": "https://redesupermarket.com.br/ofertas/",
}
# Fim do dia no horario do Rio (UTC-3, sem horario de verao).
BRT = timezone(timedelta(hours=-3))


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


def _texto(pagina: str) -> str:
    sem = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", pagina, flags=re.S)
    return html_lib.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", sem)))


def _dia(d: str, m: str, a: str, fim: bool = False) -> datetime:
    return datetime(int(a), int(m), int(d), 23 if fim else 0, 59 if fim else 0, tzinfo=BRT)


def guanabara(html: str) -> list[Encarte]:
    # Drupal: cada pagina e uma <img> no estilo "encarte". A original (sem /styles/...) tem o dobro de resolucao.
    miniaturas = re.findall(r'src="(https://www\.supermercadosguanabara\.com\.br/sites/default/files/styles/encarte/[^"]+)"', html)
    urls = list(dict.fromkeys(re.sub(r"/styles/encarte/adaptive-image/public/", "/", u).split("?")[0] for u in miniaturas))
    if not urls:
        return []
    m = re.search(r"válidas[^0-9]*(\d{2})/(\d{2})/(\d{4}).{0,40}?até[^0-9]*(\d{2})/(\d{2})/(\d{4})", _texto(html))
    return [Encarte(
        mercado="guanabara",
        id=hashlib.sha256("|".join(urls).encode()).hexdigest()[:12],
        titulo=m.group(0) if m else "Encarte Guanabara",
        url=urls[0],
        urls=urls,
        formato="imagens",
        inicio=_dia(*m.groups()[:3]) if m else None,
        fim=_dia(*m.groups()[3:], fim=True) if m else None,
    )]


def supermarket(html: str) -> list[Encarte]:
    # WordPress: o PDF da semana leva os dias no nome (guia-26-28.pdf); a validade vem no texto.
    t = _texto(html)
    m = re.search(r"válidas.{0,60}?(\d{1,2}) a (\d{1,2})/(\d{2})/(\d{4})", t)
    if not m:
        return []
    ini, fim, mes, ano = m.groups()
    pdfs = dict.fromkeys(re.findall(r'href="(https://redesupermarket\.com\.br/wp-content/uploads/[^"]+\.pdf)"', html))
    pdfs = list(pdfs) + [u for u in re.findall(r'(https://redesupermarket\.com\.br/wp-content/uploads/[^"\s]+\.pdf)', html) if u not in pdfs]
    vigentes = [u for u in pdfs if re.search(rf"-{int(ini):02d}-{int(fim):02d}\.pdf$|-{ini}-{fim}\.pdf$", u)]
    return [Encarte(
        mercado="supermarket",
        id=u.rsplit("/", 1)[1].removesuffix(".pdf"),
        titulo=m.group(0),
        url=u,
        formato="pdf",
        inicio=_dia(ini, mes, ano),
        fim=_dia(fim, mes, ano, fim=True),
    ) for u in vigentes]


PARSERS = {"mundial": mundial, "guanabara": guanabara, "supermarket": supermarket}
# Crawl-delay do robots.txt, quando o site pede.
PAUSA = {"guanabara": 10.0}
