import argparse
import json
import os
import re
import sys
import unicodedata
from datetime import date, datetime, timezone
from pathlib import Path

import httpx

from . import fotos, lista_app, superbom
from .coletor import HEADERS, RIO, coletar, resumo
from .extracao import extrair
from .fontes import PARSERS
from .modelos import EncarteBaixado
from .regras import historico

# Mercados com ofertas em texto no site: coleta direta, sem encarte nem IA.
DIRETOS = {"superbom": superbom.coletar}


def coletar_direto(mercado: str, base: Path) -> str:
    with httpx.Client(headers=HEADERS, timeout=60, follow_redirects=True) as c:
        local, ofertas = DIRETOS[mercado](c)
    pasta = base / "ofertas" / mercado
    pasta.mkdir(parents=True, exist_ok=True)
    arq = pasta / f"{date.today().isoformat()}.json"
    arq.write_text(json.dumps([o.model_dump() for o in ofertas], ensure_ascii=False, indent=1))
    return f"{mercado} | loja: {local} | {len(ofertas)} ofertas | {arq}"


NOMES = {"superbom": "Superbom", "mundial": "Mundial", "guanabara": "Guanabara", "supermarket": "Supermarket"}
FONTES = {
    "superbom": "Site oficial · loja Curicica (preço em texto, sem IA)",
    "mundial": "Encarte em PDF do site · lido por IA (Gemini + Nemotron)",
    "guanabara": "Encarte em imagens do site · lido por IA (Gemini + Nemotron)",
    "supermarket": "Encarte em PDF do site · preço com CPF · lido por IA",
}
# Categorias do site do Superbom -> as mesmas usadas na leitura dos encartes.
CATEGORIA_COMUM = {
    "Matinais": "Mercearia", "Alimentos Básicos": "Mercearia", "Naturais e Saudáveis": "Mercearia",
    "Temperos e Conservas": "Mercearia", "Biscoitos e Salgadinhos": "Doces e Biscoitos",
    "Doces e Sobremesas": "Doces e Biscoitos", "Carnes, Aves e Peixes": "Carnes", "Bebidas Alcoólicas": "Bebidas",
    "Leites e Iogurtes": "Frios e Laticínios", "Pet Shop e Jardinagem": "Pet", "Utilidades Para O Lar": "Utilidades",
}
DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]


def _tokens(t: str) -> set[str]:
    t = unicodedata.normalize("NFD", t.lower()).encode("ascii", "ignore").decode()
    t = re.sub(r"(\d)[\s,.]*(litros?|lt)\b", r"\1l", t)
    t = re.sub(r"(\d)\s+(kg|g|ml|l|un)\b", r"\1\2", t)
    return set(re.findall(r"[a-z0-9]+", t))


def sem_repetidas(itens: list[dict], mercado: str = "") -> list[dict]:
    """Mesma oferta duas vezes no encarte (a capa do Guanabara repete as paginas de dentro):
    mesmo preco e todas as palavras de um nome dentro do outro. Sabor diferente fica
    ("Tradicional" x "Extra Forte"). O Superbom vem do site, um produto por codigo: nao mexe."""
    if mercado in DIRETOS:
        return itens
    por_preco: dict[float, list[set[str]]] = {}
    saida = []
    for o in itens:
        t = _tokens(f"{o['produto']} {o.get('marca') or ''} {o.get('tamanho') or ''}")
        iguais = por_preco.setdefault(round(o["preco_por"], 2), [])
        if any(t <= u or u <= t for u in iguais):
            continue
        iguais.append(t)
        saida.append(o)
    return saida


def _marca(o: dict) -> str:
    """Marca so quando ja nao esta no nome (a IA costuma repetir: 'Arroz Rei do Sul' + 'Rei do Sul')."""
    marca = (o.get("marca") or "").strip()
    if o["mercado"] == "superbom" or marca.lower() in ("", "marca não informada", "não informada"):
        return ""
    return "" if marca.lower() in o["produto"].lower() else marca


def _ate(fim: str | None) -> str | None:
    if not fim:
        return None
    d = datetime.fromisoformat(fim).astimezone(RIO)
    return f"{DIAS[d.weekday()]} {d:%d/%m}"


def extrair_encartes(mercado: str, base: Path) -> str:
    """Le com IA os encartes vigentes ja baixados e grava as ofertas do dia."""
    agora = datetime.now(timezone.utc)
    hoje = date.today().isoformat()
    hist = historico(base, mercado, hoje)
    ofertas = []
    for man in sorted((base / "encartes" / mercado).glob("*/manifest.json")):
        enc = EncarteBaixado.model_validate_json(man.read_text())
        if enc.encarte.fim and enc.encarte.fim < agora:
            continue
        print(f"{mercado} #{enc.encarte.id}: lendo {len(enc.paginas)} paginas", flush=True)
        ofertas += extrair(enc, man.parent, base, hist)
    if not ofertas:
        return f"{mercado}: nenhum encarte vigente baixado"
    pasta = base / "ofertas" / mercado
    pasta.mkdir(parents=True, exist_ok=True)
    arq = pasta / f"{hoje}.json"
    arq.write_text(json.dumps([o.model_dump(mode="json") for o in ofertas], ensure_ascii=False, indent=1))
    rev = sum(1 for o in ofertas if o.status == "revisar")
    return f"{mercado} | {len(ofertas)} ofertas ({rev} para revisar) | {arq}"


def exportar(base: Path, destino: Path) -> str:
    """Junta a coleta mais recente de cada mercado num .js que o prototipo carrega."""
    ofertas, mercados = [], {}
    for pasta in sorted((base / "ofertas").glob("*")):
        arqs = sorted(pasta.glob("*.json"))
        if not arqs:
            continue
        m, ultimo = pasta.name, arqs[-1]
        itens = sem_repetidas(json.loads(ultimo.read_text()), m)
        for o in itens:
            ofertas.append({
                "m": m,
                "cat": CATEGORIA_COMUM.get(c := (o["categoria"] or "Outros").split(" / ")[0], c),
                "produto": o["produto"],  # no Superbom o nome ja traz marca e tamanho
                "marca": _marca(o),
                "tam": o.get("tamanho") or "",
                "por": o["preco_por"],
                "de": o["preco_de"] or o["preco_por"],
                "ate": _ate(o.get("fim")),
                "img": fotos.data_uri(base, o.get("foto")) or o.get("imagem"),
                "cond": o.get("condicao"),
                "pag": o.get("pagina"),
                "st": o.get("status") or "ok",
                "motivo": o.get("motivo"),
            })
        dia = ultimo.stem.split("-")
        mercados[m] = {
            "nome": NOMES.get(m, m), "fonte": FONTES.get(m, ""), "status": "ok",
            "coleta": f"{dia[2]}/{dia[1]}", "ofertas": len(itens),
            "validade": f"até {_ate(itens[0].get('fim'))}" if itens and itens[0].get("fim") else "preço do dia",
            "paginas": max((o.get("pagina") or 0 for o in itens), default=0),
        }
    hoje = date.today().strftime("%d/%m/%Y")
    lista, origem = lista_app.carregar(base)
    dados = {"gerado_em": hoje, "mercados": mercados, "ofertas": ofertas, "lista": lista, "lista_origem": origem}
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text("window.DADOS_REAIS = " + json.dumps(dados, ensure_ascii=False) + ";\n")
    return f"{len(ofertas)} ofertas de {len(mercados)} mercado(s) -> {destino}"


def para_publicar(base: Path, mercado: str) -> list[dict]:
    """Coleta mais recente do mercado, so o que passou na validacao, com a miniatura embutida."""
    arqs = sorted((base / "ofertas" / mercado).glob("*.json"))
    if not arqs:
        return []
    saida = []
    for o in sem_repetidas([o for o in json.loads(arqs[-1].read_text()) if o.get("status", "ok") == "ok"], mercado):
        saida.append({
            "produto": o["produto"], "marca": _marca(o), "tamanho": o.get("tamanho") or "",
            "categoria": CATEGORIA_COMUM.get(c := (o.get("categoria") or "Outros").split(" / ")[0], c),
            "preco_por": o["preco_por"], "preco_de": o.get("preco_de"), "condicao": o.get("condicao"),
            "inicio": o.get("inicio"), "fim": o.get("fim"), "foto": fotos.data_uri(base, o.get("foto")),
        })
    return saida


def main() -> None:
    todos = [*PARSERS, *DIRETOS]
    p = argparse.ArgumentParser(prog="promocoes")
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("coletar", help="baixa os encartes/ofertas vigentes")
    c.add_argument("mercados", nargs="*", default=todos, help=f"padrao: {' '.join(todos)}")
    x = sub.add_parser("extrair", help="le com IA os encartes baixados")
    x.add_argument("mercados", nargs="*", default=list(PARSERS))
    sub.add_parser("lista", help="puxa do app o que falta comprar (lista + Repor)")
    pb = sub.add_parser("publicar", help="manda as ofertas aprovadas para a aba Ofertas do app")
    pb.add_argument("mercados", nargs="*", default=todos)
    f = sub.add_parser("fotos", help="miniaturas das ofertas (recorte do encarte ou foto do site)")
    f.add_argument("mercados", nargs="*", default=todos)
    e = sub.add_parser("exportar", help="gera os dados reais para o prototipo")
    e.add_argument("--destino", default="../prototipo/dados/ofertas.js")
    a = p.parse_args()

    base = Path(os.environ.get("PROMOCOES_DATA_DIR", "data"))
    if a.cmd == "lista":
        try:
            itens = lista_app.buscar()
        except Exception as e:
            print(f"lista: falhou ({e})", file=sys.stderr)
            sys.exit(1)
        print(f"lista | {len(itens)} itens do app | {lista_app.salvar(base, itens)}")
        return
    if a.cmd == "exportar":
        print(exportar(base, Path(a.destino)))
        return
    erro = False
    for m in a.mercados:
        try:
            if a.cmd == "publicar":
                r = lista_app.publicar(m, para_publicar(base, m))
                print(f"{m} | {r.get('gravadas', 0)} ofertas no app" if r.get("ok") else f"{m}: {r}")
                continue
            if a.cmd == "fotos":
                n = fotos.baixar_do_site(base, m) if m in DIRETOS else fotos.recortar_encarte(base, m)
                print(f"{m} | {n} fotos")
                continue
            if a.cmd == "extrair":
                print(extrair_encartes(m, base))
                continue
            print(coletar_direto(m, base) if m in DIRETOS else resumo(coletar(m, base)))
        except Exception as e:  # um mercado fora do ar nao derruba os outros
            erro = True
            print(f"{m}: falhou ({e})", file=sys.stderr)
    sys.exit(1 if erro else 0)
