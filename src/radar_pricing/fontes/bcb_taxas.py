"""BCB taxas de juros: o que os bancos cobram em financiamento imobiliário (mensal) e de veículos (semanal).

É o custo do crédito concorrente: quem vende uma cota compara com o que pagaria num financiamento.
"""

from __future__ import annotations

from datetime import date

from radar_pricing.http import Cliente, Falha, codifica
from radar_pricing.modelo import Registro, ResultadoFonte

from ._util import confere_idade, isolando, para_float

FONTE = "bcb_taxas"
BASE = "https://olinda.bcb.gov.br/olinda/servico/taxaJuros/versao/v2/odata/"
MODALIDADE_IMOBILIARIO = "Financiamento imobiliário com taxas de mercado - Prefixado"
CODIGO_VEICULOS = "401101"  # Aquisição de veículos - Prefixado
MESES_GUARDADOS = 3
SEMANAS_GUARDADAS = 6


def _imobiliario(cli: Cliente, hoje: date, res: ResultadoFonte) -> None:
    consulta = {
        "$format": "json",
        "$top": "120",
        "$orderby": "anoMes desc,Posicao asc",
        "$filter": f"Modalidade eq '{MODALIDADE_IMOBILIARIO}'",
    }
    linhas = cli.json(BASE + "TaxasJurosMensalPorMes?" + codifica(consulta))["value"]
    meses = sorted({r["anoMes"] for r in linhas}, reverse=True)[:MESES_GUARDADOS]
    if not meses:
        raise Falha("sem linhas")
    novos = [
        Registro(
            FONTE,
            "taxa_financiamento_imobiliario",
            "Taxa de financiamento imobiliário (taxas de mercado, prefixado), por banco",
            date.fromisoformat(r["anoMes"] + "-01"),
            para_float(r["TaxaJurosAoAno"]),
            "% a.a.",
            f"banco={r['InstituicaoFinanceira']}",
        )
        for r in linhas
        if r["anoMes"] in meses
    ]
    res.registros += novos
    confere_idade(res, "taxa_financiamento_imobiliario", date.fromisoformat(meses[0] + "-01"), hoje, 75)


def _veiculos(cli: Cliente, hoje: date, res: ResultadoFonte) -> None:
    consulta = {
        "$format": "json",
        "$top": "320",
        "$orderby": "InicioPeriodo desc",
        "$filter": f"codigoModalidade eq '{CODIGO_VEICULOS}'",
    }
    linhas = cli.json(BASE + "ConsultaUnificada?" + codifica(consulta))["value"]
    semanas = sorted({r["InicioPeriodo"] for r in linhas}, reverse=True)[:SEMANAS_GUARDADAS]
    if not semanas:
        raise Falha("sem linhas")
    novos = [
        Registro(
            FONTE,
            "taxa_financiamento_veiculos",
            "Taxa de aquisição de veículos (prefixado), média da semana, por banco",
            date.fromisoformat(r["InicioPeriodo"]),
            para_float(r["TaxaJurosAoAno"]),
            "% a.a.",
            f"banco={r['InstituicaoFinanceira']}",
        )
        for r in linhas
        if r["InicioPeriodo"] in semanas
    ]
    res.registros += novos
    confere_idade(res, "taxa_financiamento_veiculos", date.fromisoformat(semanas[0]), hoje, 21)


def coletar(cli: Cliente, hoje: date) -> ResultadoFonte:
    res = ResultadoFonte()
    with isolando(res, "financiamento imobiliário"):
        _imobiliario(cli, hoje, res)
    with isolando(res, "financiamento de veículos"):
        _veiculos(cli, hoje, res)
    return res
