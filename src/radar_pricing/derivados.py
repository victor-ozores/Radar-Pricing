"""Contas em cima das observações da foto: variações, âncoras de desconto e valor presente.

Tudo aqui é aritmética pública e transparente. O spread de risco é de DEMONSTRAÇÃO (vem do config.toml);
nenhum número de empresa entra nestas contas.
"""

from __future__ import annotations

import statistics
from collections import defaultdict
from datetime import date, timedelta
from itertools import pairwise
from typing import Any

from .config import ParamsDerivados
from .modelo import Registro

DIAS_UTEIS_NO_ANO = 252
OLHADAS = (1, 7, 30)  # variação em 1, 7 e 30 dias
DIAS_NO_ANO = 365.25  # só para medir o prazo de um título (eixo da interpolação), não para descontar

Obs = list[tuple[date, float]]


# --------------------------------------------------------------------------------------------- variações
def tolerancia(dias: int) -> int:
    """Quanto a observação de referência pode estar mais longe que o pedido (fim de semana, feriado, série
    semanal ou mensal). Uma série mensal não vira "variação em 7 dias": a referência fica a 31 dias."""
    return max(4, dias // 2)


def variacoes_de(obs: Obs, olhadas: tuple[int, ...] = OLHADAS) -> dict[str, dict[str, Any] | None]:
    """Para cada olhada (1, 7, 30 dias), a observação mais nova que tenha pelo menos esse tempo, se existir
    dentro da tolerância. `None` quer dizer "sem histórico para essa janela", nunca um número inventado."""
    ultima_data, ultimo = obs[-1]
    saida: dict[str, dict[str, Any] | None] = {}
    for dias in olhadas:
        alvo = ultima_data - timedelta(days=dias)
        ref = next(((d, v) for d, v in reversed(obs) if d <= alvo), None)
        if ref is None or (ultima_data - ref[0]).days > dias + tolerancia(dias):
            saida[str(dias)] = None
            continue
        saida[str(dias)] = {
            "ref_data": ref[0].isoformat(),
            "dias": (ultima_data - ref[0]).days,
            "valor_ref": ref[1],
            "delta": round(ultimo - ref[1], 6),
        }
    return saida


def agrupa(registros: list[Registro]) -> dict[tuple[str, str, str], Obs]:
    grupos: dict[tuple[str, str, str], Obs] = defaultdict(list)
    for r in registros:
        grupos[(r.fonte, r.serie, r.dimensao)].append((r.data_ref, r.valor))
    return {k: sorted(v) for k, v in grupos.items()}


def medianas_por_data(registros: list[Registro], serie: str) -> tuple[Obs, int]:
    """Mediana entre os bancos em cada data e o nº de bancos da data mais nova."""
    por_data: dict[date, list[float]] = defaultdict(list)
    for r in registros:
        if r.serie == serie:
            por_data[r.data_ref].append(r.valor)
    obs = sorted((d, round(statistics.median(vs), 6)) for d, vs in por_data.items())
    return obs, len(por_data[obs[-1][0]]) if obs else 0


MEDIANAS = (
    ("mediana_taxa_financiamento_imobiliario", "taxa_financiamento_imobiliario",
     "Financiamento imobiliário: mediana das taxas dos bancos"),
    ("mediana_taxa_financiamento_veiculos", "taxa_financiamento_veiculos",
     "Financiamento de veículos: mediana das taxas dos bancos"),
)  # fmt: skip


def monta_variacoes(registros: list[Registro]) -> list[dict[str, Any]]:
    """Variações das séries de manchete: SGS, Focus por ano, títulos do Tesouro e a mediana dos bancos."""
    unidades = {(r.fonte, r.serie): (r.descricao, r.unidade) for r in registros}
    saida = []
    for (fonte, serie, dimensao), obs in sorted(agrupa(registros).items()):
        if fonte in ("bcb_sgs", "tesouro") or serie in ("focus_selic_anual", "focus_ipca_anual"):
            descricao, unidade = unidades[(fonte, serie)]
            saida.append(_entrada(fonte, serie, dimensao, descricao, unidade, obs))
    for nome, origem, descricao in MEDIANAS:
        obs, n_bancos = medianas_por_data(registros, origem)
        if obs:
            entrada = _entrada("bcb_taxas", nome, "", descricao, "% a.a.", obs)
            entrada["n_bancos"] = n_bancos
            saida.append(entrada)
    return saida


def _entrada(fonte: str, serie: str, dimensao: str, descricao: str, unidade: str, obs: Obs) -> dict[str, Any]:
    return {
        "fonte": fonte,
        "serie": serie,
        "dimensao": dimensao,
        "descricao": descricao,
        "unidade": unidade,
        "data": obs[-1][0].isoformat(),
        "valor": obs[-1][1],
        "variacoes": variacoes_de(obs),
    }


def monta_setor(registros: list[Registro]) -> list[dict[str, Any]]:
    """Panorama de Consórcios: cada métrica contra o trimestre anterior."""
    saida = []
    for (fonte, serie, dimensao), obs in sorted(agrupa(registros).items()):
        if fonte != "bcb_panorama" or len(obs) < 2:
            continue
        (d0, v0), (d1, v1) = obs[-2], obs[-1]
        descricao, unidade = next((r.descricao, r.unidade) for r in registros if r.serie == serie)
        saida.append(
            {
                "serie": serie,
                "grupo": dimensao.removeprefix("grupo="),
                "descricao": descricao,
                "unidade": unidade,
                "data": d1.isoformat(),
                "valor": v1,
                "data_anterior": d0.isoformat(),
                "anterior": v0,
                "delta": round(v1 - v0, 6),
            }
        )
    return saida


# --------------------------------------------------------------------------------------------- âncoras
def cdi_anualizado(cdi_diario_pct: float) -> float:
    """Taxa efetiva ao ano (base 252 dias úteis) a partir do CDI diário em %."""
    return ((1 + cdi_diario_pct / 100) ** DIAS_UTEIS_NO_ANO - 1) * 100


def monta_curva(registros: list[Registro], titulo: str) -> dict[str, Any] | None:
    """Pontos (vencimento, prazo em anos, taxa de compra) de um título do Tesouro, na data base mais nova."""
    pontos = [
        r
        for r in registros
        if r.serie == "tesouro_taxa_compra" and r.dimensao.startswith(f"titulo={titulo}|")
    ]
    if not pontos:
        return None
    base = max(r.data_ref for r in pontos)
    saida = []
    for r in sorted((r for r in pontos if r.data_ref == base), key=lambda r: r.dimensao):
        vencimento = date.fromisoformat(r.dimensao.split("vencimento=")[1])
        anos = (vencimento - base).days / DIAS_NO_ANO
        if anos > 0:
            saida.append({"vencimento": vencimento.isoformat(), "anos": anos, "taxa": r.valor})
    saida.sort(key=lambda p: p["anos"])
    return {"titulo": titulo, "base": base.isoformat(), "pontos": saida} if saida else None


def interpola(pontos: list[dict[str, Any]], anos: float) -> tuple[float, bool]:
    """Taxa para o prazo `anos` por interpolação linear entre os dois vencimentos vizinhos. Fora da curva
    usa a taxa da ponta mais próxima e avisa que extrapolou (`True`)."""
    if anos <= pontos[0]["anos"]:
        return pontos[0]["taxa"], anos < pontos[0]["anos"]
    if anos >= pontos[-1]["anos"]:
        return pontos[-1]["taxa"], anos > pontos[-1]["anos"]
    for a, b in pairwise(pontos):
        if a["anos"] <= anos <= b["anos"]:
            peso = (anos - a["anos"]) / (b["anos"] - a["anos"])
            return a["taxa"] + peso * (b["taxa"] - a["taxa"]), False
    raise AssertionError("prazo dentro da curva sem par de vencimentos vizinhos")  # pragma: no cover


def valor_presente(valor: float, taxa_pct: float, meses: int) -> float:
    """Valor de hoje de `valor` recebido daqui a `meses`, taxa efetiva ao ano, capitalização composta
    (1 mês = 1/12 de ano, o mesmo que 21 dias úteis na base 252)."""
    return valor / (1 + taxa_pct / 100) ** (meses / 12)


def monta_tabela(
    curva_nominal: dict[str, Any] | None, curva_real: dict[str, Any] | None, p: ParamsDerivados
) -> list[dict[str, Any]]:
    """Valor presente de `valor_face` recebido em cada prazo: (a) em R$ fixos, descontado pela curva de
    Prefixados; (b) corrigido pelo IPCA, em reais de hoje, descontado pela curva de IPCA+. Cada um na taxa da
    âncora e na taxa de demonstração (âncora + spread)."""
    linhas = []
    for meses in p.prazos_meses:
        linha: dict[str, Any] = {"meses": meses, "anos": round(meses / 12, 4)}
        for chave, curva in (("nominal", curva_nominal), ("real", curva_real)):
            if curva is None:
                linha[chave] = None
                continue
            taxa, extrapolado = interpola(curva["pontos"], meses / 12)
            demo = taxa + p.spread_demonstracao_pp
            linha[chave] = {
                "taxa_ancora": round(taxa, 4),
                "taxa_demonstracao": round(demo, 4),
                "vp_ancora": round(valor_presente(p.valor_face, taxa, meses), 2),
                "vp_demonstracao": round(valor_presente(p.valor_face, demo, meses), 2),
                "extrapolado": extrapolado,
            }
        linhas.append(linha)
    return linhas


def calcula(registros: list[Registro], p: ParamsDerivados) -> dict[str, Any]:
    """Tudo que a foto guarda além das observações brutas."""
    avisos: list[str] = []
    curva_nominal = monta_curva(registros, "Tesouro Prefixado")
    curva_real = monta_curva(registros, "Tesouro IPCA+")
    if curva_nominal is None:
        avisos.append("sem a curva do Tesouro Prefixado: valor presente em R$ fixos não calculado")
    if curva_real is None:
        avisos.append("sem a curva do Tesouro IPCA+: valor presente corrigido pelo IPCA não calculado")
    cdi = sorted((r.data_ref, r.valor) for r in registros if r.serie == "cdi")
    ancoras: dict[str, Any] = {
        "curva_nominal": curva_nominal,
        "curva_real": curva_real,
        "cdi_anualizado": None,
    }
    if cdi:
        ancoras["cdi_anualizado"] = {
            "data": cdi[-1][0].isoformat(),
            "taxa": round(cdi_anualizado(cdi[-1][1]), 4),
            "formula": "((1 + CDI diário/100)^252 - 1) * 100",
        }
    return {
        "parametros": {
            "valor_face": p.valor_face,
            "prazos_meses": list(p.prazos_meses),
            "spread_demonstracao_pp": p.spread_demonstracao_pp,
            "aviso": "o spread é de DEMONSTRAÇÃO: não é de nenhuma empresa nem recomendação de preço",
            "convencao": (
                "taxa efetiva ao ano; capitalização composta; 1 mês = 1/12 de ano (21 dias úteis na base 252)"
            ),
        },
        "ancoras": ancoras,
        "valor_presente": monta_tabela(curva_nominal, curva_real, p),
        "variacoes": monta_variacoes(registros),
        "setor": monta_setor(registros),
        "avisos": avisos,
    }
