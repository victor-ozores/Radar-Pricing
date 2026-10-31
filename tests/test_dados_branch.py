"""A branch `data`: criada órfã, baixada nos dias seguintes, e foto publicada nunca muda.

Usa git de verdade, com um repositório "remoto" em pasta temporária (nada vai à internet).
"""

from __future__ import annotations

import subprocess
from datetime import date
from pathlib import Path

import pytest

from radar_pricing import __main__ as cli_principal
from radar_pricing import dados_branch
from radar_pricing.historico import carrega_anterior
from radar_pricing.http import Falha


def git(pasta: Path, *args: str) -> str:
    r = subprocess.run(
        ["git", *args], cwd=pasta, capture_output=True, text=True, encoding="utf-8", check=True
    )
    return r.stdout.strip()


def commit_inicial(repo: Path) -> None:
    (repo / "codigo.py").write_text("print(1)\n", encoding="utf-8")
    git(repo, "add", "codigo.py")
    git(repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "codigo")
    git(repo, "push", "-q", "origin", "HEAD:refs/heads/main")


@pytest.fixture
def remoto(tmp_path) -> Path:
    pasta = tmp_path / "remoto.git"
    git(tmp_path, "init", "-q", "--bare", str(pasta))
    return pasta


def clona(remoto: Path, tmp_path: Path, nome: str) -> Path:
    """Um 'servidor novo' do GitHub Actions: clone limpo do repositório."""
    repo = tmp_path / nome
    git(tmp_path, "clone", "-q", remoto.as_uri(), str(repo))
    return repo


@pytest.fixture
def repo(remoto, tmp_path) -> Path:
    r = clona(remoto, tmp_path, "dia1")
    commit_inicial(r)
    return r


def foto(repo: Path, dia: str, conteudo: str = "{}") -> None:
    (repo / "dados" / "fotos" / f"{dia}.json").write_text(conteudo, encoding="utf-8")
    (repo / "dados" / "fotos" / f"{dia}.csv").write_text("fonte,serie\n", encoding="utf-8")


def arquivos(remoto: Path, branch: str) -> set[str]:
    return set(git(remoto, "ls-tree", "-r", "--name-only", branch).splitlines())


def n_commits(remoto: Path, branch: str) -> int:
    return int(git(remoto, "rev-list", "--count", branch))


def test_primeira_vez_cria_a_branch_orfa_so_com_leiame_e_fotos(repo, remoto):
    assert "nova" in dados_branch.preparar(repo)
    assert not (repo / "dados" / "codigo.py").exists()  # a branch de dados não leva o código
    foto(repo, "2026-11-02")
    assert dados_branch.publicar(repo) == "publicado: foto de 2026-11-02"
    assert arquivos(remoto, "data") == {"README.md", "fotos/2026-11-02.json", "fotos/2026-11-02.csv"}
    assert arquivos(remoto, "main") == {"codigo.py"}  # a main não mudou
    assert n_commits(remoto, "data") == 1
    assert git(remoto, "log", "-1", "--format=%an", "data") == "Radar Pricing (robô)"
    assert git(remoto, "rev-list", "--max-parents=0", "data") == git(remoto, "rev-parse", "data")  # órfã


def test_no_dia_seguinte_baixa_a_branch_e_acrescenta_sem_mexer_na_foto_antiga(repo, remoto, tmp_path):
    dados_branch.preparar(repo)
    foto(repo, "2026-11-02", '{"dia":1}')
    dados_branch.publicar(repo)
    antes = git(remoto, "rev-parse", "data:fotos/2026-11-02.json")

    amanha = clona(remoto, tmp_path, "dia2")
    assert "existente" in dados_branch.preparar(amanha)
    anterior = carrega_anterior(amanha / "dados" / "fotos", date(2026, 11, 3))
    assert anterior == {"dia": 1}  # o robô enxerga a foto de ontem, que é o que `coletar` usa
    foto(amanha, "2026-11-03", '{"dia":2}')
    assert dados_branch.publicar(amanha) == "publicado: foto de 2026-11-03"
    assert n_commits(remoto, "data") == 2
    assert arquivos(remoto, "data") == {
        "README.md",
        "fotos/2026-11-02.json",
        "fotos/2026-11-02.csv",
        "fotos/2026-11-03.json",
        "fotos/2026-11-03.csv",
    }
    assert git(remoto, "rev-parse", "data:fotos/2026-11-02.json") == antes


def publicado_um_dia(repo, remoto, tmp_path) -> Path:
    dados_branch.preparar(repo)
    foto(repo, "2026-11-02", '{"dia":1}')
    dados_branch.publicar(repo)
    return clona(remoto, tmp_path, "dia2")


def test_sem_foto_nova_nao_cria_commit(repo, remoto, tmp_path):
    amanha = publicado_um_dia(repo, remoto, tmp_path)
    dados_branch.preparar(amanha)
    assert dados_branch.publicar(amanha) == "nada novo para publicar"
    assert n_commits(remoto, "data") == 1


def test_foto_publicada_nao_pode_ser_alterada(repo, remoto, tmp_path):
    amanha = publicado_um_dia(repo, remoto, tmp_path)
    dados_branch.preparar(amanha)
    foto(amanha, "2026-11-03")
    (amanha / "dados" / "fotos" / "2026-11-02.json").write_text('{"dia":"mexido"}', encoding="utf-8")
    with pytest.raises(Falha, match=r"2026-11-02\.json \(M\)"):
        dados_branch.publicar(amanha)
    assert n_commits(remoto, "data") == 1  # nada foi enviado, nem a foto nova
    assert git(amanha / "dados", "diff", "--cached", "--name-only") == ""  # e nada ficou preparado


def test_foto_publicada_nao_pode_ser_apagada(repo, remoto, tmp_path):
    amanha = publicado_um_dia(repo, remoto, tmp_path)
    dados_branch.preparar(amanha)
    (amanha / "dados" / "fotos" / "2026-11-02.csv").unlink()
    with pytest.raises(Falha, match=r"2026-11-02\.csv \(D\)"):
        dados_branch.publicar(amanha)
    assert n_commits(remoto, "data") == 1


def test_arquivo_que_nao_e_foto_e_recusado(repo, remoto):
    dados_branch.preparar(repo)
    foto(repo, "2026-11-02")
    (repo / "dados" / "fotos" / "rascunho.txt").write_text("x", encoding="utf-8")
    with pytest.raises(Falha, match=r"rascunho.txt"):
        dados_branch.publicar(repo)
    assert "data" not in git(remoto, "branch", "--list", "data")  # nem a branch foi criada


def test_preparar_recusa_pasta_que_ja_existe(repo):
    dados_branch.preparar(repo)
    with pytest.raises(Falha, match="já existe"):
        dados_branch.preparar(repo)


def test_publicar_sem_preparar_explica_o_que_fazer(repo):
    with pytest.raises(Falha, match="dados preparar"):
        dados_branch.publicar(repo)


def test_remoto_que_nao_responde_vira_falha_clara(repo):
    with pytest.raises(Falha, match="não consegui consultar o remoto"):
        dados_branch.preparar(repo, remoto="nao-existe")


def test_comando_dados_prepara_e_publica(repo, remoto, capsys):
    assert cli_principal.principal(["dados", "preparar", "--repo", str(repo)]) == 0
    foto(repo, "2026-11-02")
    assert cli_principal.principal(["dados", "publicar", "--repo", str(repo)]) == 0
    saida = capsys.readouterr().out
    assert "branch nova" in saida and "foto de 2026-11-02" in saida
    assert cli_principal.principal(["dados", "preparar", "--repo", str(repo)]) == 1  # a pasta já existe
    assert "ERRO" in capsys.readouterr().err
