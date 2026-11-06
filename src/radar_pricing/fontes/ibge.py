"""IBGE: IPCA mensal, para conferir o número do BCB.

O IBGE tem dois endereços para a mesma série. O das "agregados" (`servicodados.ibge.gov.br`) não responde a
partir dos servidores do GitHub (tempo esgotado em todas as rodadas desde 30/10/2026); o da API SIDRA
(`apisidra.ibge.gov.br`) responde no meu computador com os mesmos números, e se responde na nuvem só uma
rodada mostra. Tento o SIDRA primeiro e, se ele não responder, o das agregados; cada um com uma tentativa só,
para o pior caso (os dois fora) custar 30 s e não os 42 s de antes. A fonte é complementar: nenhum número do
painel depende dela.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import date
from typing import Any

from radar_pricing.http import Cliente, Falha
from radar_pricing.modelo import Registro, ResultadoFonte

from ._util import confere_idade, isolando, para_float

FONTE = "ibge"
URL_SIDRA = "https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/63/p/last%203?formato=json"
URL_AGREGADOS = (
    "https://servicodados.ibge.gov.br/api/v3/agregados/1737/periodos/-3/variaveis/63?localidades=N1[all]"
)


def _serie_do_sidra(dados: Any) -> dict[str, Any]:
    """A lista do SIDRA: o 1º item é o cabeçalho; os outros trazem o período (D3C, AAAAMM) e o valor (V)."""
    return {linha["D3C"]: linha["V"] for linha in dados[1:]}


def _serie_das_agregados(dados: Any) -> dict[str, Any]:
    return dados[0]["resultados"][0]["series"][0]["serie"]


# (nome, endereço, como ler a resposta), na ordem em que são tentados
ENDERECOS: tuple[tuple[str, str, Callable[[Any], dict[str, Any]]], ...] = (
    ("SIDRA", URL_SIDRA, _serie_do_sidra),
    ("agregados", URL_AGREGADOS, _serie_das_agregados),
)


def _busca(cli: Cliente) -> tuple[dict[str, Any], str, list[str]]:
    """A série (período AAAAMM -> valor), de qual endereço veio e por que os anteriores não serviram."""
    motivos: list[str] = []
    for nome, url, le in ENDERECOS:
        try:
            serie = le(cli.json(url))
            if serie:
                return serie, nome, motivos
            motivos.append(f"{nome}: sem períodos")
        except (Falha, ValueError, KeyError, TypeError, IndexError) as e:
            motivos.append(f"{nome}: {e if isinstance(e, Falha) else f'{type(e).__name__}: {e}'}")
    raise Falha("; ".join(motivos))


def coletar(cli: Cliente, hoje: date) -> ResultadoFonte:
    res = ResultadoFonte()
    with isolando(res, "IBGE IPCA"):
        serie, endereco, motivos = _busca(cli)
        if motivos:
            res.avisos.append(
                f"IBGE: a série veio do endereço {endereco}; antes falhou: {'; '.join(motivos)}"
            )
        for periodo, valor in sorted(serie.items()):
            data = date(int(periodo[:4]), int(periodo[4:6]), 1)
            res.registros.append(
                Registro(
                    FONTE, "ibge_ipca_mensal", "IPCA, variação mensal (IBGE)", data, para_float(valor), "%"
                )
            )
        confere_idade(res, "ibge_ipca_mensal", max(r.data_ref for r in res.registros), hoje, 75)
    return res
