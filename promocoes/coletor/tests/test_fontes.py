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
