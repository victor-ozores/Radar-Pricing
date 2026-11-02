"""O painel (site/js) contra o robô: a mesma foto, as mesmas contas, o Excel que abre.

O JavaScript roda no Node; sem Node o teste é pulado, salvo no CI (EXIGE_NODE=1), onde faltar o Node é falha.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

from radar_pricing import config
from radar_pricing.amostras import ClienteGravado
from radar_pricing.coleta import coletar_tudo
from radar_pricing.derivados import interpola, valor_presente
from radar_pricing.fontes import tesouro

RAIZ = Path(__file__).resolve().parent.parent
AJUDA = Path(__file__).parent / "node" / "ajuda.mjs"
NODE = shutil.which("node")


@pytest.fixture(autouse=True)
def _exige_node():
    if NODE is None:
        if os.environ.get("EXIGE_NODE"):
            pytest.fail("Node não encontrado, mas EXIGE_NODE está ligado")
        pytest.skip("Node não instalado")


@pytest.fixture(scope="module")
def foto_json(tmp_path_factory, hoje, agora):
    """A foto de verdade (a mesma que o robô grava), feita com as respostas reais gravadas."""
    mp = pytest.MonkeyPatch()
    mp.setattr(tesouro, "MIN_LINHAS", 100)  # o CSV gravado como amostra é curto de propósito
    try:
        cfg = config.carrega(RAIZ / "config.toml")
        foto = coletar_tudo(
            ClienteGravado(Path(__file__).parent / "fixtures"),
            hoje,
            agora,
            cfg.papeis,
            derivados=cfg.derivados,
            mudancas=cfg.mudancas,
        )
    finally:
        mp.undo()
    caminho = tmp_path_factory.mktemp("foto") / f"{foto.data.isoformat()}.json"
    caminho.write_text(json.dumps(foto.como_dict(), ensure_ascii=False), encoding="utf-8")
    return caminho


def _openpyxl():
    if os.environ.get("EXIGE_NODE"):  # no CI faltar a biblioteca é falha, não pulo
        import openpyxl

        return openpyxl
    return pytest.importorskip("openpyxl")


def node(*args: str) -> str:
    r = subprocess.run(
        [NODE, str(AJUDA), *args], capture_output=True, text=True, encoding="utf-8", check=False
    )
    assert r.returncode == 0, r.stderr
    return r.stdout


# ------------------------------------------------------------------------------------------ calculadora
def test_calculadora_do_painel_da_o_mesmo_valor_presente_que_o_robo(foto_json, tmp_path):
    foto = json.loads(foto_json.read_text(encoding="utf-8"))
    d = foto["derivados"]
    curvas = {"nominal": d["ancoras"]["curva_nominal"], "real": d["ancoras"]["curva_real"]}
    assert curvas["nominal"] and curvas["real"], "a foto de teste precisa das duas curvas"
    casos = [
        {"curva": c, "meses": m, "spread": s, "valor": v}
        for c in curvas
        for m in range(1, 301)
        for s in (0, 2.5, 5, 11.75)
        for v in (1000, 25_340.5)
    ]
    caminho = tmp_path / "casos.json"
    caminho.write_text(json.dumps(casos), encoding="utf-8")
    do_js = json.loads(node("calc", str(foto_json), str(caminho)))

    for caso, js in zip(casos, do_js, strict=True):
        taxa, extrapolado = interpola(curvas[caso["curva"]]["pontos"], caso["meses"] / 12)
        demo = taxa + caso["spread"]
        esperado = {
            "taxa_ancora": round(taxa, 4),
            "taxa_demonstracao": round(demo, 4),
            "vp_ancora": round(valor_presente(caso["valor"], taxa, caso["meses"]), 2),
            "vp_demonstracao": round(valor_presente(caso["valor"], demo, caso["meses"]), 2),
            "extrapolado": extrapolado,
        }
        assert js == esperado, caso


def test_a_tabela_dentro_da_foto_e_a_mesma_da_calculadora(foto_json, tmp_path):
    """Os 5 prazos que o robô grava (valor de face e spread da foto) saem iguais na calculadora do painel."""
    foto = json.loads(foto_json.read_text(encoding="utf-8"))
    par = foto["derivados"]["parametros"]
    linhas = foto["derivados"]["valor_presente"]
    casos = [
        {
            "curva": c,
            "meses": linha["meses"],
            "spread": par["spread_demonstracao_pp"],
            "valor": par["valor_face"],
        }
        for linha in linhas
        for c in ("nominal", "real")
    ]
    caminho = tmp_path / "casos.json"
    caminho.write_text(json.dumps(casos), encoding="utf-8")
    do_js = json.loads(node("calc", str(foto_json), str(caminho)))
    esperado = [linha[c] for linha in linhas for c in ("nominal", "real")]
    assert do_js == esperado


# ------------------------------------------------------------------------------------------ modelo
def test_medianas_do_painel_batem_com_as_do_robo(foto_json):
    foto = json.loads(foto_json.read_text(encoding="utf-8"))
    do_robo = {v["serie"]: v["valor"] for v in foto["derivados"]["variacoes"] if v["fonte"] == "bcb_taxas"}
    js = json.loads(node("modelo", str(foto_json)))
    assert js["mediana_veiculos"] == pytest.approx(do_robo["mediana_taxa_financiamento_veiculos"], abs=1e-6)
    assert js["mediana_imobiliario"] == pytest.approx(
        do_robo["mediana_taxa_financiamento_imobiliario"], abs=1e-6
    )


def test_o_painel_enxerga_as_curvas_e_o_panorama_da_foto(foto_json):
    foto = json.loads(foto_json.read_text(encoding="utf-8"))
    js = json.loads(node("modelo", str(foto_json)))
    ancoras = foto["derivados"]["ancoras"]
    esperado = {
        "nominal": len(ancoras["curva_nominal"]["pontos"]),
        "real": len(ancoras["curva_real"]["pontos"]),
    }
    assert {c["id"]: c["pontos"] for c in js["curvas"]} == esperado
    assert js["panorama_linhas"] == len(foto["derivados"]["setor"])
    assert len(js["manchetes"]) >= 6 and all(m["valor"] is not None for m in js["manchetes"])


# ------------------------------------------------------------------------------------------ calculadoras
def _taxa(curva: dict, meses: float) -> float:
    return interpola(curva["pontos"], meses / 12)[0]


def _cancelada(e: dict, curvas: dict) -> dict:
    propria = e.get("correcaoPct") is not None  # a taxa própria prevalece e desconta pela curva Prefixada
    ancora = _taxa(curvas["real" if e["corrigido"] and not propria else "nominal"], e["meses"])
    desconto = ancora + e["spreadPP"]
    no_pagamento = e["valor"] * (1 + e["correcaoPct"] / 100) ** (e["meses"] / 12) if propria else e["valor"]
    vp = valor_presente(no_pagamento, desconto, e["meses"])
    return {
        "taxa_ancora": ancora,
        "taxa_desconto": desconto,
        "valor_no_pagamento": no_pagamento,
        "valor_presente": vp,
        "pct_do_valor": vp / e["valor"] * 100,
    }


def _retorno(e: dict, curvas: dict) -> dict:
    ancora = _taxa(curvas["real" if e["corrigido"] else "nominal"], e["meses"])
    alvo = e["alvoPct"] if e.get("alvoPct") is not None else ancora + e["spreadPP"]
    maximo = valor_presente(e["valor"], alvo, e["meses"])
    return {
        "retorno_aa": ((e["valor"] / e["preco"]) ** (12 / e["meses"]) - 1) * 100,
        "retorno_total": (e["valor"] / e["preco"] - 1) * 100,
        "taxa_ancora": ancora,
        "alvo": alvo,
        "preco_maximo": maximo,
        "folga": maximo - e["preco"],
    }


def _ativa(e: dict, curvas: dict) -> dict:
    spread, k = e["spreadPP"], e["contemplacao"]

    def desconto(meses: int) -> float:
        return _taxa(curvas["real"], meses) + spread

    vp_parcelas = sum(valor_presente(e["parcela"], desconto(t), t) for t in range(1, e["parcelas"] + 1))
    vp_credito = e["credito"] if k == 0 else valor_presente(e["credito"], desconto(k), k)
    return {
        "vp_credito": vp_credito,
        "vp_parcelas": vp_parcelas,
        "valor_da_cota": vp_credito - vp_parcelas,
        "pct_do_credito": (vp_credito - vp_parcelas) / e["credito"] * 100,
        "total_das_parcelas": e["parcela"] * e["parcelas"],
    }


def _cenarios() -> list[dict]:
    casos = []
    for valor in (1000, 50000.55):
        for meses in (1, 7, 24, 36, 121, 360):
            for corrigido in (True, False):
                for spread in (0, 5, 12.5):
                    entrada = {"valor": valor, "meses": meses, "corrigido": corrigido, "spreadPP": spread}
                    casos.append({"calc": "cancelada", "entrada": entrada})
    for meses in (1, 24, 60, 200):  # taxa própria de correção (o índice do bem), com e sem "corrigido" ligado
        for correcao in (0, 4.5, 12.25, -2):
            for corrigido in (True, False):
                entrada = {
                    "valor": 80000.5,
                    "meses": meses,
                    "corrigido": corrigido,
                    "correcaoPct": correcao,
                    "spreadPP": 5,
                }
                casos.append({"calc": "cancelada", "entrada": entrada})
    for preco, valor in ((800, 1000), (38000, 50000), (100, 99)):
        for meses in (1, 18, 60, 300):
            for corrigido in (True, False):
                for alvo in (None, 17.5):
                    entrada = {"preco": preco, "valor": valor, "meses": meses, "corrigido": corrigido}
                    casos.append({"calc": "retorno", "entrada": {**entrada, "alvoPct": alvo, "spreadPP": 5}})
    for credito in (30000, 100000):
        for parcela in (900, 1900):
            for parcelas in (12, 60, 200):
                for k in (0, parcelas // 2, parcelas):
                    for spread in (0, 5):
                        entrada = {"credito": credito, "parcela": parcela, "parcelas": parcelas}
                        casos.append(
                            {"calc": "ativa", "entrada": {**entrada, "contemplacao": k, "spreadPP": spread}}
                        )
    return casos


def test_calculadoras_do_painel_batem_com_uma_conta_feita_em_python(foto_json):
    """As três calculadoras (JavaScript) contra a mesma conta escrita de novo em Python, usando a
    interpolação e o valor presente do próprio robô, em 224 combinações de entrada."""
    foto = json.loads(foto_json.read_text(encoding="utf-8"))
    a = foto["derivados"]["ancoras"]
    curvas = {"nominal": a["curva_nominal"], "real": a["curva_real"]}
    casos = _cenarios()
    r = subprocess.run(
        [NODE, str(AJUDA), "cenarios", str(foto_json), "-"],
        input=json.dumps(casos),
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )
    assert r.returncode == 0, r.stderr
    do_js = json.loads(r.stdout)
    assert len(do_js) == len(casos) == 224
    conta = {"cancelada": _cancelada, "retorno": _retorno, "ativa": _ativa}
    for caso, js in zip(casos, do_js, strict=True):
        esperado = conta[caso["calc"]](caso["entrada"], curvas)
        for campo, valor in esperado.items():
            assert js[campo] == pytest.approx(valor, rel=1e-9, abs=1e-9), (caso, campo)


# ------------------------------------------------------------------------------------------ precatório
def _caminho_independente(foto: dict):
    """A Selic e o IPCA esperados de cada ano, tirados direto dos registros brutos (não do código do painel)."""
    registros = foto["registros"]
    ano_base, mes_base = int(foto["data"][:4]), int(foto["data"][5:7]) - 1
    meta = max(
        (r["data_ref"], r["valor"])
        for r in registros
        if r["serie"] == "selic_meta" and r["data_ref"] <= foto["data"]
    )[1]

    def focus(serie: str) -> dict[int, float]:
        por_ano: dict[int, list[tuple[str, float]]] = {}
        for r in registros:
            if r["serie"] == serie:
                por_ano.setdefault(int(r["dimensao"].split("=")[1]), []).append((r["data_ref"], r["valor"]))
        return {ano: max(v)[1] for ano, v in por_ano.items()}

    selic_por_ano, ipca_por_ano = focus("focus_selic_anual"), focus("focus_ipca_anual")

    def repete(mapa: dict[int, float], ano: int) -> float | None:
        if not mapa:
            return None
        if ano in mapa:
            return mapa[ano]
        return mapa[max(mapa)] if ano > max(mapa) else mapa[min(mapa)]

    def selic(ano: int) -> float:
        if ano == ano_base and ano_base in selic_por_ano:
            return (meta + selic_por_ano[ano_base]) / 2
        valor = repete(selic_por_ano, ano)
        return meta if valor is None else valor

    return ano_base, mes_base, selic, lambda ano: repete(ipca_por_ano, ano)


def _precatorio(e: dict, curva: dict, caminho) -> dict:
    ano_base, mes_base, selic, ipca = caminho
    if e["indice"] == "nenhum":
        fator = 1.0
    elif e["indice"] == "propria":
        fator = (1 + e["propriaPct"] / 100) ** (e["meses"] / 12)
    else:
        fator = 1.0
        for m in range(1, e["meses"] + 1):
            ano = ano_base + (mes_base + m) // 12
            taxa = selic(ano) if e["indice"] == "selic" else min(ipca(ano) + e["jurosPP"], selic(ano))
            fator *= (1 + taxa / 100) ** (1 / 12)
    esperado = e["valor"] * fator
    liquido = esperado * (1 - e["retencaoPct"] / 100)
    desconto = _taxa(curva, e["meses"]) + e["spreadPP"]
    vp = valor_presente(liquido, desconto, e["meses"])
    saida = {
        "fator": fator,
        "valor_esperado": esperado,
        "liquido_esperado": liquido,
        "valor_presente": vp,
        "taxa_desconto": desconto,
    }
    if e["desagioPct"] is not None:
        pago = e["valor"] * (1 - e["desagioPct"] / 100) + e["custos"]
        saida |= {
            "pago": pago,
            "retorno_aa": ((liquido / pago) ** (12 / e["meses"]) - 1) * 100,
            "folga": vp - pago,
            "preco_maximo": vp - e["custos"],
        }
    return saida


def _cenarios_do_precatorio() -> list[dict]:
    casos = []
    for valor in (1000, 123456.78):
        for meses in (1, 2, 3, 14, 36, 48, 120, 200, 360):
            for indice in ("selic", "ipca", "propria", "nenhum"):
                for retencao in (0, 17.5):
                    for desagio, custos in ((None, 0), (40, 1500)):
                        for spread in (0, 5):
                            entrada = {
                                "valor": valor,
                                "meses": meses,
                                "indice": indice,
                                "jurosPP": 2,
                                "propriaPct": 8,
                                "retencaoPct": retencao,
                                "desagioPct": desagio,
                                "custos": custos,
                                "spreadPP": spread,
                            }
                            casos.append({"calc": "precatorio", "entrada": entrada})
    return casos


def test_precatorio_do_painel_bate_com_uma_conta_feita_em_python(foto_json):
    """O precatório (JavaScript) contra o mesmo laço mês a mês escrito de novo em Python, com a Selic e o IPCA
    esperados tirados direto dos registros da foto, em 576 combinações de entrada."""
    foto = json.loads(foto_json.read_text(encoding="utf-8"))
    curva = foto["derivados"]["ancoras"]["curva_nominal"]
    caminho = _caminho_independente(foto)
    casos = _cenarios_do_precatorio()
    r = subprocess.run(
        [NODE, str(AJUDA), "cenarios", str(foto_json), "-"],
        input=json.dumps(casos),
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )
    assert r.returncode == 0, r.stderr
    do_js = json.loads(r.stdout)
    assert len(do_js) == len(casos) == 576
    for caso, js in zip(casos, do_js, strict=True):
        esperado = _precatorio(caso["entrada"], curva, caminho)
        for campo, valor in esperado.items():
            obtido = js[campo] if campo in js else js["oferta"][campo]
            assert obtido == pytest.approx(valor, rel=1e-9, abs=1e-9), (caso, campo)


def test_retorno_da_oferta_com_custos_bate_com_uma_conta_feita_em_python(foto_json):
    foto = json.loads(foto_json.read_text(encoding="utf-8"))
    a = foto["derivados"]["ancoras"]
    curvas = {"nominal": a["curva_nominal"], "real": a["curva_real"]}
    casos = [
        {
            "calc": "retorno",
            "entrada": {
                "preco": 38000,
                "valor": 50000,
                "meses": m,
                "corrigido": c,
                "alvoPct": None,
                "spreadPP": 5,
                "custos": custos,
            },
        }
        for m in (6, 24, 60)
        for c in (True, False)
        for custos in (0, 2500)
    ]
    r = subprocess.run(
        [NODE, str(AJUDA), "cenarios", str(foto_json), "-"],
        input=json.dumps(casos),
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )
    assert r.returncode == 0, r.stderr
    for caso, js in zip(casos, json.loads(r.stdout), strict=True):
        e = caso["entrada"]
        pago = e["preco"] + e["custos"]
        ancora = _taxa(curvas["real" if e["corrigido"] else "nominal"], e["meses"])
        maximo = valor_presente(e["valor"], ancora + e["spreadPP"], e["meses"])
        assert js["retorno_aa"] == pytest.approx(
            ((e["valor"] / pago) ** (12 / e["meses"]) - 1) * 100, rel=1e-9
        )
        assert js["folga"] == pytest.approx(maximo - pago, rel=1e-9, abs=1e-9)
        assert js["preco_maximo"] == pytest.approx(maximo - e["custos"], rel=1e-9, abs=1e-9)


# ------------------------------------------------------------------------------------------ excel
ABAS_DO_EXCEL = [
    "Leia-me",
    "Hoje",
    "Cota cancelada",
    "Retorno da oferta",
    "Cota ativa",
    "Cota ativa (cálculo)",
    "Precatório",
    "Custo do dinheiro",
    "Crédito concorrente",
    "Setor",
    "Mudanças",
    "Fontes",
    "Observações",
]


def _linha_do_cabecalho(ws, texto: str) -> int:
    return next(c.row for c in ws["B"] if c.value == texto)


def test_excel_abre_no_openpyxl_com_os_numeros_da_foto(foto_json, tmp_path):
    openpyxl = _openpyxl()
    saida = tmp_path / "foto.xlsx"
    node("excel", str(foto_json), str(saida))
    foto = json.loads(foto_json.read_text(encoding="utf-8"))
    wb = openpyxl.load_workbook(saida)
    guardados = openpyxl.load_workbook(saida, data_only=True)
    assert wb.sheetnames == ABAS_DO_EXCEL

    # todas as abas seguem o padrão: título na B1, subtítulo com a data da foto, sem grade
    dia = f"{foto['data'][8:10]}/{foto['data'][5:7]}/{foto['data'][:4]}"
    for ws in wb.worksheets:
        assert ws["B1"].value and dia in ws["B2"].value, ws.title
        assert ws.sheet_view.showGridLines is False, ws.title

    # observações: uma linha por registro, com filtro e cabeçalho congelado
    obs = wb["Observações"]
    registros = foto["registros"]
    cab = _linha_do_cabecalho(obs, "Fonte")
    assert obs.max_row == cab + len(registros)
    assert obs.freeze_panes == f"A{cab + 1}"
    assert obs.auto_filter.ref == f"B{cab}:H{cab + len(registros)}"
    for i in (0, 1, len(registros) // 2, len(registros) - 1):
        fonte, serie, dimensao, data, valor, unidade, _ = (c.value for c in obs[cab + 1 + i][1:8])
        r = registros[i]
        assert (fonte, serie, dimensao or "", unidade) == (
            r["fonte"],
            r["serie"],
            r["dimensao"],
            r["unidade"],
        )
        assert data.date().isoformat() == r["data_ref"] and valor == pytest.approx(r["valor"])

    # fórmulas: todas com valor guardado e sem erro; os nomes que elas usam existem
    formulas = [
        (ws.title, c.coordinate)
        for ws in wb.worksheets
        for linha in ws.iter_rows()
        for c in linha
        if c.data_type == "f"
    ]
    assert len(formulas) > 1000
    for aba, endereco in formulas:
        valor = guardados[aba][endereco].value
        assert valor is not None and not (isinstance(valor, str) and valor.startswith("#")), (aba, endereco)
    assert wb.defined_names["Spread"].attr_text.startswith("'Hoje'!$C$")
    assert wb.defined_names["ValorRef"].attr_text.startswith("'Hoje'!$C$")

    # as tabelas da aba Hoje saem iguais às que o robô grava na foto (valor de face e spread da foto)
    prazos = foto["derivados"]["parametros"]["prazos_meses"]
    linhas = [
        r
        for r in guardados["Hoje"].iter_rows(min_col=2, max_col=9)
        if r[0].value in prazos and isinstance(r[1].value, float)
    ]
    assert len(linhas) == 2 * len(prazos)
    esperadas = [linha[ch] for ch in ("nominal", "real") for linha in foto["derivados"]["valor_presente"]]
    for r, esperada in zip(linhas, esperadas, strict=True):
        assert r[1].value == pytest.approx(esperada["taxa_ancora"], abs=6e-5)
        assert r[5].value == pytest.approx(esperada["vp_demonstracao"], abs=0.006)

    # calculadoras: células de digitar com validação; Leia-me com um link por aba
    for nome in ("Cota cancelada", "Retorno da oferta", "Cota ativa"):
        assert len(wb[nome].data_validations.dataValidation) >= 3, nome
    links = [c.hyperlink for linha in wb["Leia-me"].iter_rows() for c in linha if c.hyperlink]
    assert sorted(l.location for l in links) == sorted(f"'{nome}'!A1" for nome in ABAS_DO_EXCEL[1:])

    fontes = wb["Fontes"]
    assert fontes.max_row == _linha_do_cabecalho(fontes, "Fonte") + len(foto["fontes"])


def test_toda_formula_aponta_para_celulas_que_existem_e_tem_numero(foto_json, tmp_path):
    """Sem o Excel por perto (CI), ao menos confere que cada faixa e cada nome usado por uma fórmula cai em
    células preenchidas com número: pega linha errada, aba errada e nome apontando para o lugar errado."""
    openpyxl = _openpyxl()
    from openpyxl.formula import Tokenizer
    from openpyxl.utils import range_boundaries

    saida = tmp_path / "foto.xlsx"
    node("excel", str(foto_json), str(saida))
    wb = openpyxl.load_workbook(saida)

    def celulas(referencia: str, aba_padrao: str):
        aba, _, faixa = referencia.rpartition("!")
        ws = wb[aba.strip("'").replace("''", "'")] if aba else wb[aba_padrao]
        c0, l0, c1, l1 = range_boundaries(faixa.replace("$", ""))
        return [ws.cell(row=linha, column=col) for linha in range(l0, l1 + 1) for col in range(c0, c1 + 1)]

    verificadas = 0
    for ws in wb.worksheets:
        for linha in ws.iter_rows():
            for c in linha:
                if c.data_type != "f":
                    continue
                for t in Tokenizer(c.value).items:
                    if not (t.type == "OPERAND" and t.subtype == "RANGE"):
                        continue
                    ref = wb.defined_names[t.value].attr_text if t.value in wb.defined_names else t.value
                    if "!" not in ref and ":" not in ref:
                        continue  # célula da própria aba (algumas, como o retorno-alvo, podem ficar em branco)
                    for alvo in celulas(ref, ws.title):
                        assert isinstance(alvo.value, (int, float)) or alvo.data_type == "f", (
                            ws.title,
                            c.coordinate,
                            ref,
                        )
                    verificadas += 1
    assert verificadas > 1000
