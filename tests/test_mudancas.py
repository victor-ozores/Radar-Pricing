"""As mudanças do dia (regras e limiares) e a foto anterior (novidades e revisões)."""

from __future__ import annotations

import json
import re
from datetime import date

import pytest

from radar_pricing import mudancas as m
from radar_pricing.coleta import coletar_tudo
from radar_pricing.config import ParamsMudancas, carrega
from radar_pricing.historico import carrega_anterior, revisoes
from radar_pricing.modelo import Registro, SituacaoFonte
from tests.conftest import PASTA

P = ParamsMudancas()


def entrada(serie, dimensao, valor, ref, dias=7, fonte="tesouro", descricao="", n_bancos=None, chave="7"):
    e = {
        "fonte": fonte,
        "serie": serie,
        "dimensao": dimensao,
        "descricao": descricao or serie,
        "unidade": "% a.a.",
        "data": "2026-10-30",
        "valor": valor,
        "variacoes": {"1": None, "7": None, "30": None},
    }
    e["variacoes"][chave] = {"ref_data": "x", "dias": dias, "valor_ref": ref, "delta": round(valor - ref, 6)}
    if n_bancos:
        e["n_bancos"] = n_bancos
    return e


def tesouro(titulo, venc, valor, ref):
    return entrada("tesouro_taxa_compra", f"titulo={titulo}|vencimento={venc}", valor, ref)


def fonte(id_, papel="essencial", situacao="ok", **kw):
    return SituacaoFonte(id_, papel, situacao, 10, date(2026, 10, 29), 1, 0.5, **kw)


def detecta(variacoes=(), fontes=(), registros=(), conferencias=(), anterior=None, setor=(), p=P):
    derivados = {"variacoes": list(variacoes), "setor": list(setor)}
    return m.detecta(list(fontes), list(registros), derivados, list(conferencias), anterior, p)


def textos(linhas):
    return [x["texto"] for x in linhas]


# ------------------------------------------------------------------------------------------------ formatação
def test_numero_com_virgula_e_sinal():
    assert m.pt(13.7500) == "13,75" and m.pt(5, 0) == "5"
    assert m.sinal(0.31) == "+0,31" and m.sinal(-0.5) == "-0,50" and m.sinal(0) == "0,00"


# ------------------------------------------------------------------------------------------------ Tesouro
def test_tesouro_o_limiar_vale_para_cima_e_para_baixo_e_inclui_o_valor_exato():
    linhas = detecta(
        [
            tesouro("Tesouro IPCA+", "2035-05-15", 7.78, 7.53),  # +0,25: entra (limiar inclusivo)
            tesouro("Tesouro IPCA+", "2029-05-15", 7.76, 7.99),  # -0,23: abaixo do limiar
            tesouro("Tesouro Prefixado", "2031-01-01", 14.00, 14.40),  # -0,40: entra
        ]
    )
    assert textos(linhas) == [
        "Tesouro IPCA+ 2035: taxa 7,78% a.a. (+0,25 p.p. em 7 dias)",
        "Tesouro Prefixado 2031: taxa 14,00% a.a. (-0,40 p.p. em 7 dias)",
    ]
    assert {x["severidade"] for x in linhas} == {"media"}


def test_tesouro_cada_familia_tem_o_seu_limite_e_ordena_pelo_maior_movimento():
    prefixados = [
        tesouro("Tesouro Prefixado", f"{2027 + k}-01-01", 14 + k, 13) for k in range(5)
    ]  # +1,+2,+3,+4,+5
    ipcas = [tesouro("Tesouro IPCA+", "2035-05-15", 8.0, 7.0)]
    linhas = detecta(prefixados + ipcas)
    assert len(linhas) == P.max_por_regra + 1  # 3 Prefixados (os maiores) e o IPCA+ (que não some)
    assert textos(linhas)[0].startswith("Tesouro IPCA+ 2035") or any(
        t.startswith("Tesouro IPCA+") for t in textos(linhas)
    )
    prefixados_mostrados = [t for t in textos(linhas) if "Prefixado" in t]
    assert [t.split(":")[0] for t in prefixados_mostrados] == [
        "Tesouro Prefixado 2031",
        "Tesouro Prefixado 2030",
        "Tesouro Prefixado 2029",
    ]


def test_tesouro_ignora_outros_titulos_e_series_sem_historico():
    sem_hist = tesouro("Tesouro IPCA+", "2035-05-15", 9, 7)
    sem_hist["variacoes"]["7"] = None
    selic = tesouro("Tesouro Selic", "2029-03-01", 0.5, 0.0)
    assert detecta([sem_hist, selic]) == []


# ------------------------------------------------------------------------------------------------ Selic e Focus
def test_meta_selic_mudou_e_alerta_alto():
    e = entrada("selic_meta", "", 13.75, 14.00, fonte="bcb_sgs")
    linhas = detecta([e])
    assert textos(linhas) == ["Meta Selic mudou: 14,00% para 13,75% a.a. (-0,25 p.p. em 7 dias)"]
    assert linhas[0]["severidade"] == "alta"
    assert detecta([entrada("selic_meta", "", 13.75, 13.75, fonte="bcb_sgs")]) == []


def test_focus_selic_e_ipca_tem_limiares_diferentes():
    linhas = detecta(
        [
            entrada(
                "focus_selic_anual", "ano=2027", 11.75, 12.00, fonte="bcb_focus"
            ),  # -0,25: entra (>= 0,25)
            entrada(
                "focus_selic_anual", "ano=2028", 10.00, 10.20, fonte="bcb_focus"
            ),  # -0,20: não entra para Selic
            entrada("focus_ipca_anual", "ano=2027", 4.40, 4.20, fonte="bcb_focus"),  # +0,20: entra (>= 0,20)
        ]
    )
    assert textos(linhas) == [
        "Focus: Selic esperada para 2027 foi de 12,00% para 11,75% (-0,25 p.p. em 7 dias)",
        "Focus: IPCA esperada para 2027 foi de 4,20% para 4,40% (+0,20 p.p. em 7 dias)",
    ]


def test_financiamento_usa_a_mediana_dos_bancos_na_menor_janela_disponivel():
    semanal = entrada(
        "mediana_taxa_financiamento_veiculos",
        "",
        24.8,
        23.6,
        fonte="bcb_taxas",
        descricao="Veículos: mediana",
        n_bancos=37,
    )
    mensal = entrada(
        "mediana_taxa_financiamento_imobiliario",
        "",
        12.0,
        11.5,
        fonte="bcb_taxas",
        descricao="Imobiliário: mediana",
        n_bancos=4,
        chave="30",
        dias=31,
    )
    linhas = detecta([semanal, mensal])
    assert textos(linhas) == [
        "Veículos: mediana (37 bancos): 24,80% a.a. (+1,20 p.p. em 7 dias)"
    ]  # imobiliário +0,5 < 1,0


# ------------------------------------------------------------------------------------------------ fontes e conferências
def test_fonte_essencial_com_problema_e_alta_e_complementar_e_so_informacao():
    linhas = detecta(
        fontes=[
            fonte(
                "tesouro",
                situacao="atrasado",
                atrasos=["tesouro_taxa_compra: dado mais novo é de 2026-10-20"],
            ),
            fonte("bcb_sgs", situacao="falhou", erro="HTTP 400"),
            fonte("abac", papel="complementar", situacao="falhou", erro="nenhum boletim"),
            fonte("ibge"),
        ]
    )
    assert [(x["severidade"], x["fonte"]) for x in linhas] == [
        ("alta", "tesouro"),
        ("alta", "bcb_sgs"),
        ("info", "abac"),
    ]
    assert "ATRASADO" in linhas[0]["texto"] and "HTTP 400" in linhas[1]["texto"]


def test_conferencia_com_atencao_vira_mudanca():
    linhas = detecta(
        conferencias=["IPCA de 09/2026 confere", "ATENÇÃO: IPCA de 09/2026 difere: IBGE 0,82% x BCB 0,91%"]
    )
    assert textos(linhas) == ["ATENÇÃO: IPCA de 09/2026 difere: IBGE 0,82% x BCB 0,91%"]


def test_ordem_alta_media_info():
    linhas = detecta(
        [
            tesouro("Tesouro IPCA+", "2035-05-15", 9, 7),
            entrada("selic_meta", "", 13.5, 13.75, fonte="bcb_sgs"),
        ],
        fontes=[fonte("abac", papel="complementar", situacao="parcial", falhas=["x"])],
    )
    assert [x["severidade"] for x in linhas] == ["alta", "media", "info"]


# ------------------------------------------------------------------------------------------------ foto anterior
def anterior_com(**kw):
    base = {
        "fontes": [
            {"id": "bcb_panorama", "extras": {"trimestre_mais_novo": "202603"}},
            {
                "id": "abac",
                "extras": {"boletins": [{"titulo": "Sistema de Consórcios em agosto/2026", "link": "u"}]},
            },
        ],
        "registros": [],
    }
    base.update(kw)
    return base


def test_novo_trimestre_do_bcb_mostra_exclusao_e_inadimplencia():
    fontes = [fonte("bcb_panorama", extras={"trimestre_mais_novo": "202606"})]
    setor = [
        {"descricao": "Índice de Exclusão - Total", "valor": 48.8, "delta": -0.03},
        {"descricao": "Índice de Inadimplência - Total", "valor": 2.12, "delta": -0.13},
    ]
    linhas = detecta(fontes=fontes, setor=setor, anterior=anterior_com())
    assert textos(linhas) == [
        "BCB publicou o trimestre 202606 do Panorama de Consórcios: exclusão total 48,80% (-0,03 p.p. no trimestre); "
        "inadimplência 2,12% (-0,13 p.p. no trimestre)"
    ]
    assert (
        detecta(
            fontes=fontes,
            setor=setor,
            anterior=anterior_com(
                fontes=[{"id": "bcb_panorama", "extras": {"trimestre_mais_novo": "202606"}}]
            ),
        )
        == []
    )


def test_novo_boletim_da_abac_com_variacao_do_mes():
    boletim = {"titulo": "Sistema de Consórcios em setembro/2026", "link": "https://blog.abac.org.br/x"}
    fontes = [fonte("abac", papel="complementar", extras={"boletins": [boletim]})]
    registros = [
        Registro("abac", "abac_participantes_ativos", "p", date(2026, 8, 31), 13.55, "milhões"),
        Registro("abac", "abac_participantes_ativos", "p", date(2026, 9, 30), 13.93, "milhões"),
    ]
    linhas = detecta(fontes=fontes, registros=registros, anterior=anterior_com())
    assert textos(linhas) == [
        "ABAC publicou o boletim 'Sistema de Consórcios em setembro/2026': 13,93 mi de participantes ativos (+0,38 mi sobre o mês anterior)"
    ]
    assert linhas[0]["link"] == "https://blog.abac.org.br/x"


def test_sem_foto_anterior_nao_existe_novidade_nem_revisao():
    fontes = [fonte("bcb_panorama", extras={"trimestre_mais_novo": "202606"})]
    assert detecta(fontes=fontes, anterior=None) == []


def test_revisao_de_numero_ja_publicado():
    r = Registro("bcb_sgs", "ipca_mensal", "IPCA, variação mensal", date(2026, 8, 1), -0.30, "%")
    anterior = anterior_com(
        registros=[
            {
                "fonte": "bcb_sgs",
                "serie": "ipca_mensal",
                "dimensao": "",
                "data_ref": "2026-08-01",
                "valor": -0.32,
            }
        ]
    )
    assert revisoes([r], anterior)[0]["antes"] == -0.32
    assert textos(detecta(registros=[r], anterior=anterior)) == [
        "Revisão de dado já publicado: IPCA, variação mensal, 2026-08-01: -0,32 para -0,3 %"
    ]
    igual = Registro("bcb_sgs", "ipca_mensal", "x", date(2026, 8, 1), -0.32, "%")
    assert revisoes([igual], anterior) == []


def test_muitas_revisoes_viram_um_resumo():
    rs = [Registro("tesouro", "t", f"t{k}", date(2026, 10, 1 + k), 2.0, "%") for k in range(5)]
    anterior = anterior_com(
        registros=[
            {
                "fonte": "tesouro",
                "serie": "t",
                "dimensao": "",
                "data_ref": r.data_ref.isoformat(),
                "valor": 1.0,
            }
            for r in rs
        ]
    )
    linhas = textos(detecta(registros=rs, anterior=anterior))
    assert len(linhas) == P.max_por_regra + 1 and linhas[-1] == "... e mais 2 revisões de dados já publicados"


# ------------------------------------------------------------------------------------------------ carrega_anterior
def test_carrega_anterior_pega_a_mais_recente_antes_de_hoje(tmp_path):
    for dia in ("2026-10-27", "2026-10-28", "2026-10-30", "2026-10-31"):
        (tmp_path / f"{dia}.json").write_text(json.dumps({"data": dia, "registros": []}), encoding="utf-8")
    (tmp_path / "2026-10-29.csv").write_text("x", encoding="utf-8")  # só o JSON conta
    (tmp_path / "rascunho.json").write_text("{}", encoding="utf-8")
    assert (
        carrega_anterior(tmp_path, date(2026, 10, 30))["data"] == "2026-10-28"
    )  # nunca a de hoje nem a do futuro
    assert carrega_anterior(tmp_path, date(2026, 10, 27)) is None
    assert carrega_anterior(tmp_path / "nao_existe", date(2026, 10, 30)) is None


# ------------------------------------------------------------------------------------------------ com as amostras reais
@pytest.fixture
def foto(cli, hoje, agora, monkeypatch):
    from radar_pricing.fontes import tesouro as tes

    monkeypatch.setattr(tes, "MIN_LINHAS", 100)
    cfg = carrega(PASTA.parent.parent / "config.toml")
    return coletar_tudo(cli, hoje, agora, cfg.papeis, derivados=cfg.derivados, mudancas=cfg.mudancas)


def test_o_salto_dos_juros_de_26_10_aparece_nas_duas_familias_do_tesouro(foto):
    # em 26/10/2026 as taxas do Tesouro subiram mais de 1 p.p. (dado real das amostras)
    linhas = [x for x in foto.mudancas if x["regra"] == "tesouro"]
    familias = {x["texto"].split(":")[0].rsplit(" ", 1)[0] for x in linhas}
    assert familias == {"Tesouro Prefixado", "Tesouro IPCA+"}
    assert all(x["delta"] > 0.9 for x in linhas)
    assert len([x for x in linhas if "Prefixado" in x["texto"]]) <= P.max_por_regra


def test_toda_mudanca_tem_regra_severidade_e_numeros_com_virgula_decimal(foto):
    assert foto.mudancas
    for x in foto.mudancas:
        assert x["severidade"] in m.ORDEM and x["regra"] and x["texto"]
        assert not re.search(r"\d\.\d", x["texto"]), x["texto"]  # 13,75 e não 13.75
    assert not any(re.search(r"\d\.\d", c) for c in foto.conferencias)
