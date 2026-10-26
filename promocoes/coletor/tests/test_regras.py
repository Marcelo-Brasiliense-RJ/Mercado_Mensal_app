from datetime import datetime, timedelta, timezone

from promocoes.extracao import ler_pagina
from promocoes.modelos import Oferta
from promocoes.regras import aplicar_regras, chave

AGORA = datetime(2026, 10, 26, tzinfo=timezone.utc)


def of(**kw):
    base = dict(mercado="mundial", produto="Arroz", marca="Tio João", tamanho="5 kg", preco_por=24.9, preco_de=31.9,
                fim=AGORA + timedelta(days=2))
    return Oferta(**{**base, **kw})


def test_oferta_normal_passa():
    assert aplicar_regras(of(), {}, AGORA).status == "ok"


def test_por_maior_que_de_vai_para_revisar():
    assert aplicar_regras(of(preco_por=40), {}, AGORA).status == "revisar"


def test_encarte_vencido_vai_para_revisar():
    assert aplicar_regras(of(fim=AGORA - timedelta(hours=1)), {}, AGORA).status == "revisar"


def test_variacao_grande_contra_historico():
    o = of(preco_por=3.99, preco_de=52.9)
    r = aplicar_regras(o, {chave(o): 39.9}, AGORA)
    assert r.status == "revisar" and "Variação" in r.motivo


class IAFalsa:
    """Responde como as IAs reais, sem rede."""

    def __init__(self, leitura, veredito, segunda):
        self.respostas = [leitura, segunda]
        self.veredito = veredito

    def gemini(self, img, pergunta, schema):
        return self.respostas.pop(0)

    def openrouter(self, img, pergunta):
        return self.veredito


def item(nome, normal, app):
    return {"produto": nome, "marca": "", "categoria": "Mercearia", "preco_normal": normal, "preco_app": app, "confianca": 1}


def test_divergencia_que_se_resolve_na_segunda_leitura():
    ia = IAFalsa([item("Arroz", 4.95, 9.95)],
                 {"itens": [{"i": 0, "status": "corrigido", "preco_normal": 4.95, "preco_app": 3.95}], "faltando": []},
                 [{"produto": "Arroz", "preco_normal": 4.95, "preco_app": 3.95}])
    [r] = ler_pagina(ia, b"", "mundial")
    assert (r["status"], r["preco_app"]) == ("ok", 3.95)


def test_divergencia_que_persiste_vai_para_revisar():
    ia = IAFalsa([item("Arroz", 4.95, 9.95)],
                 {"itens": [{"i": 0, "status": "corrigido", "preco_normal": 4.95, "preco_app": 3.95}], "faltando": []},
                 [{"produto": "Arroz", "preco_normal": 4.95, "preco_app": 9.95}])
    [r] = ler_pagina(ia, b"", "mundial")
    assert r["status"] == "revisar" and "discordam" in r["motivo"]


def test_sem_conferente_a_pagina_vai_toda_para_revisar():
    class SemConferente(IAFalsa):
        def openrouter(self, img, pergunta):
            raise RuntimeError("resposta sem 'choices'")

    ia = SemConferente([item("Arroz", 4.95, 3.95)], None, None)
    [r] = ler_pagina(ia, b"", "mundial")
    assert r["status"] == "revisar" and "Conferente" in r["motivo"]


def test_conferente_repetindo_preco_unico_nao_vira_divergencia():
    ia = IAFalsa([item("Corona", None, 5.99)],
                 {"itens": [{"i": 0, "status": "corrigido", "preco_normal": 5.99, "preco_app": 5.99}], "faltando": []},
                 [{"produto": "Corona", "preco_normal": None, "preco_app": 5.99}])
    [r] = ler_pagina(ia, b"", "guanabara")
    assert r["status"] == "ok"
