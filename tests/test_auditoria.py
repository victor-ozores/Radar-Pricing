"""A auditoria independente (scripts/audita_painel.py) sobre a foto de verdade de 31/10/2026.

O script refaz em Python, só com os registros brutos, as contas que o painel mostra e compara com o JavaScript.
Sem Node o teste é pulado, salvo no CI (EXIGE_NODE=1), onde faltar o Node é falha.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
FOTO = RAIZ / "site" / "tests" / "fixtures" / "foto-2026-10-31.json"


@pytest.fixture(autouse=True)
def _exige_node():
    if shutil.which("node") is None:
        if os.environ.get("EXIGE_NODE"):
            pytest.fail("Node não encontrado, mas EXIGE_NODE está ligado")
        pytest.skip("Node não instalado")


def _audita(foto: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(RAIZ / "scripts" / "audita_painel.py"), str(foto)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )


def test_todos_os_numeros_do_painel_batem_com_a_conta_independente():
    r = _audita(FOTO)
    assert r.returncode == 0, r.stdout + r.stderr
    conferidos = int(r.stdout.split()[0])
    assert conferidos > 500, r.stdout  # a auditoria não pode "passar" sem conferir nada
    assert "0 divergências" in r.stdout


def test_a_auditoria_pega_um_numero_errado(tmp_path):
    """Muda um valor da foto que o painel lê só pelos derivados: a auditoria, que vai aos registros, tem de apontar."""
    import json

    foto = json.loads(FOTO.read_text(encoding="utf-8"))
    for linha in foto["derivados"]["setor"]:
        if linha["descricao"] == "Cotas ativas - Total":
            linha["valor"] += 100
            linha["delta"] += 100
    adulterada = tmp_path / "foto.json"
    adulterada.write_text(json.dumps(foto), encoding="utf-8")
    r = _audita(adulterada)
    assert r.returncode == 1
    assert "DIVERGE" in r.stdout
