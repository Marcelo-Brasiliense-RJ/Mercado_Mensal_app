"""Baixa os encartes vigentes e gera uma imagem por pagina.

Layout em disco:
    data/encartes/<mercado>/<id>/encarte.pdf
    data/encartes/<mercado>/<id>/p01.jpg ...
    data/encartes/<mercado>/<id>/manifest.json
"""

import hashlib
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
import pypdfium2 as pdfium

from .fontes import PARSERS, PAUSA, URLS
from .modelos import Encarte, EncarteBaixado

# Uso pessoal e baixa frequencia: identifica o robo e espaca as requisicoes.
HEADERS = {"User-Agent": "MercadoMensal-Monitor/0.1 (uso pessoal)"}
PAUSA_S = 2.0
RIO = ZoneInfo("America/Sao_Paulo")
DPI = 150  # legivel para a IA sem gerar imagem enorme


def _sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()


def _paginas_pdf(pdf: Path, destino: Path) -> list[str]:
    doc = pdfium.PdfDocument(str(pdf))
    nomes = []
    for i, pagina in enumerate(doc, start=1):
        nome = f"p{i:02d}.jpg"
        pagina.render(scale=DPI / 72).to_pil().convert("RGB").save(destino / nome, quality=85)
        nomes.append(nome)
    doc.close()
    return nomes


def _download(cliente: httpx.Client, url: str, destino: Path) -> None:
    tmp = destino.with_suffix(".part")
    with cliente.stream("GET", url) as r:
        r.raise_for_status()
        with tmp.open("wb") as f:
            for bloco in r.iter_bytes():
                f.write(bloco)
    tmp.replace(destino)


def _baixar_imagens(enc: Encarte, pasta: Path, cliente: httpx.Client, pausa: float) -> EncarteBaixado:
    manifesto = pasta / "manifest.json"
    if manifesto.exists():  # id ja e o hash das URLs: mesmas paginas, nada a baixar
        antigo = EncarteBaixado.model_validate_json(manifesto.read_text())
        if all((pasta / p).exists() for p in antigo.paginas):
            return antigo.model_copy(update={"novo": False})
    paginas, h = [], hashlib.sha256()
    for i, u in enumerate(enc.urls, start=1):
        if i > 1:
            time.sleep(pausa)
        nome = f"p{i:02d}.jpg"
        _download(cliente, u, pasta / nome)
        h.update((pasta / nome).read_bytes())
        paginas.append(nome)
    feito = EncarteBaixado(encarte=enc, sha256=h.hexdigest(), arquivo=paginas[0], paginas=paginas,
                           baixado_em=datetime.now(timezone.utc), novo=True)
    manifesto.write_text(feito.model_dump_json(indent=2))
    return feito


def baixar(enc: Encarte, base: Path, cliente: httpx.Client, pausa: float = PAUSA_S) -> EncarteBaixado:
    pasta = base / "encartes" / enc.mercado / enc.id
    pasta.mkdir(parents=True, exist_ok=True)
    if enc.formato == "imagens":
        return _baixar_imagens(enc, pasta, cliente, pausa)
    manifesto = pasta / "manifest.json"
    ext = "pdf" if enc.formato == "pdf" else Path(enc.url).suffix.lstrip(".") or "jpg"
    arquivo = pasta / f"encarte.{ext}"

    # Mesmo id ja coletado e arquivo intacto: nao baixa de novo.
    if manifesto.exists() and arquivo.exists():
        antigo = EncarteBaixado.model_validate_json(manifesto.read_text())
        if antigo.sha256 == _sha256(arquivo):
            return antigo.model_copy(update={"novo": False})

    _download(cliente, enc.url, arquivo)

    paginas = _paginas_pdf(arquivo, pasta) if enc.formato == "pdf" else [arquivo.name]
    feito = EncarteBaixado(
        encarte=enc,
        sha256=_sha256(arquivo),
        arquivo=arquivo.name,
        paginas=paginas,
        baixado_em=datetime.now(timezone.utc),
        novo=True,
    )
    manifesto.write_text(feito.model_dump_json(indent=2))
    return feito


def coletar(mercado: str, base: Path) -> list[EncarteBaixado]:
    if mercado not in PARSERS:
        raise ValueError(f"mercado sem coletor: {mercado}")
    with httpx.Client(headers=HEADERS, timeout=60, follow_redirects=True) as cliente:
        r = cliente.get(URLS[mercado])
        r.raise_for_status()
        encartes = PARSERS[mercado](r.text)
        feitos = []
        pausa = PAUSA.get(mercado, PAUSA_S)
        for enc in encartes:
            time.sleep(pausa)
            feitos.append(baixar(enc, base, cliente, pausa))
        return feitos


def resumo(feitos: list[EncarteBaixado]) -> str:
    if not feitos:
        return "nenhum encarte vigente encontrado"
    linhas = []
    for f in feitos:
        e = f.encarte
        ate = e.fim.astimezone(RIO).strftime("%d/%m %H:%M") if e.fim else "?"
        estado = "novo" if f.novo else "ja tinha"
        linhas.append(f"{e.mercado} #{e.id} | {e.titulo} | {len(f.paginas)} pag. | ate {ate} | {estado}")
    return "\n".join(linhas)


def salvar_json(feitos: list[EncarteBaixado], destino: Path) -> None:
    destino.write_text(json.dumps([json.loads(f.model_dump_json()) for f in feitos], indent=2, ensure_ascii=False))
