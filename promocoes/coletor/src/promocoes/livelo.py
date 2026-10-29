"""Pontos Livelo por real de cada parceiro, sempre atualizados (migration 0046).

A Livelo publica a tabela de pontos (paridades) num endereco aberto, o mesmo que o site
dela usa para mostrar "ganhe N pontos por real". As campanhas ("ate 10 pts so hoje")
mudam de um dia para o outro, por isso roda varias vezes ao dia (.github/workflows/livelo.yml).

A tabela traz so o codigo do parceiro; NOMES diz quais sao os de mercado e casa. Parceiro
sem nome tambem vai para o banco (a casa pode escolher pelo codigo), so nao aparece na lista.
"""

import html
import re

import httpx

from . import lista_app

URL = "https://apis.pontoslivelo.com.br/api-bff-partners-parities/v1/parities/active"

# Codigo da Livelo -> nome. So os conferidos pelo texto da propria campanha.
NOMES = {
    "CRM": "Carrefour Mercado",
    "CRF": "Carrefour Shopping",
    "EXT": "Extra",
    "MZL": "Magalu",
}


def _texto(h: str | None) -> str:
    t = re.sub(r"<[^>]+>", " ", h or "")
    return re.sub(r"\s+", " ", html.unescape(t)).strip()


def converter(bruto: list[dict]) -> list[dict]:
    saida = []
    for p in bruto:
        codigo = (p.get("partnerCode") or "").strip()
        if not codigo or p.get("parity") is None:
            continue
        regra = _texto(p.get("legalTerms"))
        saida.append({
            "codigo": codigo,
            "nome": NOMES.get(codigo),
            "pontos": float(p["parity"]),
            "pontos_clube": float(p.get("parityClub") or p["parity"]),
            "pontos_normal": float(p.get("parityBau") or p["parity"]),
            "promocao": bool(p.get("promotion")),
            "ate": p.get("separatorSlug") == "ATE",
            "regra": "" if regra.lower().startswith("consulte o regulamento") else regra,
        })
    return saida


def atualizar() -> str:
    r = httpx.get(URL, timeout=60)
    r.raise_for_status()
    itens = converter(r.json())
    if not itens:
        raise RuntimeError("a Livelo respondeu sem parceiros")
    res = lista_app._rpc("mercado_livelo_paridades_h", {"p_itens": itens})
    promo = [f"{i['nome']} {i['pontos']:g} pts" for i in itens if i["nome"] and i["promocao"]]
    return f"livelo | {res.get('parceiros', 0)} parceiros | campanhas: {', '.join(promo) or 'nenhuma'}"
