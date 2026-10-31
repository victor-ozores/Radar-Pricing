"""Peças comuns dos coletores."""

from __future__ import annotations

import math
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date

from radar_pricing.http import Falha
from radar_pricing.modelo import ResultadoFonte


def para_float(valor: object) -> float:
    """'4.58' ou '7,76' -> 4.58 e 7.76. Recusa vazio, NaN e infinito."""
    texto = str(valor).strip().replace(",", ".")
    if not texto:
        raise Falha("valor vazio")
    numero = float(texto)
    if not math.isfinite(numero):
        raise Falha(f"valor inválido: {valor!r}")
    return numero


@contextmanager
def isolando(res: ResultadoFonte, nome: str) -> Iterator[None]:
    """Uma série que falha não derruba as outras da mesma fonte: o motivo vai para `falhas`."""
    try:
        yield
    except (Falha, ValueError, KeyError, TypeError, IndexError) as e:
        motivo = str(e) if isinstance(e, Falha) else f"{type(e).__name__}: {e}"
        res.falhas.append(f"{nome}: {motivo}")


def confere_idade(res: ResultadoFonte, nome: str, ultimo: date, hoje: date, max_dias: int) -> None:
    idade = (hoje - ultimo).days
    if idade > max_dias:
        res.atrasos.append(
            f"{nome}: dado mais novo é de {ultimo.isoformat()} ({idade} dias; aceita até {max_dias})"
        )
