"""Datas: horário de Brasília (sem horário de verão desde 2019: um deslocamento fixo basta) e conversões."""

from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta, timezone

BRT = timezone(timedelta(hours=-3))

MESES = {
    "janeiro": 1,
    "fevereiro": 2,
    "março": 3,
    "marco": 3,
    "abril": 4,
    "maio": 5,
    "junho": 6,
    "julho": 7,
    "agosto": 8,
    "setembro": 9,
    "outubro": 10,
    "novembro": 11,
    "dezembro": 12,
}


def agora_brt() -> datetime:
    return datetime.now(BRT).replace(microsecond=0)


def parse_br(texto: str) -> date:
    """'30/10/2026' -> date."""
    return datetime.strptime(texto.strip(), "%d/%m/%Y").date()


def fim_do_mes(ano: int, mes: int) -> date:
    return date(ano, mes, calendar.monthrange(ano, mes)[1])


def fim_do_trimestre(base: str) -> date:
    """'202606' -> 30/06/2026."""
    return fim_do_mes(int(base[:4]), int(base[4:]))


def trimestres_para_tras(hoje: date, n: int) -> list[str]:
    """Os `n` últimos fins de trimestre (AAAAMM) até hoje, do mais novo para o mais velho."""
    ano, mes = hoje.year, (hoje.month // 3) * 3
    if mes == 0:
        ano, mes = ano - 1, 12
    saida = []
    for _ in range(n):
        saida.append(f"{ano}{mes:02d}")
        mes -= 3
        if mes == 0:
            ano, mes = ano - 1, 12
    return saida
