"""O orquestrador: fontes isoladas, situação de cada uma, status do dia e conferências entre fontes."""

from __future__ import annotations

from datetime import date

import pytest

from radar_pricing import coleta
from radar_pricing.config import Limite
from radar_pricing.fontes import ibge
from radar_pricing.http import Cliente
from radar_pricing.modelo import Registro, ResultadoFonte

PAPEIS = {
    "bcb_sgs": "essencial",
    "bcb_focus": "essencial",
    "bcb_taxas": "essencial",
    "bcb_panorama": "essencial",
    "tesouro": "essencial",
    "ibge": "complementar",
    "abac": "complementar",
}


@pytest.fixture(autouse=True)
def _amostra_pequena(monkeypatch):
    from radar_pricing.fontes import tesouro

    monkeypatch.setattr(tesouro, "MIN_LINHAS", 100)


def reg(fonte="x", serie="s", d=date(2026, 10, 29), valor=1.0, dimensao=""):
    return Registro(fonte, serie, "desc", d, valor, "%", dimensao)


def coletor_que_devolve(registros=(), **campos):
    def coletar(cli, hoje):
        return ResultadoFonte(registros=list(registros), **campos)

    return coletar


def coletor_que_quebra(cli, hoje):
    raise RuntimeError("deu ruim")


def roda(coletores, papeis, hoje, agora, **kw):
    return coleta.coletar_tudo(None, hoje, agora, papeis, coletores=coletores, **kw)


def test_coleta_completa_com_as_respostas_reais_gravadas(cli, hoje, agora):
    foto = coleta.coletar_tudo(cli, hoje, agora, PAPEIS)
    assert foto.status == "ok"
    assert {f.id: f.situacao for f in foto.fontes} == dict.fromkeys(PAPEIS, "ok")
    assert len(foto.registros) > 500
    assert foto.data == hoje and foto.gerado_em.endswith("-03:00")
    chaves = [(r.fonte, r.serie, r.dimensao, r.data_ref) for r in foto.registros]
    assert chaves == sorted(chaves) and len(set(chaves)) == len(chaves)  # ordenado e sem repetição
    assert any("IPCA" in c and "confere" in c for c in foto.conferencias)
    assert not any("ATENÇÃO" in c for c in foto.conferencias)


def test_paralelo_e_sequencial_dao_o_mesmo_resultado(cli, hoje, agora):
    a = coleta.coletar_tudo(cli, hoje, agora, PAPEIS, paralelo=True)
    b = coleta.coletar_tudo(cli, hoje, agora, PAPEIS, paralelo=False)
    assert a.registros == b.registros and [f.id for f in a.fontes] == [f.id for f in b.fontes]


def test_fonte_essencial_que_quebra_deixa_o_dia_parcial_sem_derrubar_as_outras(hoje, agora):
    coletores = {"a": coletor_que_devolve([reg()]), "b": coletor_que_quebra}
    foto = roda(coletores, {"a": "essencial", "b": "essencial"}, hoje, agora)
    situacoes = {f.id: f for f in foto.fontes}
    assert foto.status == "parcial"
    assert situacoes["a"].situacao == "ok" and len(foto.registros) == 1
    assert situacoes["b"].situacao == "falhou" and "RuntimeError: deu ruim" in situacoes["b"].erro


def test_fonte_complementar_que_quebra_nao_estraga_o_dia(hoje, agora):
    coletores = {"a": coletor_que_devolve([reg()]), "b": coletor_que_quebra}
    foto = roda(coletores, {"a": "essencial", "b": "complementar"}, hoje, agora)
    assert foto.status == "ok"
    assert {f.id: f.situacao for f in foto.fontes} == {"a": "ok", "b": "falhou"}


def test_dado_atrasado_de_fonte_essencial_deixa_o_dia_parcial(hoje, agora):
    coletores = {"a": coletor_que_devolve([reg()], atrasos=["selic: dado de 5 dias atrás"])}
    foto = roda(coletores, {"a": "essencial"}, hoje, agora)
    assert foto.fontes[0].situacao == "atrasado" and foto.status == "parcial"


def test_serie_que_falhou_deixa_a_fonte_parcial(hoje, agora):
    coletores = {"a": coletor_que_devolve([reg()], falhas=["SGS 433: HTML"])}
    foto = roda(coletores, {"a": "essencial"}, hoje, agora)
    assert foto.fontes[0].situacao == "parcial" and foto.status == "parcial"


def test_sem_nenhum_registro_a_fonte_falhou_e_mostra_o_motivo(hoje, agora):
    coletores = {"a": coletor_que_devolve([], falhas=["Focus: sem linhas"])}
    foto = roda(coletores, {"a": "essencial"}, hoje, agora)
    assert foto.fontes[0].situacao == "falhou" and "Focus: sem linhas" in foto.fontes[0].erro


def test_idade_do_ultimo_dado(hoje, agora):
    coletores = {"a": coletor_que_devolve([reg(d=date(2026, 10, 23)), reg(serie="t", d=date(2026, 10, 28))])}
    f = roda(coletores, {"a": "essencial"}, hoje, agora).fontes[0]
    assert f.ultimo_dado == date(2026, 10, 28) and f.idade_dias == (hoje - date(2026, 10, 28)).days


def test_filtro_de_fontes_e_fonte_inexistente(hoje, agora):
    coletores = {"a": coletor_que_devolve([reg()]), "b": coletor_que_devolve([reg(serie="t")])}
    papeis = {"a": "essencial", "b": "essencial"}
    assert [f.id for f in roda(coletores, papeis, hoje, agora, so=["b"]).fontes] == ["b"]
    with pytest.raises(ValueError, match="nenhuma fonte"):
        roda(coletores, papeis, hoje, agora, so=["nao_existe"])


class ClienteQueAnota:
    """Só anota com que limites cada fonte pediu o cliente."""

    def __init__(self, limites=()):
        self.limites = limites
        self.pedidos = []

    def com_limites(self, tentativas, timeout_s):
        self.pedidos.append((tentativas, timeout_s))
        return ClienteQueAnota((tentativas, timeout_s))


def test_limites_so_valem_para_a_fonte_que_pediu(hoje, agora):
    vistos = {}

    def coletor(nome):
        def coletar(cli, hoje):
            vistos[nome] = cli.limites
            return ResultadoFonte(registros=[reg(serie=nome)])

        return coletar

    cli = ClienteQueAnota()
    coleta.coletar_tudo(
        cli,
        hoje,
        agora,
        {"a": "essencial", "b": "complementar"},
        coletores={"a": coletor("a"), "b": coletor("b")},
        limites={"b": Limite(tentativas=2, timeout_s=20)},
    )
    assert vistos == {"a": (), "b": (2, 20)} and cli.pedidos == [(2, 20)]


def test_fonte_que_nao_responde_gasta_so_o_tempo_do_seu_limite(hoje, agora):
    """O caso real do IBGE a partir do GitHub: não responde. Com limite próprio, são 2 endereços x 1 x 15 s (30 s) e não 3 x 90 s."""
    chamadas = []

    def abre(pedido, timeout=None):
        chamadas.append(timeout)
        raise TimeoutError("sem resposta")

    cli = Cliente(abre=abre, dormir=lambda s: None)
    foto = coleta.coletar_tudo(
        cli,
        hoje,
        agora,
        {"a": "essencial", "ibge": "complementar"},
        coletores={"a": coletor_que_devolve([reg()]), "ibge": ibge.coletar},
        limites={"ibge": Limite(tentativas=1, timeout_s=15)},
    )
    assert chamadas == [15, 15]  # o SIDRA e depois as agregados, uma tentativa em cada
    assert {f.id: f.situacao for f in foto.fontes} == {"a": "ok", "ibge": "falhou"}
    assert foto.status == "ok"  # complementar não estraga o dia


def test_conferencia_do_ipca_acusa_diferenca_entre_ibge_e_bcb():
    mes = date(2026, 9, 1)
    ok = [reg("ibge", "ibge_ipca_mensal", mes, 0.82), reg("bcb_sgs", "ipca_mensal", mes, 0.82)]
    ruim = [reg("ibge", "ibge_ipca_mensal", mes, 0.82), reg("bcb_sgs", "ipca_mensal", mes, 0.91)]
    assert coleta.conferencias(ok) == ["IPCA de 09/2026 confere: IBGE 0,82% = BCB 0,82%"]
    assert coleta.conferencias(ruim)[0] == "ATENÇÃO: IPCA de 09/2026 difere: IBGE 0,82% x BCB 0,91%"


def test_conferencia_acusa_observacao_repetida():
    achados = coleta.conferencias([reg(), reg()])
    assert any("repetida" in a for a in achados)
