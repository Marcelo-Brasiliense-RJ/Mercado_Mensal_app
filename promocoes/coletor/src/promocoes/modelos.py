from datetime import datetime

from pydantic import BaseModel


class Encarte(BaseModel):
    """Um encarte vigente, como o mercado publica."""

    mercado: str
    id: str
    titulo: str
    url: str
    formato: str  # "pdf", "imagem" ou "imagens" (uma por pagina, em urls)
    urls: list[str] = []
    inicio: datetime | None = None
    fim: datetime | None = None


class Oferta(BaseModel):
    """Uma oferta ja estruturada (site com preco em texto, sem precisar de IA)."""

    mercado: str
    produto: str
    marca: str = ""
    categoria: str = ""
    preco_por: float
    preco_de: float | None = None
    url: str | None = None
    imagem: str | None = None
    ref: str | None = None  # id do produto no site do mercado
    # Campos de encarte (lido por IA); vazios nos sites com preco em texto.
    tamanho: str = ""
    condicao: str | None = None
    inicio: datetime | None = None
    fim: datetime | None = None
    pagina: int | None = None
    foto: str | None = None  # miniatura local (data/fotos/...), embutida no prototipo
    status: str = "ok"  # ok | revisar
    motivo: str | None = None


class EncarteBaixado(BaseModel):
    """O que ficou salvo em disco depois da coleta."""

    encarte: Encarte
    sha256: str
    arquivo: str
    paginas: list[str]
    baixado_em: datetime
    novo: bool  # False quando o mesmo arquivo ja tinha sido coletado
