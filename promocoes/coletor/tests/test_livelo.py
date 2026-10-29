from promocoes.livelo import converter


def test_converte_campanha_e_limpa_html():
    r = converter([
        {"partnerCode": "CRM", "parity": 7, "parityClub": 7, "parityBau": 1, "promotion": True,
         "separatorSlug": "ATE", "legalTerms": "<p>Campanha válida de 26 a 30/10. Ganhe 7 pontos&nbsp;por real.</p>"},
        {"partnerCode": "EXT", "parity": 1, "parityClub": 2, "parityBau": 1, "promotion": False,
         "separatorSlug": "IGUAL", "legalTerms": "Consulte o regulamento."},
        {"partnerCode": "", "parity": 3},
        {"partnerCode": "XYZ"},
    ])
    assert [x["codigo"] for x in r] == ["CRM", "EXT"]
    crm, ext = r
    assert crm == {"codigo": "CRM", "nome": "Carrefour Mercado", "pontos": 7.0, "pontos_clube": 7.0,
                   "pontos_normal": 1.0, "promocao": True, "ate": True,
                   "regra": "Campanha válida de 26 a 30/10. Ganhe 7 pontos por real."}
    assert ext["pontos_clube"] == 2.0 and ext["regra"] == "" and not ext["ate"]


def test_parceiro_sem_nome_conhecido_vai_sem_nome():
    assert converter([{"partnerCode": "ZZZ", "parity": 2}])[0]["nome"] is None
