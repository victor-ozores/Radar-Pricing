"""O cliente HTTP: cada teste reproduz um defeito real observado nas fontes."""

from __future__ import annotations

import gzip
import io
import urllib.error

import pytest

from radar_pricing.http import Cliente, Falha, codifica


class Resposta(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def abre_com(*respostas):
    """Devolve um `urlopen` falso que entrega as respostas em ordem (exceção = erro; bytes = corpo)."""
    fila = list(respostas)
    chamadas = []

    def abre(pedido, timeout=None):
        chamadas.append(pedido.full_url)
        item = fila.pop(0)
        if isinstance(item, Exception):
            raise item
        return Resposta(item)

    abre.chamadas = chamadas
    return abre


def http_erro(codigo: int) -> urllib.error.HTTPError:
    return urllib.error.HTTPError("http://x", codigo, "erro", {}, io.BytesIO(b""))


def cliente(*respostas, tentativas=3):
    abre = abre_com(*respostas)
    dormiu = []
    return Cliente(tentativas=tentativas, dormir=dormiu.append, abre=abre), abre, dormiu


def test_json_normal():
    c, _, _ = cliente(b'[{"data":"01/09/2026","valor":"4.58"}]')
    assert c.json("http://x")[0]["valor"] == "4.58"


def test_confia_no_corpo_nao_no_cabecalho():
    # SGS 13522: JSON válido marcado como text/html. O cliente nem olha o cabeçalho.
    c, _, _ = cliente(b'[{"valor":"1"}]')
    assert c.json("http://x") == [{"valor": "1"}]


def test_pagina_html_com_http_200_e_tentada_de_novo_e_depois_vira_falha():
    html = b"<!doctype html><html>erro</html>"
    c, abre, dormiu = cliente(html, html, html)
    with pytest.raises(Falha, match="o corpo não é JSON"):
        c.json("http://x")
    assert len(abre.chamadas) == 3
    assert dormiu == [1.0, 3.0]  # esperou entre as tentativas, sem dormir de verdade nos testes


def test_html_passageiro_se_recupera_na_segunda_tentativa():
    c, abre, _ = cliente(b"<html>", b'{"ok": true}')
    assert c.json("http://x") == {"ok": True}
    assert len(abre.chamadas) == 2


def test_gzip_sem_ser_pedido_e_descomprimido():
    # IBGE: manda gzip mesmo sem o cliente pedir
    c, _, _ = cliente(gzip.compress(b'{"a": 1}'))
    assert c.json("http://x") == {"a": 1}


def test_http_4xx_nao_e_tentado_de_novo():
    c, abre, _ = cliente(http_erro(406))  # série diária com janela maior que 10 anos
    with pytest.raises(Falha, match="HTTP 406"):
        c.json("http://x")
    assert len(abre.chamadas) == 1


@pytest.mark.parametrize("codigo", [500, 502, 429])
def test_http_5xx_e_429_sao_tentados_de_novo(codigo):
    c, abre, _ = cliente(http_erro(codigo), b'{"ok": 1}')
    assert c.json("http://x") == {"ok": 1}
    assert len(abre.chamadas) == 2


def test_erro_de_rede_e_tentado_de_novo_e_esgota():
    c, abre, _ = cliente(TimeoutError("lento"), urllib.error.URLError("sem rede"), TimeoutError("lento"))
    with pytest.raises(Falha, match="3 tentativas"):
        c.bytes("http://x")
    assert len(abre.chamadas) == 3


def test_texto_usa_a_codificacao_pedida():
    c, _, _ = cliente("Taxa;Título".encode("latin-1"))
    assert c.texto("http://x", "latin-1") == "Taxa;Título"


def test_codifica_a_consulta_odata():
    q = codifica({"$format": "json", "$filter": "Indicador eq 'Selic'"})
    assert q == "%24format=json&%24filter=Indicador%20eq%20%27Selic%27"
