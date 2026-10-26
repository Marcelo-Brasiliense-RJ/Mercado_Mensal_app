import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path

import httpx

from . import superbom
from .coletor import HEADERS, coletar, resumo
from .fontes import PARSERS

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


NOMES = {"superbom": "Superbom"}
FONTES = {"superbom": "Site oficial · loja Curicica (preço em texto, sem IA)"}


def exportar(base: Path, destino: Path) -> str:
    """Junta a coleta mais recente de cada mercado num .js que o prototipo carrega."""
    ofertas, mercados = [], {}
    for pasta in sorted((base / "ofertas").glob("*")):
        arqs = sorted(pasta.glob("*.json"))
        if not arqs:
            continue
        m, ultimo = pasta.name, arqs[-1]
        itens = json.loads(ultimo.read_text())
        vistos = set()
        for o in itens:
            chave = (o["produto"].lower(), o["preco_por"])  # variacoes do mesmo item vem repetidas
            if chave in vistos:
                continue
            vistos.add(chave)
            ofertas.append({
                "m": m,
                "cat": (o["categoria"] or "Outros").split(" / ")[0],
                "produto": o["produto"],  # no Superbom o nome ja traz marca e tamanho
                "marca": "",
                "por": o["preco_por"],
                "de": o["preco_de"] or o["preco_por"],
                "ate": None,
                "img": o.get("imagem"),
            })
        dia = ultimo.stem.split("-")
        mercados[m] = {
            "nome": NOMES.get(m, m), "fonte": FONTES.get(m, ""), "status": "ok",
            "coleta": f"{dia[2]}/{dia[1]}", "validade": "preço do dia", "paginas": 0, "ofertas": len(vistos),
        }
    hoje = date.today().strftime("%d/%m/%Y")
    dados = {"gerado_em": hoje, "mercados": mercados, "ofertas": ofertas}
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text("window.DADOS_REAIS = " + json.dumps(dados, ensure_ascii=False) + ";\n")
    return f"{len(ofertas)} ofertas de {len(mercados)} mercado(s) -> {destino}"


def main() -> None:
    todos = [*PARSERS, *DIRETOS]
    p = argparse.ArgumentParser(prog="promocoes")
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("coletar", help="baixa os encartes/ofertas vigentes")
    c.add_argument("mercados", nargs="*", default=todos, help=f"padrao: {' '.join(todos)}")
    e = sub.add_parser("exportar", help="gera os dados reais para o prototipo")
    e.add_argument("--destino", default="../prototipo/dados/ofertas.js")
    a = p.parse_args()

    base = Path(os.environ.get("PROMOCOES_DATA_DIR", "data"))
    if a.cmd == "exportar":
        print(exportar(base, Path(a.destino)))
        return
    erro = False
    for m in a.mercados:
        try:
            print(coletar_direto(m, base) if m in DIRETOS else resumo(coletar(m, base)))
        except Exception as e:  # um mercado fora do ar nao derruba os outros
            erro = True
            print(f"{m}: falhou ({e})", file=sys.stderr)
    sys.exit(1 if erro else 0)
