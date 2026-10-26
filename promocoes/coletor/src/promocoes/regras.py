"""Regras sem IA. Rodam por cima de qualquer extracao."""

import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

from .modelos import Oferta

VARIACAO_MAX = 0.5  # mais de 50% de diferenca do historico: provavel erro de leitura


def chave(o: Oferta) -> str:
    """Nome normalizado para comparar o mesmo produto entre semanas."""
    t = f"{o.produto} {o.marca} {o.tamanho}".lower()
    t = unicodedata.normalize("NFD", t).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def historico(base: Path, mercado: str, antes_de: str) -> dict[str, float]:
    """Ultimo preco visto de cada produto, em coletas anteriores ao dia informado."""
    visto: dict[str, float] = {}
    for arq in sorted((base / "ofertas" / mercado).glob("*.json")):
        if arq.stem >= antes_de:
            continue
        for d in json.loads(arq.read_text()):
            o = Oferta.model_validate(d)
            if o.status == "ok":
                visto[chave(o)] = o.preco_por
    return visto


def _revisar(o: Oferta, motivo: str) -> Oferta:
    return o.model_copy(update={"status": "revisar", "motivo": motivo if not o.motivo else f"{o.motivo} {motivo}"})


def aplicar_regras(o: Oferta, hist: dict[str, float], agora: datetime | None = None) -> Oferta:
    agora = agora or datetime.now(timezone.utc)
    if o.preco_por <= 0:
        return _revisar(o, "Preço zero ou negativo.")
    if o.preco_de is not None and o.preco_por >= o.preco_de:
        return _revisar(o, f"Preço “por” ({o.preco_por:.2f}) não é menor que o “de” ({o.preco_de:.2f}).")
    if o.fim and o.fim < agora:
        return _revisar(o, "Encarte já vencido.")
    antes = hist.get(chave(o))
    if antes and abs(o.preco_por - antes) / antes > VARIACAO_MAX:
        return _revisar(o, f"Variação de {abs(o.preco_por - antes) / antes:.0%} contra o último preço visto ({antes:.2f}).")
    return o
