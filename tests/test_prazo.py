"""O prazo em dias úteis (base 252): feriados, contagem, meses e, principalmente, o preço que o Tesouro publica."""

from __future__ import annotations

import random
from datetime import date, timedelta

import pytest

from radar_pricing import prazo
from radar_pricing.derivados import valor_presente
from tests import calendario_ingenuo as ing


def test_pascoa_bate_com_a_tabela_das_datas_oficiais():
    for ano, esperada in ing.PASCOA.items():
        assert prazo.pascoa(ano).isoformat() == esperada


def test_feriados_de_2026():
    f = prazo.feriados_do_ano(2026)
    # Carnaval (16 e 17/02), Sexta-feira Santa (03/04), Corpus Christi (04/06) e os fixos
    for dia in (
        "2026-02-16",
        "2026-02-17",
        "2026-04-03",
        "2026-06-04",
        "2026-01-01",
        "2026-04-21",
        "2026-05-01",
    ):
        assert date.fromisoformat(dia) in f
    for dia in ("2026-09-07", "2026-10-12", "2026-11-02", "2026-11-15", "2026-11-20", "2026-12-25"):
        assert date.fromisoformat(dia) in f
    assert len(f) == 13
    assert date(2023, 11, 20) not in prazo.feriados_do_ano(
        2023
    )  # a Consciência Negra só é nacional desde 2024
    assert len(prazo.feriados_do_ano(2023)) == 12
    # a Consciência Negra vale desde o primeiro ano em que passou a ser nacional
    assert date(2024, 11, 20) in prazo.feriados_do_ano(2024)
    assert len(prazo.feriados_do_ano(2024)) == 13


def test_dias_uteis_casos_contados_a_mao():
    assert (
        prazo.dias_uteis(date(2026, 10, 30), date(2026, 11, 3)) == 1
    )  # sexta -> terça; 02/11 (segunda) é feriado
    assert prazo.dias_uteis(date(2026, 10, 30), date(2026, 11, 2)) == 0
    assert prazo.dias_uteis(date(2026, 10, 26), date(2026, 11, 2)) == 4  # seg a seg, menos o feriado do dia 2
    assert prazo.dias_uteis(date(2026, 10, 29), date(2026, 10, 30)) == 1  # o dia de chegada conta
    assert prazo.dias_uteis(date(2026, 10, 30), date(2026, 10, 31)) == 0  # sábado
    assert prazo.dias_uteis(date(2026, 10, 30), date(2026, 10, 30)) == 0  # a data-base não conta
    assert prazo.dias_uteis(date(2026, 11, 5), date(2026, 11, 1)) == 0  # ao contrário não é prazo


def test_dias_uteis_igual_a_contagem_dia_a_dia_em_sorteios():
    sorteio = random.Random(20261102)
    for _ in range(2500):
        de = date(2026, 1, 1) + timedelta(days=sorteio.randrange(0, 365 * 14))
        ate = de + timedelta(days=sorteio.randrange(0, 365 * 12))
        assert prazo.dias_uteis(de, ate) == ing.dias_uteis(de, ate), (de, ate)


@pytest.mark.parametrize(
    "inicio,meses,esperado",
    [
        (date(2026, 1, 31), 1, date(2026, 2, 28)),
        (date(2028, 1, 31), 1, date(2028, 2, 29)),
        (date(2028, 2, 29), 12, date(2029, 2, 28)),
        (date(2026, 10, 30), 3, date(2027, 1, 30)),
        (date(2026, 12, 15), 1, date(2027, 1, 15)),
        (date(2026, 10, 30), 24, date(2028, 10, 30)),
        (date(2026, 10, 30), 0, date(2026, 10, 30)),
        (date(2026, 8, 31), 6, date(2027, 2, 28)),
    ],
)
def test_soma_meses_como_o_edate_do_excel(inicio, meses, esperado):
    assert prazo.soma_meses(inicio, meses) == esperado


def test_prazo_de_meses_igual_ao_do_calendario_ingenuo():
    for base in (date(2026, 10, 30), date(2027, 1, 31), date(2026, 3, 2), date(2028, 2, 29)):
        for meses in (1, 2, 6, 12, 13, 24, 36, 59, 120, 300):
            assert prazo.anos_uteis(prazo.dias_uteis_do_prazo(base, meses)) == pytest.approx(
                ing.anos_do_prazo(base.isoformat(), meses), abs=0
            )


def test_um_ano_de_prazo_tem_perto_de_250_dias_uteis_e_nao_exatamente_252():
    """A base 252 é uma convenção: um ano de calendário tem de 249 a 252 dias úteis, conforme os feriados."""
    base = date(2026, 10, 30)
    dias = [prazo.dias_uteis_do_prazo(base, 12 * k) / k for k in (1, 2, 5, 10)]
    assert all(248 <= x <= 253 for x in dias)


# O Tesouro publica o preço unitário (PU) de cada título junto com a taxa. Para o Tesouro Prefixado (paga R$ 1.000 no
# vencimento) o preço é 1000 / (1 + taxa) ** (dias úteis / 252). Fonte: arquivo oficial do Tesouro Transparente, taxa e PU
# de compra de 30/10/2026 (data-base). Com a contagem em dias úteis o preço sai igual ao publicado (erro de 0,001%).
PU_DO_TESOURO = [
    ("2027-01-01", 13.48, 979.63),
    ("2028-01-01", 14.32, 856.35),
    ("2029-01-01", 14.89, 742.71),
    ("2031-01-01", 15.30, 555.37),
    ("2032-01-01", 15.38, 479.96),
]


@pytest.mark.parametrize("vencimento,taxa,pu", PU_DO_TESOURO)
def test_preco_do_tesouro_prefixado_sai_igual_ao_que_o_tesouro_publica(vencimento, taxa, pu):
    base = date(2026, 10, 30)
    anos = prazo.anos_uteis(prazo.dias_uteis(base, date.fromisoformat(vencimento)))
    assert round(valor_presente(1000, taxa, anos), 2) == pytest.approx(pu, abs=0.011)
    # e contar os dias corridos dividindo por 365,25 erra de 0,12% a 0,59% (sempre para baixo)
    corridos = (date.fromisoformat(vencimento) - base).days / 365.25
    assert valor_presente(1000, taxa, corridos) < pu * 0.9990


def test_o_dia_da_data_base_nao_conta():
    """A conta que errava 0,05%: contar o dia da data-base como dia útil a mais."""
    base, venc = date(2026, 10, 30), date(2027, 1, 1)
    assert prazo.dias_uteis(base, venc) == 41  # e não 42


def test_dois_feriados_no_mesmo_dia_contam_uma_vez_so():
    """Em 2079 a Sexta-feira Santa cai em 21/04, o Dia de Tiradentes: um dia só, não dois."""
    assert prazo.pascoa(2079) == date(2079, 4, 23)
    assert len(prazo.feriados_do_ano(2079)) == 12
    assert (
        prazo.dias_uteis(date(2079, 4, 20), date(2079, 4, 24)) == 1
    )  # sexta 21 (feriado duplo), sáb, dom, seg 24
    assert prazo.dias_uteis(date(2079, 1, 1), date(2080, 1, 1)) == ing.dias_uteis(
        date(2079, 1, 1), date(2080, 1, 1)
    )
