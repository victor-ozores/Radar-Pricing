"""A branch `data`: o histórico oficial das fotos, gravado pelo robô, separado do código da `main`.

O robô trabalha numa pasta (`dados/`) que é um `git worktree` da branch `data`: `preparar` a deixa pronta,
`coletar --saida dados/fotos` grava a foto de hoje nela e `publicar` envia. A branch nasce órfã, sem o
código da `main`.
Foto já publicada nunca é alterada nem apagada: se isso acontecer, `publicar` para antes de enviar.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

from .http import Falha

BRANCH = "data"
REMOTO = "origin"
AUTOR = ("Radar Pricing (robô)", "41898282+github-actions[bot]@users.noreply.github.com")
FOTO = re.compile(r"^fotos/(\d{4}-\d{2}-\d{2})\.(json|csv)$")

LEIAME = """# Dados do Radar Pricing

Esta branch guarda as **fotos diárias** das premissas públicas de mercado que o robô coleta
(`fotos/AAAA-MM-DD.json` com o manifesto de qualidade, os derivados e as mudanças do dia, e
`fotos/AAAA-MM-DD.csv` com as observações em formato longo). Quem grava aqui é o robô, uma vez por dia útil.

Foto publicada não se reescreve: se uma fonte corrigir um número, a correção aparece na foto do dia seguinte.
O código está na branch `main`: https://github.com/victor-ozores/Radar-Pricing
"""


def _git(pasta: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    r = subprocess.run(
        ["git", *args], cwd=pasta, capture_output=True, text=True, encoding="utf-8", check=False
    )
    if check and r.returncode != 0:
        raise Falha(f"git {' '.join(args)} falhou: {(r.stderr or r.stdout).strip()[:300]}")
    return r


def _existe_no_remoto(repo: Path, remoto: str, branch: str) -> bool:
    r = _git(repo, "ls-remote", "--exit-code", "--heads", remoto, branch, check=False)
    if r.returncode == 0:
        return True
    if r.returncode == 2:  # o git usa 2 para "o remoto respondeu, mas não tem essa branch"
        return False
    raise Falha(f"não consegui consultar o remoto {remoto}: {(r.stderr or r.stdout).strip()[:300]}")


def preparar(repo: Path, pasta: str = "dados", branch: str = BRANCH, remoto: str = REMOTO) -> str:
    """Cria `pasta` como worktree da branch `data` (baixando o que já existe ou criando a branch órfã)."""
    destino = repo / pasta
    if destino.exists():
        raise Falha(f"{destino} já existe; apague a pasta ou use outro nome")
    if _existe_no_remoto(repo, remoto, branch):
        _git(repo, "fetch", "--quiet", "--depth", "1", remoto, branch)
        _git(repo, "worktree", "add", "--quiet", "-B", branch, pasta, "FETCH_HEAD")
        resultado = "branch existente baixada"
    else:
        _git(repo, "worktree", "add", "--quiet", "--detach", pasta)
        _git(destino, "checkout", "--quiet", "--orphan", branch)
        _git(destino, "rm", "-rfq", "--ignore-unmatch", ".")
        (destino / "README.md").write_text(LEIAME, encoding="utf-8", newline="\n")
        resultado = "branch nova (órfã)"
    (destino / "fotos").mkdir(exist_ok=True)
    return resultado


def publicar(repo: Path, pasta: str = "dados", branch: str = BRANCH, remoto: str = REMOTO) -> str:
    """Commita e envia as fotos novas. Devolve o que fez; recusa alterar ou apagar foto já publicada."""
    destino = repo / pasta
    if not (destino / ".git").exists():
        raise Falha(f"{destino} não é um worktree; rode `dados preparar` antes")
    _git(destino, "add", "--all", ".")
    mudancas = [
        linha.split("\t", 1)
        for linha in _git(destino, "diff", "--cached", "--name-status", "--no-renames").stdout.splitlines()
    ]
    # só entra foto nova (nome AAAA-MM-DD.json/.csv) e o README; qualquer outra coisa é erro e nada é enviado
    proibidas = [
        f"{arq} ({estado})"
        for estado, arq in mudancas
        if not (FOTO.match(arq) and estado == "A") and not (arq == "README.md" and estado in ("A", "M"))
    ]
    if proibidas:
        _git(destino, "reset", "--quiet")
        lista = ", ".join(sorted(proibidas))
        raise Falha(f"só foto nova entra na branch de dados, e foto publicada não muda: {lista}")
    if not mudancas:
        return "nada novo para publicar"
    novos = sorted({m.group(1) for _, arq in mudancas if (m := FOTO.match(arq))})
    titulo = f"foto de {', '.join(novos)}" if novos else "cria a branch de dados"
    nome, email = AUTOR
    identidade = ["-c", f"user.name={nome}", "-c", f"user.email={email}", "-c", "commit.gpgsign=false"]
    _git(destino, *identidade, "commit", "--quiet", "-m", titulo)
    _git(destino, "push", "--quiet", remoto, f"HEAD:refs/heads/{branch}")
    return f"publicado: {titulo}"
