"""Os coletores. Cada um tem `coletar(cliente, hoje) -> ResultadoFonte` e um `FONTE` (nome no config)."""

from __future__ import annotations

from collections.abc import Callable
from datetime import date

from radar_pricing.http import Cliente
from radar_pricing.modelo import ResultadoFonte

from . import abac, bcb_focus, bcb_panorama, bcb_sgs, bcb_taxas, ibge, tesouro

Coletor = Callable[[Cliente, date], ResultadoFonte]

COLETORES: dict[str, Coletor] = {
    m.FONTE: m.coletar for m in (bcb_sgs, bcb_focus, bcb_taxas, bcb_panorama, tesouro, ibge, abac)
}
