import argparse
import os
import sys
from pathlib import Path

from .coletor import coletar, resumo
from .fontes import PARSERS


def main() -> None:
    p = argparse.ArgumentParser(prog="promocoes")
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("coletar", help="baixa os encartes vigentes")
    c.add_argument("mercados", nargs="*", default=list(PARSERS), help=f"padrao: {' '.join(PARSERS)}")
    a = p.parse_args()

    base = Path(os.environ.get("PROMOCOES_DATA_DIR", "data"))
    erro = False
    for m in a.mercados:
        try:
            print(resumo(coletar(m, base)))
        except Exception as e:  # um mercado fora do ar nao derruba os outros
            erro = True
            print(f"{m}: falhou ({e})", file=sys.stderr)
    sys.exit(1 if erro else 0)
