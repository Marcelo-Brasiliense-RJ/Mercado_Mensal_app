"""Chamadas de IA com visao: Gemini (camada 1) e OpenRouter (camada 2).

So modelos gratuitos. Cada resposta fica em cache pelo hash da imagem + modelo +
pergunta, entao a mesma pagina nunca e processada duas vezes.
"""

import base64
import hashlib
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

GEMINI = os.environ.get("PROMOCOES_MODELO_EXTRATOR", "gemini-2.5-flash")
# Outra familia (NVIDIA), para nao repetir o mesmo vies da camada 1.
VALIDADOR = os.environ.get("PROMOCOES_MODELO_VALIDADOR", "nvidia/nemotron-3.5-super-vl:free")

TENTATIVAS = 4
INTERVALO_MIN_S = 4.0  # free do OpenRouter: 20 req/min; folga para os dois provedores

_ultima = 0.0


def _espacar() -> None:
    global _ultima
    falta = INTERVALO_MIN_S - (time.monotonic() - _ultima)
    if falta > 0:
        time.sleep(falta)
    _ultima = time.monotonic()


def _post(url: str, **kw) -> dict:
    for n in range(TENTATIVAS):
        _espacar()
        try:
            r = httpx.post(url, timeout=600, **kw)
        except httpx.TransportError:
            if n == TENTATIVAS - 1:
                raise
            time.sleep(2 ** (n + 2))
            continue
        if r.status_code in (429, 500, 502, 503, 504) and n < TENTATIVAS - 1:
            espera = float(r.headers.get("retry-after") or 2 ** (n + 3))
            time.sleep(min(espera, 120))
            continue
        r.raise_for_status()
        return r.json()
    raise RuntimeError("sem resposta")


def _json(txt: str):
    ini = min((i for i in (txt.find("{"), txt.find("[")) if i >= 0), default=0)
    fim = max(txt.rfind("}"), txt.rfind("]")) + 1
    return json.loads(txt[ini:fim])


class IA:
    def __init__(self, base: Path):
        self.cache = base / "cache_ia"
        self.cache.mkdir(parents=True, exist_ok=True)
        self.log = base / "log_ia.jsonl"

    def _cacheado(self, chave: str, chamar):
        arq = self.cache / f"{chave}.json"
        if arq.exists():
            return json.loads(arq.read_text())
        resp, modelo, uso = chamar()
        arq.write_text(json.dumps(resp, ensure_ascii=False))
        with self.log.open("a") as f:
            f.write(json.dumps({"em": datetime.now(timezone.utc).isoformat(), "modelo": modelo, "uso": uso, "chave": chave}) + "\n")
        return resp

    @staticmethod
    def _chave(img: bytes, modelo: str, pergunta: str) -> str:
        return hashlib.sha256(img + modelo.encode() + pergunta.encode()).hexdigest()[:32]

    def gemini(self, img: bytes, pergunta: str, schema: dict, modelo: str = GEMINI):
        def chamar():
            d = _post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent",
                headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"]},
                json={
                    "contents": [{"parts": [
                        {"text": pergunta},
                        {"inline_data": {"mime_type": "image/jpeg", "data": base64.b64encode(img).decode()}},
                    ]}],
                    "generationConfig": {"responseMimeType": "application/json", "responseSchema": schema, "temperature": 0},
                },
            )
            return _json(d["candidates"][0]["content"]["parts"][0]["text"]), modelo, d.get("usageMetadata")

        return self._cacheado(self._chave(img, modelo, pergunta), chamar)

    def openrouter(self, img: bytes, pergunta: str, modelo: str = VALIDADOR):
        def chamar():
            d = _post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}"},
                json={
                    "model": modelo,
                    "temperature": 0,
                    "response_format": {"type": "json_object"},
                    "messages": [{"role": "user", "content": [
                        {"type": "text", "text": pergunta},
                        {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(img).decode()}},
                    ]}],
                },
            )
            return _json(d["choices"][0]["message"]["content"]), d.get("model", modelo), d.get("usage")

        return self._cacheado(self._chave(img, modelo, pergunta), chamar)
