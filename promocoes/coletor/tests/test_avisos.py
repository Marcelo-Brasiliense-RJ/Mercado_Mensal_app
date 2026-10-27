import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from promocoes import avisos

OFERTAS = [
    {"mercado": "guanabara", "produto": "Acém Bovino Resfriado", "marca": "", "tamanho": "kg", "preco_por": 24.9,
     "fim": "2026-10-30T23:59:00-03:00"},
    {"mercado": "mundial", "produto": "Acém em Bife", "marca": "Friboi", "tamanho": "kg", "preco_por": 22.5,
     "fim": "2026-10-29T23:59:00-03:00"},
    {"mercado": "mundial", "produto": "Sabonete Acém", "marca": "", "tamanho": "", "preco_por": 2.0, "fim": None},
    {"mercado": "superbom", "produto": "Azeite Extra Virgem Andorinha 500ml", "marca": "", "tamanho": "",
     "preco_por": 29.9, "fim": None},
]


def test_casa_desejo_igual_ao_app():
    assert avisos.casa_desejo(OFERTAS[0], "acem")
    assert not avisos.casa_desejo(OFERTAS[2], "acem")  # primeira palavra abre o nome
    assert avisos.casa_desejo({"produto": "Paleta, Peito ou Acém Bovino", "marca": "Friboi"}, "acem")
    assert avisos.casa_desejo(OFERTAS[3], "azeite andorinha")
    assert avisos.casa_desejo({"produto": "Paleta, Peito ou Acém Bovino a Vácuo"}, "paleta, peito")
    assert avisos.casa_desejo({"produto": "Leite Integral", "tamanho": "1 Litro"}, "leite 1l")


def test_novidade_e_a_mais_barata_ainda_nao_avisada():
    p = {"ofertas": OFERTAS, "desejos": [
        {"id": 1, "household_id": "h1", "termo": "acem", "nome": "Acém", "avisados": []},
        {"id": 2, "household_id": "h1", "termo": "palmito", "nome": "Palmito", "avisados": []},
        {"id": 3, "household_id": "h2", "termo": "acem", "nome": "Acém",
         "avisados": [avisos.chave(OFERTAS[1]), avisos.chave(OFERTAS[0])]},
    ]}
    n = avisos.novidades(p)
    assert list(n) == ["h1"]  # h2 ja foi avisada das duas
    d, o = n["h1"][0]
    assert d["id"] == 1 and o["mercado"] == "mundial"


def test_mensagem_diz_mercado_preco_e_ate_quando():
    m = avisos.mensagem([({"nome": "Acém"}, OFERTAS[1])])
    assert m["title"] == "⭐ Acém em promoção"
    assert m["body"] == "Mundial R$ 22,50 até qui 29/10"
    varios = avisos.mensagem([({"nome": "Acém"}, OFERTAS[0]), ({"nome": "Azeite"}, OFERTAS[3])])
    assert varios["title"].startswith("⭐ 2 produtos") and "Azeite: Superbom R$ 29,90 preço de hoje" in varios["body"]


def _b64(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def test_avisar_envia_criptografado_e_marca(monkeypatch):
    # Chave VAPID no formato que vai no Secret (32 bytes em base64url) e um aparelho de verdade.
    vapid = ec.generate_private_key(ec.SECP256R1())
    monkeypatch.setenv("VAPID_PRIVATE_KEY", _b64(vapid.private_numbers().private_value.to_bytes(32, "big")))
    aparelho = ec.generate_private_key(ec.SECP256R1()).public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    insc = {"household_id": "h1", "endpoint": "https://web.push.apple.com/abc", "p256dh": _b64(aparelho),
            "auth": _b64(b"0123456789abcdef")}
    morta = {**insc, "endpoint": "https://web.push.apple.com/morta"}
    chamadas = []

    def rpc(nome, corpo, *_):
        chamadas.append((nome, corpo))
        if nome == "mercado_push_pendentes_h":
            return {"ofertas": OFERTAS, "inscricoes": [insc, morta],
                    "desejos": [{"id": 1, "household_id": "h1", "termo": "acem", "nome": "Acém", "avisados": []}]}
        return {"ok": True}

    class Resp:
        def __init__(self, status):
            self.status_code, self.text, self.headers, self.reason = status, "", {}, ""

    enviados = []

    def post(url, data=None, headers=None, timeout=None, **_):
        enviados.append((url, headers))
        return Resp(410 if url.endswith("morta") else 201)

    monkeypatch.setattr(avisos.lista_app, "_rpc", rpc)
    import pywebpush
    monkeypatch.setattr(pywebpush.requests, "post", post)

    r = avisos.avisar()
    assert "1 notificações" in r and "1 aparelhos saíram" in r
    url, h = enviados[0]
    assert h["content-encoding"] == "aes128gcm" and h["authorization"].startswith("vapid t=")
    nome, corpo = chamadas[-1]
    assert nome == "mercado_push_registrar_h"
    assert corpo["p_avisos"] == [{"desejo_id": 1, "chave": avisos.chave(OFERTAS[1])}]
    assert corpo["p_mortas"] == ["https://web.push.apple.com/morta"]


def test_sem_chave_guarda_preco_e_nao_envia(monkeypatch):
    monkeypatch.delenv("VAPID_PRIVATE_KEY", raising=False)
    chamadas = []

    def rpc(nome, corpo, *_):
        chamadas.append((nome, corpo))
        return {"ofertas": OFERTAS, "inscricoes": [],
                "desejos": [{"id": 7, "household_id": "h", "termo": "acem", "nome": "Acém", "aparelho": False}]}

    monkeypatch.setattr(avisos.lista_app, "_rpc", rpc)
    r = avisos.avisar()
    assert "sem VAPID_PRIVATE_KEY" in r and "1 preços guardados" in r
    assert chamadas[1] == ("mercado_desejos_precos_h", {"p_vistos": [
        {"id": 7, "preco": 22.5, "mercado": "mundial", "fim": "2026-10-29T23:59:00-03:00"}]})


def test_casa_sem_aparelho_nao_recebe_aviso():
    p = {"ofertas": OFERTAS, "desejos": [{"id": 1, "household_id": "h", "termo": "acem", "nome": "Acém",
                                          "aparelho": False, "avisados": []}]}
    assert avisos.novidades(p) == {}
