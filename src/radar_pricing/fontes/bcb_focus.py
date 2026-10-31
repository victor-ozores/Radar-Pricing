"""BCB Focus: mediana das expectativas do mercado para Selic e IPCA (por ano) e Selic por reunião do Copom."""

from __future__ import annotations

from datetime import date, timedelta

from radar_pricing.http import Cliente, Falha, codifica
from radar_pricing.modelo import Registro, ResultadoFonte

from ._util import confere_idade, isolando, para_float

FONTE = "bcb_focus"
BASE = "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/"
# A API do Focus traz UMA LINHA POR DIA ÚTIL (a atualização é semanal, mas o histórico é diário):
# guardar 35 dias corridos dá a variação em 1, 7 e 30 dias.
JANELA_DIAS = 35
MAX_IDADE_DIAS = 10


def _anuais(cli: Cliente, indicador: str, hoje: date, res: ResultadoFonte) -> None:
    consulta = {
        "$format": "json",
        "$top": "500",
        "$orderby": "Data desc",
        "$filter": f"Indicador eq '{indicador}' and baseCalculo eq 0",
    }
    linhas = cli.json(BASE + "ExpectativasMercadoAnuais?" + codifica(consulta))["value"]
    anos = {str(hoje.year + k) for k in range(4)}
    todas = sorted({r["Data"] for r in linhas}, reverse=True)
    if not todas:
        raise Falha("sem linhas")
    corte = date.fromisoformat(todas[0]) - timedelta(days=JANELA_DIAS)
    datas = [d for d in todas if date.fromisoformat(d) >= corte]
    serie = f"focus_{indicador.lower()}_anual"
    descricao = f"Focus: mediana da expectativa de {indicador} para o ano"
    achados = 0
    for r in linhas:
        if r["Data"] in datas and r["DataReferencia"] in anos:
            res.registros.append(
                Registro(
                    FONTE,
                    serie,
                    descricao,
                    date.fromisoformat(r["Data"]),
                    para_float(r["Mediana"]),
                    "% a.a.",
                    f"ano={r['DataReferencia']}",
                )
            )
            achados += 1
    if not achados:
        raise Falha(f"nenhum dos anos {sorted(anos)} nas edições recentes")
    confere_idade(res, serie, date.fromisoformat(datas[0]), hoje, MAX_IDADE_DIAS)


def _selic_por_reuniao(cli: Cliente, hoje: date, res: ResultadoFonte) -> None:
    consulta = {"$format": "json", "$top": "300", "$orderby": "Data desc", "$filter": "baseCalculo eq 0"}
    linhas = cli.json(BASE + "ExpectativasMercadoSelic?" + codifica(consulta))["value"]
    if not linhas:
        raise Falha("sem linhas")
    ultima = max(r["Data"] for r in linhas)
    for r in linhas:
        if r["Data"] == ultima:
            res.registros.append(
                Registro(
                    FONTE,
                    "focus_selic_reuniao",
                    "Focus: mediana da Selic esperada ao fim de cada reunião do Copom",
                    date.fromisoformat(ultima),
                    para_float(r["Mediana"]),
                    "% a.a.",
                    f"reuniao={r['Reuniao']}",
                )
            )
    confere_idade(res, "focus_selic_reuniao", date.fromisoformat(ultima), hoje, MAX_IDADE_DIAS)


def coletar(cli: Cliente, hoje: date) -> ResultadoFonte:
    res = ResultadoFonte()
    for indicador in ("Selic", "IPCA"):
        with isolando(res, f"Focus anual {indicador}"):
            _anuais(cli, indicador, hoje, res)
    with isolando(res, "Focus Selic por reunião"):
        _selic_por_reuniao(cli, hoje, res)
    return res
