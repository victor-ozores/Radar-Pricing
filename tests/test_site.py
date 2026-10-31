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


# ------------------------------------------------------------------------------------------ excel
def test_excel_abre_no_openpyxl_com_os_numeros_da_foto(foto_json, tmp_path):
    openpyxl = _openpyxl()
    saida = tmp_path / "foto.xlsx"
    node("excel", str(foto_json), str(saida))
    foto = json.loads(foto_json.read_text(encoding="utf-8"))
    wb = openpyxl.load_workbook(saida)

    assert wb.sheetnames == [
        "Resumo", "Mudanças do dia", "Custo do dinheiro", "Crédito concorrente",
        "Setor", "Valor presente", "Fontes", "Observações",
    ]  # fmt: skip

    obs = wb["Observações"]
    registros = foto["registros"]
    assert obs.max_row == len(registros) + 1
    assert obs.freeze_panes == "A2" and obs.auto_filter.ref == f"A1:G{len(registros) + 1}"
    for i in (0, 1, len(registros) // 2, len(registros) - 1):
        fonte, serie, dimensao, data, valor, unidade, _ = (c.value for c in obs[i + 2])
        r = registros[i]
        assert (fonte, serie, dimensao or "", unidade) == (
            r["fonte"],
            r["serie"],
            r["dimensao"],
            r["unidade"],
        )
        assert data.date().isoformat() == r["data_ref"] and valor == pytest.approx(r["valor"])

    resumo = {linha[0].value: linha for linha in wb["Resumo"].iter_rows(min_row=9)}
    selic = next(v for v in foto["derivados"]["variacoes"] if v["serie"] == "selic_meta")
    assert resumo["Meta Selic"][1].value == pytest.approx(selic["valor"])
    assert resumo["Meta Selic"][3].value.date().isoformat() == selic["data"]

    vp = wb["Valor presente"]
    valores = [c.value for linha in vp.iter_rows(min_row=9) for c in linha if isinstance(c.value, float)]
    esperados = [
        v[chave]
        for linha in foto["derivados"]["valor_presente"]
        for ch in ("nominal", "real")
        if (v := linha[ch])
        for chave in ("taxa_ancora", "taxa_demonstracao", "vp_ancora", "vp_demonstracao")
    ]
    assert valores == pytest.approx(esperados)

    fontes = wb["Fontes"]
    assert fontes.max_row == len(foto["fontes"]) + 1
