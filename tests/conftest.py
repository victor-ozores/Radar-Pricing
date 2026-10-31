"""Respostas reais gravadas em tests/fixtures (scripts/grava_amostras.py) e a data em que foram gravadas."""

from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path

import pytest

from radar_pricing.amostras import ClienteGravado
from radar_pricing.datas import BRT

PASTA = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="session")
def meta() -> dict:
    return json.loads((PASTA / "meta.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def hoje(meta) -> date:
    return date.fromisoformat(meta["hoje"])


@pytest.fixture(scope="session")
def agora(meta) -> datetime:
    return datetime.fromisoformat(meta["gravado_em"]).astimezone(BRT)


@pytest.fixture
def cli() -> ClienteGravado:
    return ClienteGravado(PASTA)
