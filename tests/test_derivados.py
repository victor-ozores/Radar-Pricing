"""Contas da fase 2: variações, curvas, interpolação e valor presente. Inclui uma conferência "à mão" que refaz a
conta direto do CSV real gravado, sem passar pelo código do pacote."""

from __future__ import annotations

import csv
import io
from datetime import date, timedelta
from itertools import pairwise

import pytest

from radar_pricing import derivados as d
from radar_pricing.coleta import coletar_tudo
from radar_pricing.config import ParamsDerivados, carrega
from radar_pricing.datas import parse_br
from radar_pricing.modelo import Registro
from tests.conftest import PASTA

RAIZ = PASTA.parent.parent


def obs(*pares):
    return [(date.fromisoformat(a), v) for a, v in pares]


# ------------------------------------------------------------------------------------------------ variações
def test_variacao_em_serie_diaria_com_fim_de_semana():
    # sexta 23, segunda 26: a "variação em 1 dia" da segunda olha a sexta (3 dias, dentro da tolerância)
    serie = obs(("2026-10-16", 10.0), ("2026-10-19", 10.1), ("2026-10-23", 10.5), ("2026-10-26", 11.0))
    v = d.variacoes_de(serie)
    assert v["1"] == {"ref_data": "2026-10-23", "dias": 3, "valor_ref": 10.5, "delta": 0.5}
    assert (
        v["7"]["ref_data"] == "2026-10-19" and v["7"]["dias"] == 7 and v["7"]["delta"] == pytest.approx(0.9)
    )
    assert v["30"] is None  # não há observação de 30 dias atrás: nunca inventar


def test_serie_mensal_nao_vira_variacao_em_1_ou_7_dias():
    mensal = obs(("2026-07-01", 0.07), ("2026-08-01", -0.32), ("2026-09-01", 0.82))
    v = d.variacoes_de(mensal)
    assert v["1"] is None and v["7"] is None
    assert v["30"]["dias"] == 31 and v["30"]["delta"] == pytest.approx(1.14)


def test_serie_semanal_tem_7_e_30_dias_mas_nao_1():
    semanal = obs(*[(str(date(2026, 9, 18) + timedelta(days=7 * k)), 13.0 + k) for k in range(6)])
    v = d.variacoes_de(semanal)
    assert v["1"] is None
    assert v["7"]["dias"] == 7 and v["7"]["delta"] == 1.0
    assert (
        v["30"]["dias"] == 35 and v["30"]["delta"] == 5.0
    )  # 5 edições para trás, dentro da tolerância de 15 dias


def test_uma_observacao_so_nao_tem_variacao():
    assert d.variacoes_de(obs(("2026-10-30", 1.0))) == {"1": None, "7": None, "30": None}


def test_a_referencia_e_a_mais_nova_que_tenha_pelo_menos_o_prazo_pedido():
    serie = obs(
        ("2026-10-20", 1.0),
        ("2026-10-22", 2.0),
        ("2026-10-23", 3.0),
        ("2026-10-29", 9.0),
        ("2026-10-30", 10.0),
    )
    # 7 dias antes de 30/10 é 23/10: a observação de 23/10 (e não a de 22/10) é a referência
    assert d.variacoes_de(serie)["7"] == {"ref_data": "2026-10-23", "dias": 7, "valor_ref": 3.0, "delta": 7.0}


# ------------------------------------------------------------------------------------------------ contas simples
def test_valor_presente_bate_com_a_conta_de_cabeca():
    assert d.valor_presente(1000, 10, 12) == pytest.approx(909.0909, abs=1e-4)  # 1000 / 1,10
    assert d.valor_presente(1000, 10, 24) == pytest.approx(826.4463, abs=1e-4)  # 1000 / 1,10^2
    assert d.valor_presente(1000, 0, 36) == 1000
    assert d.valor_presente(1000, 21, 6) == pytest.approx(1000 / 1.21**0.5)  # meio ano = raiz do fator anual


def test_valor_presente_cai_com_o_prazo_e_com_a_taxa():
    prazos = [d.valor_presente(1000, 12, m) for m in (6, 12, 24, 48)]
    assert prazos == sorted(prazos, reverse=True)
    assert d.valor_presente(1000, 20, 24) < d.valor_presente(1000, 10, 24)


def test_cdi_anualizado():
    assert d.cdi_anualizado(0.0) == 0
    assert d.cdi_anualizado(0.050788) == pytest.approx(
        13.65, abs=0.01
    )  # o valor que o BCB publica em 30/10/2026
    assert d.cdi_anualizado(0.034749) == pytest.approx(9.15, abs=0.01)


PONTOS = [{"anos": 1.0, "taxa": 10.0}, {"anos": 3.0, "taxa": 12.0}, {"anos": 5.0, "taxa": 13.0}]


@pytest.mark.parametrize(
    "anos,taxa,extrapolado",
    [
        (2.0, 11.0, False),
        (4.0, 12.5, False),
        (1.0, 10.0, False),
        (5.0, 13.0, False),
        (0.5, 10.0, True),
        (7.0, 13.0, True),
    ],
)
def test_interpolacao_linear_e_ponta_quando_fora_da_curva(anos, taxa, extrapolado):
    assert d.interpola(PONTOS, anos) == (pytest.approx(taxa), extrapolado)


# ------------------------------------------------------------------------------------------------ com as amostras reais
@pytest.fixture
def cfg():
    return carrega(RAIZ / "config.toml")


@pytest.fixture
def foto(cli, hoje, agora, cfg, monkeypatch):
    from radar_pricing.fontes import tesouro

    monkeypatch.setattr(tesouro, "MIN_LINHAS", 100)
    return coletar_tudo(cli, hoje, agora, cfg.papeis, derivados=cfg.derivados, mudancas=cfg.mudancas)


def test_as_curvas_do_tesouro_vem_ordenadas_e_na_data_base_mais_nova(foto):
    anc = foto.derivados["ancoras"]
    for chave, titulo in (("curva_nominal", "Tesouro Prefixado"), ("curva_real", "Tesouro IPCA+")):
        curva = anc[chave]
        assert curva["titulo"] == titulo and len(curva["pontos"]) >= 4
        anos = [p["anos"] for p in curva["pontos"]]
        assert anos == sorted(anos) and anos[0] > 0
        assert (
            curva["base"]
            == max(r.data_ref for r in foto.registros if r.serie == "tesouro_taxa_compra").isoformat()
        )


def test_tabela_de_valor_presente_na_foto(foto, cfg):
    linhas = foto.derivados["valor_presente"]
    assert [x["meses"] for x in linhas] == list(cfg.derivados.prazos_meses)
    for chave in ("nominal", "real"):
        celulas = [x[chave] for x in linhas]
        assert all(c["vp_demonstracao"] < c["vp_ancora"] < cfg.derivados.valor_face for c in celulas)
        assert [c["vp_ancora"] for c in celulas] == sorted((c["vp_ancora"] for c in celulas), reverse=True)
        assert all(
            c["taxa_demonstracao"]
            == pytest.approx(c["taxa_ancora"] + cfg.derivados.spread_demonstracao_pp, abs=1e-3)
            for c in celulas
        )
    # a curva real não chega aos prazos curtos: tem de dizer que extrapolou, e só nesses
    primeiro_real = foto.derivados["ancoras"]["curva_real"]["pontos"][0]["anos"]
    for x in linhas:
        assert x["real"]["extrapolado"] == (x["anos"] < primeiro_real)


def test_conta_a_mao_contra_o_csv_do_tesouro_e_o_cdi_do_dia(foto, cli, cfg):
    """Refaz a conta fora do pacote: lê o CSV bruto, acha os dois vencimentos que cercam 12 meses, interpola na
    unha e desconta R$ 1.000. Tem de dar o mesmo da foto, centavo por centavo."""
    csv_bruto = next(cli.texto(u, "latin-1") for u in cli.indice if u.lower().endswith(".csv"))
    linhas = list(csv.DictReader(io.StringIO(csv_bruto), delimiter=";"))
    base = max(parse_br(r["Data Base"]) for r in linhas)
    ltn = sorted(
        (parse_br(r["Data Vencimento"]), float(r["Taxa Compra Manha"].replace(",", ".")))
        for r in linhas
        if r["Tipo Titulo"] == "Tesouro Prefixado" and parse_br(r["Data Base"]) == base
    )
    anos = [((v - base).days / 365.25, t) for v, t in ltn]
    (a1, t1), (a2, t2) = next((p, q) for p, q in pairwise(anos) if p[0] <= 1.0 <= q[0])
    taxa_12m = t1 + (1.0 - a1) / (a2 - a1) * (t2 - t1)
    esperado_vp = round(1000 / (1 + taxa_12m / 100), 2)
    esperado_demo = round(1000 / (1 + (taxa_12m + cfg.derivados.spread_demonstracao_pp) / 100), 2)
    linha = next(x for x in foto.derivados["valor_presente"] if x["meses"] == 12)["nominal"]
    assert linha["taxa_ancora"] == pytest.approx(taxa_12m, abs=1e-4)
    assert linha["vp_ancora"] == esperado_vp and linha["vp_demonstracao"] == esperado_demo
    # CDI: o CDI diário do dia, composto por 252 dias úteis
    cdi_diario = max((r.data_ref, r.valor) for r in foto.registros if r.serie == "cdi")[1]
    assert foto.derivados["ancoras"]["cdi_anualizado"]["taxa"] == pytest.approx(
        ((1 + cdi_diario / 100) ** 252 - 1) * 100, abs=1e-4
    )


def test_variacoes_da_foto_batem_com_a_serie_bruta(foto):
    sgs_over = next(e for e in foto.derivados["variacoes"] if e["serie"] == "selic_over")
    bruto = sorted((r.data_ref, r.valor) for r in foto.registros if r.serie == "selic_over")
    assert sgs_over["data"] == bruto[-1][0].isoformat() and sgs_over["valor"] == bruto[-1][1]
    ref = sgs_over["variacoes"]["30"]
    assert ref is not None  # as janelas de 60 dias dão 30 dias de olhada para trás
    assert ref["delta"] == pytest.approx(
        bruto[-1][1] - dict(bruto)[date.fromisoformat(ref["ref_data"])], abs=1e-6
    )
    # as variações de manchete trazem a mediana dos bancos, com o nº de bancos
    medianas = [e for e in foto.derivados["variacoes"] if e["serie"].startswith("mediana_taxa_financiamento")]
    assert len(medianas) == 2 and all(e["n_bancos"] >= 3 for e in medianas)


def test_setor_compara_cada_metrica_com_o_trimestre_anterior(foto):
    setor = foto.derivados["setor"]
    assert len(setor) >= 100
    exclusao = next(m for m in setor if m["descricao"] == "Índice de Exclusão - Total")
    assert exclusao["delta"] == pytest.approx(exclusao["valor"] - exclusao["anterior"], abs=1e-6)
    assert exclusao["data_anterior"] < exclusao["data"]


def test_sem_a_curva_do_tesouro_o_valor_presente_nao_e_inventado():
    registros = [Registro("bcb_sgs", "cdi", "CDI", date(2026, 10, 29), 0.05, "% ao dia")]
    res = d.calcula(registros, ParamsDerivados())
    assert all(linha["nominal"] is None and linha["real"] is None for linha in res["valor_presente"])
    assert len(res["avisos"]) == 2 and res["ancoras"]["cdi_anualizado"]["taxa"] > 13
