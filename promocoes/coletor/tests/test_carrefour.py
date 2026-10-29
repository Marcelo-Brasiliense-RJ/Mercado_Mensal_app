from promocoes.carrefour import casa, converter


def prod(nome, preco, de=None, qtd=10, cat="/Mercearia/Café/"):
    return {"productId": nome[:5], "productName": nome, "brand": "Marca", "linkText": "x", "categories": [cat],
            "items": [{"images": [{"imageUrl": "https://img/ids/1/a.jpg"}],
                       "sellers": [{"commertialOffer": {"Price": preco, "ListPrice": de or preco, "AvailableQuantity": qtd}}]}]}


def test_casa_como_o_app():
    assert casa("Café Pilão Tradicional 500g", "cafe pilao")
    assert not casa("Sabonete Leite de Cabra", "leite")


def test_pega_os_mais_baratos_disponiveis_que_casam():
    r = converter([
        prod("Café Pilão 500g", 19.9, 24.9),
        prod("Café Melitta 500g", 17.5),
        prod("Café Caro 500g", 40),
        prod("Café Esgotado", 5, qtd=0),
        prod("Cafeteira Elétrica", 99, cat="/Eletro/"),
        prod("Bolo de Café", 8),
    ], "cafe")
    assert [o.produto for o in r] == ["Café Melitta 500g", "Café Pilão 500g", "Café Caro 500g"]
    assert r[1].preco_de == 24.9 and r[0].preco_de is None
    assert r[0].mercado == "carrefour" and r[0].categoria == "Mercearia"
