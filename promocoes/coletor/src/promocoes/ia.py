"""Chamadas de IA com visao: Gemini (camada 1) e OpenRouter (camada 2).

So modelos gratuitos. Cada resposta fica em cache pelo hash da imagem + modelo +
pergunta, entao a mesma pagina nunca e processada duas vezes.
"""

import base64
import hashlib
import json
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

# O free do Gemini da ~20 leituras por dia POR MODELO. Quando a cota de um acaba,
# passa para o proximo da lista (todos com visao; a ordem e do mais forte para o mais leve).
GEMINI = os.environ.get(
    "PROMOCOES_MODELOS_EXTRATOR",
    "gemini-2.5-flash,gemini-3.5-flash,gemini-3.6-flash,gemini-3-flash-preview,"
    "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-flash-lite-latest",
).split(",")
# Outra familia (NVIDIA), para nao repetir o mesmo vies da camada 1.
VALIDADOR = os.environ.get("PROMOCOES_MODELO_VALIDADOR", "nvidia/nemotron-3.5-super-vl:free")

TENTATIVAS = 4
INTERVALO_MIN_S = 4.0  # free do OpenRouter: 20 req/min; folga para os dois provedores

_ultima = 0.0
_trava = threading.Lock()
_trava_log = threading.Lock()
_esgotados: set[str] = set()


def _espacar() -> None:
    # Paginas rodam em paralelo; o espacamento entre requisicoes continua global.
    global _ultima
    with _trava:
        falta = INTERVALO_MIN_S - (time.monotonic() - _ultima)
        if falta > 0:
            time.sleep(falta)
        _ultima = time.monotonic()


class CotaEsgotada(Exception):
    """Cota diaria do modelo acabou: tentar de novo hoje nao adianta."""


def _post(url: str, chave: str, **kw) -> dict:
    """POST com retry. `chave` e o campo que a resposta boa precisa ter."""
    for n in range(TENTATIVAS):
        _espacar()
        try:
            r = httpx.post(url, timeout=600, **kw)
        except httpx.TransportError:
            if n == TENTATIVAS - 1:
                raise
            time.sleep(2 ** (n + 2))
            continue
        if r.status_code == 429 and "PerDay" in r.text:
            raise CotaEsgotada(url)
        if r.status_code in (429, 500, 502, 503, 504) and n < TENTATIVAS - 1:
            espera = float(r.headers.get("retry-after") or 2 ** (n + 3))
            time.sleep(min(espera, 120))
            continue
        r.raise_for_status()
        d = r.json()
        # O free as vezes responde 200 com {"error": ...} no corpo (fila cheia, provedor fora).
        if d.get(chave):
            return d
        if n == TENTATIVAS - 1:
            raise RuntimeError(f"resposta sem '{chave}': {str(d.get('error') or d)[:200]}")
        time.sleep(2 ** (n + 3))
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
        with _trava_log, self.log.open("a") as f:
            f.write(json.dumps({"em": datetime.now(timezone.utc).isoformat(), "modelo": modelo, "uso": uso, "chave": chave}) + "\n")
        return resp

    @staticmethod
    def _chave(img: bytes, modelo: str, pergunta: str) -> str:
        return hashlib.sha256(img + modelo.encode() + pergunta.encode()).hexdigest()[:32]

    def gemini(self, img: bytes, pergunta: str, schema: dict, modelos: list[str] | None = None):
        modelos = modelos or GEMINI
        # Leitura ja feita por qualquer modelo da lista vale: nao gasta cota de novo.
        for modelo in modelos:
            arq = self.cache / f"{self._chave(img, modelo, pergunta)}.json"
            if arq.exists():
                return json.loads(arq.read_text())
        for modelo in modelos:
            if modelo in _esgotados:
                continue
            try:
                return self._gemini(img, pergunta, schema, modelo)
            except CotaEsgotada:
                _esgotados.add(modelo)
            except httpx.HTTPStatusError as e:
                if e.response.status_code < 500:
                    raise
                # Fora do ar depois das tentativas: tenta o proximo modelo (sem marcar como esgotado).
        raise RuntimeError("nenhum modelo Gemini disponivel (cota diaria esgotada ou fora do ar)")

    def _gemini(self, img: bytes, pergunta: str, schema: dict, modelo: str):
        def chamar():
            d = _post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent",
                "candidates",
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
                "choices",
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
