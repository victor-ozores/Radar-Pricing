"""Lê o config.toml."""

from __future__ import annotations

import tomllib
from dataclasses import dataclass, field
from pathlib import Path

PAPEIS = ("essencial", "complementar")


@dataclass(frozen=True)
class ParamsDerivados:
    valor_face: float = 1000.0
    prazos_meses: tuple[int, ...] = (6, 12, 24, 36, 48)
    spread_demonstracao_pp: float = 5.0  # DEMONSTRAÇÃO: não é de nenhuma empresa


@dataclass(frozen=True)
class ParamsMudancas:
    tesouro_pp_7d: float = 0.25  # Tesouro Prefixado e IPCA+: variação da taxa em 7 dias, em p.p.
    focus_selic_pp: float = 0.25  # Focus Selic, por ano, variação em 7 dias
    focus_ipca_pp: float = 0.20  # Focus IPCA, por ano, variação em 7 dias
    financiamento_pp: float = 1.0  # mediana dos bancos (imobiliário: mês; veículos: semana)
    max_por_regra: int = 3  # no máximo quantas linhas cada regra mostra


@dataclass(frozen=True)
class Limite:
    """Regra própria de uma fonte; o campo que ficar `None` usa o valor de `[geral]`."""

    tentativas: int | None = None
    timeout_s: int | None = None


@dataclass(frozen=True)
class Config:
    saida: Path
    tentativas: int
    timeout_s: int
    papeis: dict[str, str]  # fonte -> essencial | complementar
    derivados: ParamsDerivados = field(default_factory=ParamsDerivados)
    mudancas: ParamsMudancas = field(default_factory=ParamsMudancas)
    limites: dict[str, Limite] = field(default_factory=dict)  # fonte -> limites próprios


def carrega(caminho: Path) -> Config:
    dados = tomllib.loads(caminho.read_text(encoding="utf-8"))
    geral = dados["geral"]
    papeis = dict(dados["fontes"])
    ruins = {f: p for f, p in papeis.items() if p not in PAPEIS}
    if ruins:
        raise ValueError(f"papel inválido no config.toml (use {PAPEIS}): {ruins}")
    d = dados.get("derivados", {})
    padrao_d = ParamsDerivados()
    derivados = ParamsDerivados(
        valor_face=float(d.get("valor_face", padrao_d.valor_face)),
        prazos_meses=tuple(int(m) for m in d.get("prazos_meses", padrao_d.prazos_meses)),
        spread_demonstracao_pp=float(d.get("spread_demonstracao_pp", padrao_d.spread_demonstracao_pp)),
    )
    if not derivados.prazos_meses or any(m <= 0 for m in derivados.prazos_meses):
        raise ValueError("prazos_meses do config.toml precisa de meses positivos")
    m = dados.get("mudancas", {})
    padrao_m = ParamsMudancas()
    mudancas = ParamsMudancas(
        tesouro_pp_7d=float(m.get("tesouro_pp_7d", padrao_m.tesouro_pp_7d)),
        focus_selic_pp=float(m.get("focus_selic_pp", padrao_m.focus_selic_pp)),
        focus_ipca_pp=float(m.get("focus_ipca_pp", padrao_m.focus_ipca_pp)),
        financiamento_pp=float(m.get("financiamento_pp", padrao_m.financiamento_pp)),
        max_por_regra=int(m.get("max_por_regra", padrao_m.max_por_regra)),
    )
    return Config(
        saida=(caminho.parent / geral.get("saida", "data_local")),
        tentativas=int(geral.get("tentativas", 3)),
        timeout_s=int(geral.get("timeout_s", 90)),
        papeis=papeis,
        derivados=derivados,
        mudancas=mudancas,
        limites=_limites(dados.get("limites", {}), papeis),
    )


def _limites(tabela: dict, papeis: dict[str, str]) -> dict[str, Limite]:
    desconhecidas = sorted(set(tabela) - set(papeis))
    if desconhecidas:
        raise ValueError(f"[limites] do config.toml cita fonte que não está em [fontes]: {desconhecidas}")
    limites = {}
    for fonte, valores in tabela.items():
        limite = Limite(
            tentativas=int(valores["tentativas"]) if "tentativas" in valores else None,
            timeout_s=int(valores["timeout_s"]) if "timeout_s" in valores else None,
        )
        if any(v is not None and v <= 0 for v in (limite.tentativas, limite.timeout_s)):
            raise ValueError(f"[limites] de {fonte} no config.toml precisa de números positivos")
        limites[fonte] = limite
    return limites
