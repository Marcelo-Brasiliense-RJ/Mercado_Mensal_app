"""Foto de cada oferta, pequena o bastante para ir embutida no prototipo.

- Encarte (lido por IA): o Gemini devolve onde cada produto esta na pagina e a foto
  e recortada do proprio encarte. Uma chamada por pagina, com a lista ja extraida,
  entao a resposta vem na mesma ordem dos itens.
- Site com foto (Superbom): baixa a miniatura uma vez e guarda.
"""

import base64
import json
import time
from io import BytesIO
from pathlib import Path

import httpx
from PIL import Image

from .coletor import HEADERS
from .ia import IA

# Posicao na imagem: o 2.5-flash devolve caixas em grade, deslocadas; os 3.x acertam.
MODELOS_CAIXAS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-lite-latest",
                  "gemini-3.5-flash", "gemini-3.6-flash", "gemini-3-flash-preview"]
LADO = 120  # px do lado maior da miniatura
QUALIDADE = 60

SCHEMA_CAIXAS = {
    "type": "ARRAY",
    "items": {"type": "OBJECT", "properties": {
        "i": {"type": "INTEGER"},
        "box_2d": {"type": "ARRAY", "items": {"type": "INTEGER"}},
    }, "required": ["i", "box_2d"]},
}

PERGUNTA_CAIXAS = """Encarte de supermercado. Para cada produto da lista, devolva a caixa da FOTO da embalagem
(sem o selo de preço) em box_2d = [ymin, xmin, ymax, xmax], de 0 a 1000. Responda só JSON.
LISTA: {lista}"""


def _miniatura(img: Image.Image, destino: Path) -> None:
    img = img.convert("RGB")
    img.thumbnail((LADO, LADO))
    destino.parent.mkdir(parents=True, exist_ok=True)
    img.save(destino, "WEBP", quality=QUALIDADE)


def recortar_encarte(base: Path, mercado: str) -> int:
    """Preenche 'foto' nas ofertas do dia de um mercado com encarte. Devolve quantas ganharam foto."""
    arqs = sorted((base / "ofertas" / mercado).glob("*.json"))
    if not arqs:
        return 0
    arq = arqs[-1]
    ofertas = json.loads(arq.read_text())
    ia = IA(base)
    feitas = 0
    paginas: dict[tuple[str, int], list[int]] = {}
    for k, o in enumerate(ofertas):
        if o.get("pagina") and o.get("ref"):
            paginas.setdefault((o["ref"].rsplit("-p", 1)[0], o["pagina"]), []).append(k)
    for (enc_id, n), idx in sorted(paginas.items()):
        pagina = base / "encartes" / mercado / enc_id / f"p{n:02d}.jpg"
        if not pagina.exists():
            continue
        destinos = [base / "fotos" / mercado / f"{enc_id}-p{n:02d}-{j:03d}.webp" for j in range(len(idx))]
        if all(d.exists() for d in destinos):
            for k, d in zip(idx, destinos):
                ofertas[k]["foto"] = str(d.relative_to(base))
            feitas += len(idx)
            continue
        lista = [{"i": j, "produto": f"{ofertas[k]['produto']} {ofertas[k].get('marca') or ''}".strip()} for j, k in enumerate(idx)]
        try:
            caixas = ia.gemini(pagina.read_bytes(), PERGUNTA_CAIXAS.format(lista=json.dumps(lista, ensure_ascii=False)), SCHEMA_CAIXAS,
                               MODELOS_CAIXAS)
        except Exception as erro:  # sem foto nao e erro: o card mostra o icone da categoria
            print(f"  {mercado} p{n}: sem caixas ({str(erro)[:80]})", flush=True)
            continue
        img = Image.open(pagina)
        w, h = img.size
        for c in caixas:
            j, b = c.get("i"), c.get("box_2d") or []
            if not isinstance(j, int) or not 0 <= j < len(idx) or len(b) != 4:
                continue
            y0, x0, y1, x1 = (max(0, min(1000, v)) for v in b)
            if y1 - y0 < 15 or x1 - x0 < 15:
                continue
            _miniatura(img.crop((x0 * w // 1000, y0 * h // 1000, x1 * w // 1000, y1 * h // 1000)), destinos[j])
            ofertas[idx[j]]["foto"] = str(destinos[j].relative_to(base))
            feitas += 1
        print(f"  {mercado} p{n}: {sum(1 for k in idx if ofertas[k].get('foto'))}/{len(idx)} fotos", flush=True)
    arq.write_text(json.dumps(ofertas, ensure_ascii=False, indent=1))
    return feitas


def baixar_do_site(base: Path, mercado: str, pausa_s: float = 0.3) -> int:
    """Miniaturas das ofertas que ja vem com URL de foto (Superbom)."""
    arqs = sorted((base / "ofertas" / mercado).glob("*.json"))
    if not arqs:
        return 0
    arq = arqs[-1]
    ofertas = json.loads(arq.read_text())
    feitas = 0
    with httpx.Client(headers=HEADERS, timeout=30) as c:
        for o in ofertas:
            if not o.get("imagem"):
                continue
            destino = base / "fotos" / mercado / f"{o.get('ref') or abs(hash(o['imagem']))}.webp"
            if not destino.exists():
                try:
                    r = c.get(o["imagem"])
                    r.raise_for_status()
                    _miniatura(Image.open(BytesIO(r.content)), destino)
                except Exception:
                    continue
                time.sleep(pausa_s)
            o["foto"] = str(destino.relative_to(base))
            feitas += 1
    arq.write_text(json.dumps(ofertas, ensure_ascii=False, indent=1))
    return feitas


def data_uri(base: Path, foto: str | None) -> str | None:
    if not foto or not (base / foto).exists():
        return None
    return "data:image/webp;base64," + base64.b64encode((base / foto).read_bytes()).decode()
