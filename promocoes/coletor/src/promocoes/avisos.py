"""Aviso no celular (Web Push) quando um produto da lista "De olho" entra em promocao.

Roda depois de publicar. Le tudo de uma vez pela RPC mercado_push_pendentes_h (0039):
ofertas valendo, desejos das casas com aparelho inscrito e as inscricoes. Cada promocao
avisa uma vez por desejo (chave mercado|produto|preco|fim), mesmo republicada.

Precisa de VAPID_PRIVATE_KEY (Secret do GitHub; o par da chave publica que esta no app).
Sem ela, nao faz nada e diz por que.
"""

import json
import os
import re
import unicodedata
from datetime import datetime

from . import lista_app
from .coletor import RIO

DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]
NOMES = {"mundial": "Mundial", "guanabara": "Guanabara", "supermarket": "Supermarket",
         "superbom": "Superbom", "economia": "Rede Economia"}
# O servico de push da Apple exige um contato no token: mailto: ou https://dominio (sem caminho).
CONTATO = os.environ.get("VAPID_CONTATO") or "https://github.com"


def padrao(s: str) -> str:
    """Mesma normalizacao de web/src/lib/ofertas.ts (padrao): "1 Litro" -> "1l"."""
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"(\d)[\s,.]*(litros?|lt)\b", r"\1l", s)
    return re.sub(r"(\d)\s+(kg|g|ml|l|un)\b", r"\1\2", s)


def casa_desejo(o: dict, termo: str) -> bool:
    """Igual a casaDesejo do app: a primeira palavra abre o nome (ou um pedaco de
    "Paleta, Peito ou Acém Bovino"), as outras em qualquer lugar."""
    nome = padrao(" ".join(x for x in (o.get("produto"), o.get("marca"), o.get("tamanho")) if x))
    pedacos = [padrao(p.strip()) for p in re.split(r",|\s+ou\s+|\s+e\s+|/", o.get("produto") or "", flags=re.I)]
    primeira, *resto = padrao(termo).split() or [""]
    return bool(primeira) and any(p.startswith(primeira) for p in pedacos) and all(p in nome for p in resto)


def chave(o: dict) -> str:
    return f"{o['mercado']}|{padrao(o['produto'])}|{float(o['preco_por']):.2f}|{(o.get('fim') or '')[:10]}"


def brl(v: float) -> str:
    return "R$ " + f"{v:,.2f}".replace(",", "x").replace(".", ",").replace("x", ".")


def ate(fim: str | None) -> str:
    if not fim:
        return "preço de hoje"
    d = datetime.fromisoformat(fim).astimezone(RIO)
    return f"até {DIAS[d.weekday()]} {d:%d/%m}"


def novidades(p: dict) -> dict[str, list[tuple[dict, dict]]]:
    """Por casa: (desejo, oferta mais barata ainda nao avisada) de cada desejo em promocao."""
    por_casa: dict[str, list[tuple[dict, dict]]] = {}
    for d in p.get("desejos", []):
        vistos = set(d.get("avisados") or [])
        achadas = sorted((o for o in p.get("ofertas", []) if casa_desejo(o, d["termo"])),
                         key=lambda o: float(o["preco_por"]))
        nova = next((o for o in achadas if chave(o) not in vistos), None)
        if nova:
            por_casa.setdefault(d["household_id"], []).append((d, nova))
    return por_casa


def mensagem(achados: list[tuple[dict, dict]]) -> dict:
    """Uma notificacao por casa: um produto vira titulo; varios viram lista curta."""
    linha = lambda d, o: f"{NOMES.get(o['mercado'], o['mercado'])} {brl(float(o['preco_por']))} {ate(o.get('fim'))}"
    if len(achados) == 1:
        d, o = achados[0]
        return {"title": f"⭐ {d['nome']} em promoção", "body": linha(d, o), "url": "/app/ofertas#de-olho"}
    corpo = "\n".join(f"{d['nome']}: {linha(d, o)}" for d, o in achados[:4])
    if len(achados) > 4:
        corpo += f"\n+{len(achados) - 4} outros"
    return {"title": f"⭐ {len(achados)} produtos de olho em promoção", "body": corpo, "url": "/app/ofertas#de-olho"}


def avisar() -> str:
    chave_privada = os.environ.get("VAPID_PRIVATE_KEY")
    if not chave_privada:
        return "avisos | sem VAPID_PRIVATE_KEY nos Secrets: nada enviado"
    from pywebpush import WebPushException, webpush

    p = lista_app._rpc("mercado_push_pendentes_h", {})
    por_casa = novidades(p)
    avisos, mortas, enviados, falhas = [], [], 0, 0
    for casa, achados in por_casa.items():
        dados = json.dumps(mensagem(achados), ensure_ascii=False)
        entregue = False
        for i in (x for x in p.get("inscricoes", []) if x["household_id"] == casa):
            try:
                webpush({"endpoint": i["endpoint"], "keys": {"p256dh": i["p256dh"], "auth": i["auth"]}},
                        dados, vapid_private_key=chave_privada, vapid_claims={"sub": CONTATO}, ttl=86400)
                entregue, enviados = True, enviados + 1
            except WebPushException as e:
                if e.response is not None and e.response.status_code in (404, 410):
                    mortas.append(i["endpoint"])  # app apagado ou aviso desligado no aparelho
                else:
                    falhas += 1
        if entregue:  # so marca como avisado o que chegou em algum aparelho
            avisos += [{"desejo_id": d["id"], "chave": chave(o)} for d, o in achados]
    if avisos or mortas:
        lista_app._rpc("mercado_push_registrar_h", {"p_avisos": avisos, "p_mortas": mortas})
    return (f"avisos | {sum(map(len, por_casa.values()))} promoções novas de olho | {enviados} notificações"
            f" | {len(mortas)} aparelhos saíram" + (f" | {falhas} falharam" if falhas else ""))
