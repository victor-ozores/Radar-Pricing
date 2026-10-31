"""Grava a foto do dia (JSON com o manifesto + CSV longo). Foto gravada não é reescrita."""

from __future__ import annotations

import csv
import io
import json
from pathlib import Path

from .http import Falha
from .modelo import Foto

COLUNAS_CSV = ("fonte", "serie", "dimensao", "data_ref", "valor", "unidade", "descricao")


def _escreve(caminho: Path, conteudo: str) -> None:
    tmp = caminho.with_suffix(caminho.suffix + ".tmp")
    tmp.write_text(conteudo, encoding="utf-8", newline="\n")
    tmp.replace(caminho)  # troca inteira: nunca fica arquivo pela metade


def grava(foto: Foto, pasta: Path, regravar: bool = False) -> tuple[Path, Path]:
    """Escreve `AAAA-MM-DD.json` e `.csv`. Recusa se já existem, salvo `regravar` (só em teste local)."""
    pasta.mkdir(parents=True, exist_ok=True)
    base = pasta / foto.data.isoformat()
    arquivo_json, arquivo_csv = base.with_suffix(".json"), base.with_suffix(".csv")
    if (arquivo_json.exists() or arquivo_csv.exists()) and not regravar:
        raise Falha(
            f"a foto de {foto.data.isoformat()} já existe e foto não se reescreve "
            "(use --regravar só em teste)"
        )
    _escreve(arquivo_json, json.dumps(foto.como_dict(), ensure_ascii=False, separators=(",", ":")))
    buffer = io.StringIO()
    escritor = csv.DictWriter(buffer, fieldnames=COLUNAS_CSV, lineterminator="\n")
    escritor.writeheader()
    for r in foto.registros:
        escritor.writerow(r.como_dict())
    _escreve(arquivo_csv, buffer.getvalue())
    return arquivo_json, arquivo_csv
