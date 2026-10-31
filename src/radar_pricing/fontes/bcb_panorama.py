"""BCB Panorama de Consórcios: 125 métricas do setor por segmento (trimestral, com ~4 meses de defasagem)."""

from __future__ import annotations

from datetime import date

from radar_pricing.datas import fim_do_trimestre, trimestres_para_tras
from radar_pricing.http import Cliente, Falha
from radar_pricing.modelo import Registro, ResultadoFonte

from ._util import confere_idade, isolando, para_float

FONTE = "bcb_panorama"
URL = (
    "https://olinda.bcb.gov.br/olinda/servico/PANORAMA_DE_CONSORCIOS/versao/v1/odata/"
    "Metricas(DataBase=@DataBase)?@DataBase={base}&$format=json&$top=2000"
)
MIN_METRICAS = 100  # o BCB cadastra 125; bem menos que isso indica trimestre incompleto
MAX_IDADE_DIAS = 200  # a defasagem normal é de ~124 dias


def _metricas(cli: Cliente, base: str) -> list[dict]:
    return cli.json(URL.format(base=base))["value"]


def coletar(cli: Cliente, hoje: date) -> ResultadoFonte:
    res = ResultadoFonte()
    with isolando(res, "Panorama de Consórcios"):
        encontrados: list[tuple[str, list[dict]]] = []
        for base in trimestres_para_tras(hoje, 8):  # o trimestre mais novo costuma estar vazio
            linhas = _metricas(cli, base)
            if linhas:
                encontrados.append((base, linhas))
            if len(encontrados) == 2:  # o mais novo e o anterior
                break
        if not encontrados:
            raise Falha("nenhum dos últimos 8 trimestres tem dados")
        for base, linhas in encontrados:
            if len(linhas) < MIN_METRICAS:
                res.avisos.append(f"trimestre {base} veio com só {len(linhas)} métricas")
            fim = fim_do_trimestre(base)
            for r in linhas:
                res.registros.append(
                    Registro(
                        FONTE,
                        f"panorama_{r['IdMetrica']}",
                        r["Metrica"].strip(),
                        fim,
                        para_float(r["Valor"]),
                        r["Unidade"],
                        f"grupo={r['Grupo']}",
                    )
                )
        confere_idade(res, "panorama", fim_do_trimestre(encontrados[0][0]), hoje, MAX_IDADE_DIAS)
        res.extras["trimestre_mais_novo"] = encontrados[0][0]
    return res
