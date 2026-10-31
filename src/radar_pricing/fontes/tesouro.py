"""Tesouro Transparente: taxas dos títulos do Tesouro Direto (âncora pública de taxa de desconto)."""

from __future__ import annotations

import csv
import io
from datetime import date, timedelta

from radar_pricing.datas import parse_br
from radar_pricing.http import Cliente, Falha
from radar_pricing.modelo import Registro, ResultadoFonte

from ._util import confere_idade, isolando, para_float

FONTE = "tesouro"
CATALOGO = "https://www.tesourotransparente.gov.br/ckan/api/3/action/package_show?id=df56aa42-484a-4a59-8184-7676580c81e3"
CSV_RESERVA = (
    "https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/"
    "796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PrecoTaxaTesouroDireto.csv"
)
JANELA_DIAS = 35  # a última data base e os 35 dias anteriores (dá a variação em 1, 7 e 30 dias)
TITULOS = ("Tesouro Prefixado", "Tesouro IPCA+", "Tesouro Selic")  # os que servem de âncora de desconto
MAX_IDADE_DIAS = 6
MIN_LINHAS = 50_000  # o arquivo completo tem ~178 mil linhas; bem menos que isso é arquivo cortado


def _endereco_do_csv(cli: Cliente, res: ResultadoFonte) -> str:
    """O Tesouro já renomeou o arquivo: acha pelo catálogo e deixa o endereço fixo só como reserva."""
    try:
        recursos = cli.json(CATALOGO)["result"]["resources"]
        csvs = [
            r["url"]
            for r in recursos
            if r.get("format", "").upper() == "CSV" or r["url"].lower().endswith(".csv")
        ]
        preferido = next((u for u in csvs if "precotaxa" in u.lower()), csvs[0] if csvs else None)
        if preferido:
            return preferido
        res.avisos.append("catálogo do Tesouro sem recurso CSV: usado o endereço de reserva")
    except (Falha, KeyError, TypeError, IndexError) as e:
        res.avisos.append(f"catálogo do Tesouro falhou ({e}): usado o endereço de reserva")
    return CSV_RESERVA


def coletar(cli: Cliente, hoje: date) -> ResultadoFonte:
    res = ResultadoFonte()
    with isolando(res, "Tesouro Direto"):
        texto = cli.texto(_endereco_do_csv(cli, res), "latin-1")
        linhas = list(csv.DictReader(io.StringIO(texto), delimiter=";"))
        if len(linhas) < MIN_LINHAS:
            raise Falha(f"o CSV veio com só {len(linhas)} linhas")
        datas = {r["Data Base"] for r in linhas}
        ultima = max(parse_br(d) for d in datas)
        corte = ultima - timedelta(days=JANELA_DIAS)
        for r in linhas:
            data = parse_br(r["Data Base"])
            if (
                r["Tipo Titulo"] not in TITULOS
                or data <= corte
                or data > hoje
                or not r["Taxa Compra Manha"].strip()
            ):
                continue
            vencimento = parse_br(r["Data Vencimento"])
            res.registros.append(
                Registro(
                    FONTE,
                    "tesouro_taxa_compra",
                    "Tesouro Direto: taxa de compra (para o Tesouro Selic, é o spread sobre a Selic)",
                    data,
                    para_float(r["Taxa Compra Manha"]),
                    "% a.a.",
                    f"titulo={r['Tipo Titulo']}|vencimento={vencimento.isoformat()}",
                )
            )
        if not res.registros:
            raise Falha("nenhuma taxa na janela recente")
        confere_idade(res, "tesouro_taxa_compra", ultima, hoje, MAX_IDADE_DIAS)
    return res
