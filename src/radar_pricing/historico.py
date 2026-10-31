"""A foto anterior: base para saber o que é novidade (novo trimestre do BCB, novo boletim da ABAC) e para
descobrir se uma fonte REVISOU um número que já tinha publicado."""

from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path
from typing import Any

from .modelo import Registro

NOME_DA_FOTO = re.compile(r"^\d{4}-\d{2}-\d{2}\.json$")


def carrega_anterior(pasta: Path, hoje: date) -> dict[str, Any] | None:
    """A foto gravada mais recente com data ANTERIOR a `hoje`, ou None se ainda não há."""
    if not pasta.exists():
        return None
    candidatas = sorted(
        p for p in pasta.iterdir() if NOME_DA_FOTO.match(p.name) and p.stem < hoje.isoformat()
    )
    if not candidatas:
        return None
    return json.loads(candidatas[-1].read_text(encoding="utf-8"))


def revisoes(registros: list[Registro], anterior: dict[str, Any]) -> list[dict[str, Any]]:
    """Observações que já estavam na foto anterior e agora têm outro valor (a fonte corrigiu o número)."""
    antes = {
        (r["fonte"], r["serie"], r["dimensao"], r["data_ref"]): r["valor"] for r in anterior["registros"]
    }
    saida = []
    for r in registros:
        chave = (r.fonte, r.serie, r.dimensao, r.data_ref.isoformat())
        if chave in antes and abs(antes[chave] - r.valor) > 1e-9:
            saida.append(
                {
                    "serie": r.serie,
                    "dimensao": r.dimensao,
                    "descricao": r.descricao,
                    "unidade": r.unidade,
                    "data_ref": r.data_ref.isoformat(),
                    "antes": antes[chave],
                    "depois": r.valor,
                }
            )
    return saida
