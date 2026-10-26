"""Ponte com o app Mercado Mensal: le a lista (0037) e publica as ofertas (0038).

Le pela RPC mercado_promo_lista_h (migration 0037), so leitura. Precisa de:
    SUPABASE_URL, SUPABASE_KEY (service_role) e PROMOCOES_CASA (id da casa em households).
Sem isso, usa data/lista.json se existir: o prototipo continua funcionando com a lista local.
"""

import json
import os
from pathlib import Path

import httpx


def _url_do_app() -> str | None:
    """SUPABASE_URL, ou a mesma URL que o app web usa (NEXT_PUBLIC_SUPABASE_URL...)."""
    if os.environ.get("SUPABASE_URL"):
        return os.environ["SUPABASE_URL"]
    return next((v for k, v in sorted(os.environ.items()) if k.startswith("NEXT_PUBLIC_SUPABASE_URL") and v), None)


def _rpc(nome: str, corpo: dict, *precisa: str):
    # A chave tem que ser a service_role: a anon (publica, do app) nao executa estas funcoes.
    env = {"SUPABASE_URL": _url_do_app(),
           "SUPABASE_KEY": os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY"),
           **{k: os.environ.get(k) for k in precisa}}
    faltam = [k for k, v in env.items() if not v]
    if faltam:
        raise RuntimeError(f"faltam variaveis: {', '.join(faltam)}")
    chave = env["SUPABASE_KEY"]
    r = httpx.post(
        f"{env['SUPABASE_URL'].rstrip('/')}/rest/v1/rpc/{nome}",
        headers={"apikey": chave, "Authorization": f"Bearer {chave}"},
        json=corpo,
        timeout=120,
    )
    r.raise_for_status()
    return r.json()


def buscar() -> list[dict]:
    return _rpc("mercado_promo_lista_h", {"h": os.environ.get("PROMOCOES_CASA")}, "PROMOCOES_CASA") or []


def publicar(mercado: str, ofertas: list[dict]) -> dict:
    """Troca as ofertas do mercado no app (migration 0038). So mandar as aprovadas."""
    return _rpc("mercado_promo_publicar_h", {"p_mercado": mercado, "p_ofertas": ofertas})


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
