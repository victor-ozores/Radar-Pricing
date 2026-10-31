"""IBGE SIDRA: IPCA mensal, para conferir o número do BCB."""

from __future__ import annotations

from datetime import date

from radar_pricing.http import Cliente, Falha
from radar_pricing.modelo import Registro, ResultadoFonte

from ._util import confere_idade, isolando, para_float

FONTE = "ibge"
URL = "https://servicodados.ibge.gov.br/api/v3/agregados/1737/periodos/-3/variaveis/63?localidades=N1[all]"


def coletar(cli: Cliente, hoje: date) -> ResultadoFonte:
    res = ResultadoFonte()
    with isolando(res, "IBGE IPCA"):
        dados = cli.json(URL)
        serie = dados[0]["resultados"][0]["series"][0]["serie"]
        if not serie:
            raise Falha("sem períodos")
        for periodo, valor in sorted(serie.items()):
            data = date(int(periodo[:4]), int(periodo[4:6]), 1)
            res.registros.append(
                Registro(
                    FONTE, "ibge_ipca_mensal", "IPCA, variação mensal (IBGE)", data, para_float(valor), "%"
                )
            )
        confere_idade(res, "ibge_ipca_mensal", max(r.data_ref for r in res.registros), hoje, 75)
    return res
