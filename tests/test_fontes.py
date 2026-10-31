"""Cada coletor, lendo respostas REAIS gravadas. Os testes conferem regras e coerência com o corpo bruto da
resposta (não valores fixos de mercado), para continuarem válidos quando as amostras forem regravadas."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from radar_pricing.datas import parse_br
from radar_pricing.fontes import abac, bcb_focus, bcb_panorama, bcb_sgs, bcb_taxas, ibge, tesouro
from radar_pricing.http import Falha


def series_de(res):
    return {r.serie for r in res.registros}


def sem_data_futura(res, hoje):
    assert res.registros
    assert all(r.data_ref <= hoje for r in res.registros)


# ------------------------------------------------------------------------------------------------ SGS
def test_sgs_traz_as_seis_series_sem_data_futura(cli, hoje):
    res = bcb_sgs.coletar(cli, hoje)
    assert res.falhas == []
    assert series_de(res) == {s.serie for s in bcb_sgs.SERIES}
    sem_data_futura(res, hoje)


def test_sgs_descarta_o_registro_com_data_a_frente_de_hoje(hoje):
    # a meta Selic (432) já veio com registros datados depois de hoje; com a janela de datas o BCB não manda
    # mais, mas o coletor continua se protegendo
    class ComFuturo:
        def json(self, url):
            return [
                {"data": "28/10/2026", "valor": "13.75"},
                {"data": "29/10/2026", "valor": "13.75"},
                {"data": "04/11/2026", "valor": "13.50"},
                {"data": "05/11/2026", "valor": "13.50"},
            ]

    res = bcb_sgs.coletar(ComFuturo(), hoje)
    assert all(r.data_ref <= hoje for r in res.registros)
    assert len([r for r in res.registros if r.serie == "selic_meta"]) == 2
    assert any("selic_meta: 2 registro(s) com data à frente de hoje" in a for a in res.avisos)


def test_sgs_as_series_diarias_usam_janela_de_datas_e_as_mensais_as_ultimas(hoje):
    diaria = next(s for s in bcb_sgs.SERIES if s.codigo == 432)
    mensal = next(s for s in bcb_sgs.SERIES if s.codigo == 433)
    assert diaria.url(hoje).endswith("?formato=json&dataInicial=31/08/2026&dataFinal=30/10/2026")
    assert mensal.url(hoje).endswith("/ultimos/3?formato=json")


def test_sgs_recusa_mais_de_20_ultimas_observacoes_e_definicao_ambigua():
    # o SGS responde HTTP 400 para ultimos/21 em diante (defeito real de 30/10/2026)
    with pytest.raises(ValueError, match="no máximo 20"):
        bcb_sgs.SerieSgs(1, "x", "x", "%", 5, n=21)
    with pytest.raises(ValueError, match="só um dos dois"):
        bcb_sgs.SerieSgs(1, "x", "x", "%", 5, n=3, janela_dias=60)
    with pytest.raises(ValueError, match="só um dos dois"):
        bcb_sgs.SerieSgs(1, "x", "x", "%", 5)


def test_sgs_as_series_diarias_cobrem_30_dias_para_tras(cli, hoje):
    res = bcb_sgs.coletar(cli, hoje)
    for serie in ("selic_meta", "selic_over", "cdi"):
        datas = sorted(r.data_ref for r in res.registros if r.serie == serie)
        assert (datas[-1] - datas[0]).days >= 30, serie


@pytest.mark.parametrize("codigo,serie", [(433, "ipca_mensal"), (13522, "ipca_12_meses"), (11, "selic_over")])
def test_sgs_o_valor_mais_novo_bate_com_o_corpo_bruto(cli, hoje, codigo, serie):
    s = next(s for s in bcb_sgs.SERIES if s.codigo == codigo)
    bruto = [d for d in cli.json(s.url(hoje)) if parse_br(d["data"]) <= hoje]
    esperado = max(bruto, key=lambda d: parse_br(d["data"]))
    novo = max(
        (r for r in bcb_sgs.coletar(cli, hoje).registros if r.serie == serie), key=lambda r: r.data_ref
    )
    assert novo.data_ref == parse_br(esperado["data"])
    assert novo.valor == float(esperado["valor"])


def test_sgs_uma_serie_que_falha_nao_derruba_as_outras(cli, hoje):
    class Quebrado:
        def json(self, url):
            if "sgs.433" in url:
                raise Falha("HTTP 200 mas o corpo não é JSON")
            return cli.json(url)

    res = bcb_sgs.coletar(Quebrado(), hoje)
    assert len(res.falhas) == 1 and "ipca_mensal" in res.falhas[0]
    assert "ipca_mensal" not in series_de(res)
    assert len(series_de(res)) == len(bcb_sgs.SERIES) - 1


def test_sgs_dado_velho_demais_vira_atraso(cli, hoje):
    class AmostraAntiga:
        """Entrega, para qualquer data de consulta, a resposta gravada de hoje: simula uma fonte parada."""

        def json(self, url):
            codigo = url.split("sgs.")[1].split("/")[0]
            return cli.json(next(s.url(hoje) for s in bcb_sgs.SERIES if str(s.codigo) == codigo))

    res = bcb_sgs.coletar(AmostraAntiga(), date(2027, 1, 30))  # três meses depois das amostras
    assert any("selic_over" in a for a in res.atrasos)
    assert any("ipca_mensal" in a for a in res.atrasos)


# ------------------------------------------------------------------------------------------------ Focus
def test_focus_anos_series_e_semanas(cli, hoje):
    res = bcb_focus.coletar(cli, hoje)
    assert res.falhas == []
    assert series_de(res) == {"focus_selic_anual", "focus_ipca_anual", "focus_selic_reuniao"}
    anos = {r.dimensao for r in res.registros if r.serie == "focus_selic_anual"}
    assert anos == {f"ano={hoje.year + k}" for k in range(4)}
    datas = {r.data_ref for r in res.registros if r.serie == "focus_selic_anual"}
    assert (max(datas) - min(datas)).days >= 30  # olhada de 30 dias para trás
    assert (max(datas) - min(datas)).days <= bcb_focus.JANELA_DIAS
    assert all(r.unidade == "% a.a." for r in res.registros)
    sem_data_futura(res, hoje)


def test_focus_reunioes_sao_da_edicao_mais_nova_e_sem_repeticao(cli, hoje):
    res = bcb_focus.coletar(cli, hoje)
    reunioes = [r for r in res.registros if r.serie == "focus_selic_reuniao"]
    assert len({r.data_ref for r in reunioes}) == 1
    assert len({r.dimensao for r in reunioes}) == len(reunioes)
    assert all(r.dimensao.startswith("reuniao=R") for r in reunioes)


# ------------------------------------------------------------------------------------------------ taxas de juros
def test_taxas_por_banco_sem_repeticao(cli, hoje):
    res = bcb_taxas.coletar(cli, hoje)
    assert res.falhas == []
    assert series_de(res) == {"taxa_financiamento_imobiliario", "taxa_financiamento_veiculos"}
    limites = (
        ("taxa_financiamento_imobiliario", bcb_taxas.MESES_GUARDADOS),
        ("taxa_financiamento_veiculos", bcb_taxas.SEMANAS_GUARDADAS),
    )
    for serie, maximo in limites:
        regs = [r for r in res.registros if r.serie == serie]
        assert len({r.data_ref for r in regs}) <= maximo
        assert len({(r.data_ref, r.dimensao) for r in regs}) == len(regs)  # um valor por banco e período
        assert all(r.dimensao.startswith("banco=") and 0 < r.valor < 200 for r in regs)
    sem_data_futura(res, hoje)


def test_taxas_veiculos_so_atrasam_depois_de_quatro_semanas(cli, hoje):
    """Caso real de 31/10/2026: a janela mais nova tinha 22 dias e o limite de 21 acusou atraso à toa."""
    res = bcb_taxas.coletar(cli, hoje)
    mais_nova = max(r.data_ref for r in res.registros if r.serie == "taxa_financiamento_veiculos")
    no_limite = mais_nova + timedelta(days=bcb_taxas.MAX_DIAS_VEICULOS)
    assert bcb_taxas.MAX_DIAS_VEICULOS >= 28
    assert bcb_taxas.coletar(cli, no_limite).atrasos == []
    atrasos = bcb_taxas.coletar(cli, no_limite + timedelta(days=1)).atrasos
    assert len(atrasos) == 1 and "taxa_financiamento_veiculos" in atrasos[0]


def test_taxas_veiculos_sao_semanais_e_o_imobiliario_mensal(cli, hoje):
    res = bcb_taxas.coletar(cli, hoje)
    imob = {r.data_ref for r in res.registros if r.serie == "taxa_financiamento_imobiliario"}
    assert all(d.day == 1 for d in imob)  # período mensal: dia 1 do mês


# ------------------------------------------------------------------------------------------------ Panorama
def test_panorama_dois_trimestres_com_todas_as_metricas(cli, hoje):
    res = bcb_panorama.coletar(cli, hoje)
    assert res.falhas == [] and res.avisos == []
    datas = sorted({r.data_ref for r in res.registros})
    assert len(datas) == 2 and datas[1] > datas[0]
    for d in datas:
        assert sum(1 for r in res.registros if r.data_ref == d) >= bcb_panorama.MIN_METRICAS
    assert res.extras["trimestre_mais_novo"] == f"{datas[1].year}{datas[1].month:02d}"
    assert all(r.descricao and r.unidade and r.dimensao.startswith("grupo=") for r in res.registros)
    sem_data_futura(res, hoje)


def test_panorama_pula_o_trimestre_mais_novo_quando_ainda_esta_vazio(cli, hoje):
    # nas amostras de 30/10/2026, set/2026 ainda não existia no BCB: o coletor anda para trás até achar dados
    vazios = [u for u in cli.indice if "DataBase=2026" in u and cli.json(u)["value"] == []]
    if not vazios:
        pytest.skip("as amostras foram gravadas quando o trimestre mais novo já estava publicado")
    res = bcb_panorama.coletar(cli, hoje)
    assert res.registros and all(f"@DataBase={res.extras['trimestre_mais_novo']}" not in u for u in vazios)


def test_panorama_trimestre_incompleto_vira_aviso(cli, hoje):
    class Cortado:
        def json(self, url):
            dados = cli.json(url)
            return {"value": dados["value"][:10]}

    res = bcb_panorama.coletar(Cortado(), hoje)
    assert any("métricas" in a for a in res.avisos)


# ------------------------------------------------------------------------------------------------ Tesouro
@pytest.fixture
def tesouro_pequeno(monkeypatch):
    monkeypatch.setattr(tesouro, "MIN_LINHAS", 100)  # a amostra tem só os últimos 14 dias do arquivo


def test_tesouro_taxas_da_janela_recente(cli, hoje, tesouro_pequeno):
    res = tesouro.coletar(cli, hoje)
    assert res.falhas == []
    assert series_de(res) == {"tesouro_taxa_compra"}
    datas = {r.data_ref for r in res.registros}
    assert max(datas) <= hoje and (max(datas) - min(datas)).days <= tesouro.JANELA_DIAS
    titulos = {r.dimensao.split("|")[0] for r in res.registros}
    assert "titulo=Tesouro IPCA+" in titulos and "titulo=Tesouro Selic" in titulos
    assert all(r.dimensao.split("|")[1].startswith("vencimento=20") for r in res.registros)


def test_tesouro_sem_catalogo_usa_o_endereco_de_reserva(cli, hoje, tesouro_pequeno):
    csv_amostra = next(cli.texto(u, "latin-1") for u in cli.indice if u.lower().endswith(".csv"))

    class SemCatalogo:
        def json(self, url):
            raise Falha("HTTP 503")

        def texto(self, url, codificacao="utf-8"):
            assert url == tesouro.CSV_RESERVA
            return csv_amostra

    res = tesouro.coletar(SemCatalogo(), hoje)
    assert res.registros and any("endereço de reserva" in a for a in res.avisos)


def test_tesouro_arquivo_cortado_e_recusado(cli, hoje):
    # sem o monkeypatch, a amostra (poucas linhas) parece um arquivo cortado
    res = tesouro.coletar(cli, hoje)
    assert not res.registros and any("só" in f and "linhas" in f for f in res.falhas)


def test_tesouro_dado_velho_vira_atraso(cli, tesouro_pequeno):
    res = tesouro.coletar(cli, date(2027, 1, 30))
    assert res.atrasos


# ------------------------------------------------------------------------------------------------ IBGE
def test_ibge_ipca_mensal(cli, hoje):
    res = ibge.coletar(cli, hoje)
    assert res.falhas == [] and series_de(res) == {"ibge_ipca_mensal"}
    assert 1 <= len(res.registros) <= 3 and all(r.data_ref.day == 1 for r in res.registros)


# ------------------------------------------------------------------------------------------------ ABAC
FRASES = {
    # as três formas como o boletim já escreveu os mesmos números (set, ago e jul de 2026)
    "set": (
        "O Sistema de Consórcios encerrou setembro de 2026 com 13,93 milhões de participantes ativos. Nos nove "
        "primeiros meses do ano, alcançando 4,37 milhões de cotas comercializadas. O volume de créditos "
        "comercializados atingiu R$ 454,13 bilhões. O tíquete médio chegou a R$ 116,76 mil em setembro. "
        "As contemplações somaram 1,33 milhão nos nove primeiros meses. Já os créditos disponibilizados "
        "alcançaram R$ 97,83 bilhões."
    ),
    "jul": (
        "Em julho, o número de participantes ativos alcançou 13,41 milhões. As vendas chegaram a 3,31 milhões "
        "de cotas entre janeiro e julho. Os créditos comercializados somaram R$ 331,60 bilhões. As "
        "contemplações também superaram uma marca importante. Foram 1,03 milhão de consorciados "
        "contemplados. Os créditos disponibilizados chegaram a R$ 74,38 bilhões."
    ),
}


def test_abac_extrai_as_duas_redacoes_conhecidas():
    achados, faltaram = abac.extrair(FRASES["set"])
    assert faltaram == [] and achados["abac_participantes_ativos"] == 13.93
    assert achados["abac_creditos_disponibilizados_no_ano"] == 97.83
    achados, faltaram = abac.extrair(FRASES["jul"])
    assert achados["abac_participantes_ativos"] == 13.41 and achados["abac_cotas_vendidas_no_ano"] == 3.31
    assert (
        achados["abac_creditos_comercializados_no_ano"] == 331.60
    )  # a palavra "somaram" tem "r": não pode quebrar
    assert achados["abac_contemplacoes_no_ano"] == 1.03
    assert faltaram == ["abac_ticket_medio"]  # julho não traz o tíquete do total no mesmo formato


def test_abac_numero_fora_da_faixa_plausivel_e_recusado():
    achados, faltaram = abac.extrair("O sistema encerrou com 500,00 milhões de participantes ativos.")
    assert "abac_participantes_ativos" not in achados and "abac_participantes_ativos" in faltaram


def test_abac_posts_mensais_e_links(cli, hoje):
    res = abac.coletar(cli, hoje)
    assert res.falhas == []
    boletins = res.extras["boletins"]
    assert 1 <= len(boletins) <= abac.MESES_GUARDADOS
    assert all(b["link"].startswith("https://blog.abac.org.br/") for b in boletins)
    assert all(b["campos_esperados"] == len(abac.CAMPOS) for b in boletins)
    assert max(b["campos_achados"] for b in boletins) >= 5
    # a data de referência é o fim do mês do título
    assert all(date.fromisoformat(b["referencia"]).day >= 28 for b in boletins)


def test_abac_sem_boletim_mensal_e_falha(cli, hoje):
    class SemMensais:
        def json(self, url):
            return [
                {"title": {"rendered": "Outro assunto"}, "content": {"rendered": ""}, "date": "2026-10-01"}
            ]

    res = abac.coletar(SemMensais(), hoje)
    assert not res.registros and res.falhas
