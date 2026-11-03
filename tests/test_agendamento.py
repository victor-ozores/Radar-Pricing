"""O agendamento do robô: o horário principal e as reservas.

O GitHub atrasa os agendamentos (9 h 02 min em 02/11/2026, a primeira rodada agendada deste projeto), então há
duas reservas mais tarde; a primeira que começar coleta e as outras saem sem fazer nada. Isso só é seguro enquanto
a coleta usa `--pular-se-ja-existe`.
"""

from __future__ import annotations

import re
from pathlib import Path

FLUXO = Path(__file__).resolve().parent.parent / ".github" / "workflows" / "coleta-diaria.yml"


def _crons() -> list[tuple[int, int, str]]:
    achados = re.findall(
        r'^\s*- cron: "(\d+) (\d+) (\S+) (\S+) (\S+)"', FLUXO.read_text(encoding="utf-8"), re.M
    )
    return [(int(minuto), int(hora), dias) for minuto, hora, _, _, dias in achados]


def test_o_horario_principal_e_duas_reservas_mais_tarde():
    crons = _crons()
    assert crons[0] == (17, 13, "1-5")  # 10:17 em Brasília, o horário de sempre
    assert len(crons) == 3
    horas = [hora * 60 + minuto for minuto, hora, _ in crons]
    assert horas == sorted(horas) and len(set(horas)) == 3  # as reservas vêm depois do principal


def test_todos_os_horarios_sao_de_dia_util_e_fora_dos_minutos_de_pico():
    for minuto, _, dias in _crons():
        assert dias == "1-5"
        assert minuto not in (0, 15, 30, 45)  # o GitHub atrasa mais no começo da hora e nos quartos


def test_as_reservas_so_sao_seguras_porque_a_coleta_pula_o_dia_que_ja_existe():
    texto = FLUXO.read_text(encoding="utf-8")
    assert "coletar --saida dados/fotos --pular-se-ja-existe" in texto
