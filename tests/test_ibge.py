"""O IBGE tem dois endereços para o IPCA mensal: o SIDRA (primeiro) e o das agregados (reserva)."""

from __future__ import annotations

from datetime import date

import pytest

from radar_pricing.fontes import ibge
from radar_pricing.http import Falha

HOJE = date(2026, 11, 6)
# o que o SIDRA devolve (resposta real de 06/11/2026, encurtada): o 1º item é o cabeçalho
SIDRA = [
    {"V": "Valor", "D3C": "Mês (Código)"},
    {"V": "0.07", "D3C": "202607"},
    {"V": "-0.32", "D3C": "202608"},
    {"V": "0.82", "D3C": "202609"},
]
# e o que as agregados devolvem para o mesmo período
AGREGADOS = [
    {"resultados": [{"series": [{"serie": {"202607": "0.07", "202608": "-0.32", "202609": "0.82"}}]}]}
]


class Falso:
    """Cliente que responde o que foi combinado para cada endereço (uma exceção, se for o caso) e anota os pedidos."""

    def __init__(self, respostas: dict[str, object]) -> None:
        self.respostas = respostas
        self.pedidos: list[str] = []

    def json(self, url: str) -> object:
        self.pedidos.append(url)
        r = self.respostas[url]
        if isinstance(r, Exception):
            raise r
        return r


def valores(res) -> list[tuple[str, float]]:
    return [(r.data_ref.isoformat(), r.valor) for r in res.registros]


ESPERADO = [("2026-07-01", 0.07), ("2026-08-01", -0.32), ("2026-09-01", 0.82)]


def test_o_sidra_responde_e_as_agregados_nem_sao_chamadas():
    cli = Falso({ibge.URL_SIDRA: SIDRA, ibge.URL_AGREGADOS: AGREGADOS})
    res = ibge.coletar(cli, HOJE)
    assert valores(res) == ESPERADO and res.falhas == [] and res.avisos == []
    assert cli.pedidos == [ibge.URL_SIDRA]


def test_se_o_sidra_nao_responde_as_agregados_salvam_o_dia_e_o_aviso_diz_por_que():
    cli = Falso({ibge.URL_SIDRA: Falha("URLError: timed out"), ibge.URL_AGREGADOS: AGREGADOS})
    res = ibge.coletar(cli, HOJE)
    assert valores(res) == ESPERADO and res.falhas == []
    assert cli.pedidos == [ibge.URL_SIDRA, ibge.URL_AGREGADOS]
    assert (
        len(res.avisos) == 1
        and "agregados" in res.avisos[0]
        and "SIDRA: URLError: timed out" in res.avisos[0]
    )


def test_os_dois_fora_do_ar_e_uma_falha_que_conta_os_dois_motivos():
    cli = Falso({ibge.URL_SIDRA: Falha("HTTP 503"), ibge.URL_AGREGADOS: Falha("URLError: timed out")})
    res = ibge.coletar(cli, HOJE)
    assert res.registros == []
    assert len(res.falhas) == 1
    assert "SIDRA: HTTP 503" in res.falhas[0] and "agregados: URLError: timed out" in res.falhas[0]


@pytest.mark.parametrize("estranha", [[], [{"V": "Valor"}], {"erro": 1}, [{"V": "0.1"}, {"V": "0.2"}]])
def test_resposta_do_sidra_que_nao_tem_o_formato_cai_para_as_agregados(estranha):
    cli = Falso({ibge.URL_SIDRA: estranha, ibge.URL_AGREGADOS: AGREGADOS})
    res = ibge.coletar(cli, HOJE)
    assert valores(res) == ESPERADO and len(res.avisos) == 1


def test_valor_que_nao_e_numero_nao_e_aceito():
    ruim = [{"V": "Valor"}, {"V": "...", "D3C": "202609"}]
    res = ibge.coletar(Falso({ibge.URL_SIDRA: ruim, ibge.URL_AGREGADOS: AGREGADOS}), HOJE)
    assert (
        res.registros == [] and len(res.falhas) == 1
    )  # não troca de endereço: o endereço respondeu, o dado é que veio ruim
