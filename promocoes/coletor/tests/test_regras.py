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


def test_lista_do_app_le_a_rpc(monkeypatch, tmp_path):
    import httpx
    from promocoes import lista_app

    pedido = {}

    def falso(url, headers, json, timeout):
        pedido.update(url=url, corpo=json, chave=headers["apikey"])
        return httpx.Response(200, json=[{"nome": "arroz", "origem": "repor", "ultimo_preco": 18.5}],
                              request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "post", falso)
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co/")
    monkeypatch.setenv("SUPABASE_KEY", "k")
    monkeypatch.setenv("PROMOCOES_CASA", "casa-1")
    itens = lista_app.buscar()
    assert pedido["url"] == "https://x.supabase.co/rest/v1/rpc/mercado_promo_lista_h"
    assert pedido["corpo"] == {"h": "casa-1"} and itens[0]["nome"] == "arroz"
    lista_app.salvar(tmp_path, itens)
    assert lista_app.carregar(tmp_path) == (itens, "app")


def test_foto_confere_pelo_nome_quando_a_ordem_escorrega():
    from promocoes.fotos import casar_caixas

    nomes = ["Granola Barano", "Sal Marinho Natural Life", "Arroz Branco Dona Elza"]
    caixas = [  # o modelo pulou a granola: o indice 0 veio com a foto do sal
        {"i": 0, "nome": "Sal Marinho Natural Life", "box_2d": [1, 1, 2, 2]},
        {"i": 1, "nome": "Arroz Dona Elza", "box_2d": [3, 3, 4, 4]},
        {"i": 2, "nome": "Chá Preto Maracujá", "box_2d": [5, 5, 6, 6]},
    ]
    assert casar_caixas(caixas, nomes) == {1: [1, 1, 2, 2], 2: [3, 3, 4, 4]}


def test_oferta_repetida_na_capa_sai_uma_vez():
    from promocoes.cli import sem_repetidas

    itens = [
        {"produto": "Leite UHT Integral Italac", "marca": "Italac", "tamanho": "1L", "preco_por": 4.47},
        {"produto": "Leite Longa Vida UHT Integral Italac", "tamanho": "1 Litro", "preco_por": 4.47},
        {"produto": "Leite UHT Desnatado Italac", "tamanho": "1L", "preco_por": 3.99},  # outro preco: fica
        {"produto": "Cafe Patusco 500g Tradicional", "preco_por": 17.98},
        {"produto": "Cafe Patusco 500g Extra Forte", "preco_por": 17.98},  # sabor diferente: fica
    ]
    assert [o["produto"] for o in sem_repetidas(itens)] == [
        "Leite UHT Integral Italac", "Leite UHT Desnatado Italac",
        "Cafe Patusco 500g Tradicional", "Cafe Patusco 500g Extra Forte"]
