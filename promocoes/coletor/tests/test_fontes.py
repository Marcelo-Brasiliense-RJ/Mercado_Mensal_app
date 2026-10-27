from pathlib import Path

import pytest

from promocoes.fontes import mundial

FIX = Path(__file__).parent / "fixtures"


def test_mundial_le_encarte_do_html_real():
    # HTML salvo do site em 26/10/2026.
    encs = mundial((FIX / "mundial_encarte.html").read_text())
    assert len(encs) == 1
    e = encs[0]
    assert e.id == "59"
    assert e.formato == "pdf"
    assert e.url.endswith("/encartes/59.pdf")
    assert e.fim and e.fim.date().isoformat() == "2026-10-28"


def test_mundial_falha_claro_se_o_site_mudar():
    with pytest.raises(ValueError, match="__NEXT_DATA__"):
        mundial("<html>outra coisa</html>")


def test_superbom_le_produtos_do_html_real():
    # HTML salvo do site em 26/10/2026 (loja padrao, Campos).
    from promocoes.superbom import ler_pagina, local_atual

    pagina = (FIX / "superbom_ofertas_campos.html").read_text()
    ofertas = ler_pagina(pagina)
    assert local_atual(pagina) == "Campos dos Goytacazes"
    assert len(ofertas) == 20
    h2o = next(o for o in ofertas if o.ref == "8525")
    assert (h2o.preco_de, h2o.preco_por) == (8.59, 7.98)
    assert all(o.preco_de is None or o.preco_por <= o.preco_de for o in ofertas)


def test_guanabara_le_paginas_e_validade_do_html_real():
    from promocoes.fontes import guanabara

    [e] = guanabara((FIX / "guanabara_encarte.html").read_text())
    assert e.formato == "imagens" and len(e.urls) == 12
    assert all("/styles/" not in u and "?" not in u for u in e.urls)
    assert (e.inicio.day, e.fim.day, e.fim.month) == (24, 26, 10)


def test_supermarket_pega_so_o_pdf_vigente():
    from promocoes.fontes import supermarket

    [e] = supermarket((FIX / "supermarket_ofertas.html").read_text())
    assert e.url.endswith("/guia-26-28.pdf")  # encarte-23-25.pdf ja venceu
    assert (e.inicio.day, e.fim.day) == (26, 28)


def test_guanabara_validade_com_texto_novo():
    # 27/10/2026: "Promoção válida de 27/10/2026 até 30/10/2026"
    from promocoes.fontes import guanabara

    [e] = guanabara((FIX / "guanabara_encarte_2710.html").read_text())
    assert (e.inicio.day, e.fim.day) == (27, 30)


def test_supermarket_com_duas_validades_na_pagina():
    # 27/10/2026: destaques "27 a 28/10" e guia em PDF "26 a 28/10"
    from promocoes.fontes import supermarket

    [e] = supermarket((FIX / "supermarket_ofertas_2710.html").read_text())
    assert e.url.endswith("/guia-26-28.pdf") and (e.inicio.day, e.fim.day) == (26, 28)
