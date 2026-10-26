"""Lista de compras vinda do app Mercado Mensal (pendentes + itens em "Repor").

Le pela RPC mercado_promo_lista_h (migration 0037), so leitura. Precisa de:
    SUPABASE_URL, SUPABASE_KEY (service_role) e PROMOCOES_CASA (id da casa em households).
Sem isso, usa data/lista.json se existir: o prototipo continua funcionando com a lista local.
"""

import json
import os
from pathlib import Path

import httpx


def buscar() -> list[dict]:
    url, chave, casa = (os.environ.get(k) for k in ("SUPABASE_URL", "SUPABASE_KEY", "PROMOCOES_CASA"))
    if not (url and chave and casa):
        faltam = [k for k, v in (("SUPABASE_URL", url), ("SUPABASE_KEY", chave), ("PROMOCOES_CASA", casa)) if not v]
        raise RuntimeError(f"faltam variaveis: {', '.join(faltam)}")
    r = httpx.post(
        f"{url.rstrip('/')}/rest/v1/rpc/mercado_promo_lista_h",
        headers={"apikey": chave, "Authorization": f"Bearer {chave}"},
        json={"h": casa},
        timeout=30,
    )
    r.raise_for_status()
    return r.json() or []


def salvar(base: Path, itens: list[dict]) -> Path:
    arq = base / "lista.json"
    arq.parent.mkdir(parents=True, exist_ok=True)
    arq.write_text(json.dumps({"origem": "app", "itens": itens}, ensure_ascii=False, indent=1))
    return arq


def carregar(base: Path) -> tuple[list[dict], str]:
    """(itens, origem). Arquivo que nao veio do comando `lista` (lista solta) conta como exemplo."""
    arq = base / "lista.json"
    if not arq.exists():
        return [], "nenhuma"
    d = json.loads(arq.read_text())
    return (d["itens"], d.get("origem", "app")) if isinstance(d, dict) else (d, "exemplo")
