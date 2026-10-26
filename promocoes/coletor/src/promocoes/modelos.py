from datetime import datetime

from pydantic import BaseModel


class Encarte(BaseModel):
    """Um encarte vigente, como o mercado publica."""

    mercado: str
    id: str
    titulo: str
    url: str
    formato: str  # "pdf" ou "imagem"
    inicio: datetime | None = None
    fim: datetime | None = None


class EncarteBaixado(BaseModel):
    """O que ficou salvo em disco depois da coleta."""

    encarte: Encarte
    sha256: str
    arquivo: str
    paginas: list[str]
    baixado_em: datetime
    novo: bool  # False quando o mesmo arquivo ja tinha sido coletado
