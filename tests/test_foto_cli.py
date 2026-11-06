"""Gravação da foto do dia (imutável), configuração, datas e a linha de comando."""

from __future__ import annotations

import csv
import json
from datetime import date
from pathlib import Path

import pytest

from radar_pricing import __main__ as cli_principal
from radar_pricing import config, datas
from radar_pricing.amostras import ClienteGravado
from radar_pricing.coleta import coletar_tudo
from radar_pricing.foto import COLUNAS_CSV, grava
from radar_pricing.http import Falha

RAIZ = Path(__file__).resolve().parent.parent
PASTA = Path(__file__).parent / "fixtures"


@pytest.fixture(autouse=True)
def _amostra_pequena(monkeypatch):
    from radar_pricing.fontes import tesouro

    monkeypatch.setattr(tesouro, "MIN_LINHAS", 100)


@pytest.fixture
def foto(cli, hoje, agora):
    return coletar_tudo(cli, hoje, agora, config.carrega(RAIZ / "config.toml").papeis)


# ------------------------------------------------------------------------------------------------ foto
def test_grava_json_e_csv_com_o_mesmo_conteudo(foto, tmp_path):
    arquivo_json, arquivo_csv = grava(foto, tmp_path)
    assert arquivo_json.name == f"{foto.data.isoformat()}.json" and arquivo_csv.suffix == ".csv"
    dados = json.loads(arquivo_json.read_text(encoding="utf-8"))
    assert dados["versao"] == 1 and dados["status"] == foto.status and len(dados["fontes"]) == 7
    assert len(dados["registros"]) == len(foto.registros)
    with arquivo_csv.open(encoding="utf-8", newline="") as f:
        linhas = list(csv.DictReader(f))
    assert tuple(linhas[0].keys()) == COLUNAS_CSV and len(linhas) == len(foto.registros)
    assert {l["fonte"] for l in linhas} == {f.id for f in foto.fontes}
    assert not list(tmp_path.glob("*.tmp"))  # nada pela metade


def test_foto_gravada_nao_e_reescrita(foto, tmp_path):
    grava(foto, tmp_path)
    antes = (tmp_path / f"{foto.data.isoformat()}.json").read_bytes()
    with pytest.raises(Falha, match="já existe"):
        grava(foto, tmp_path)
    assert (tmp_path / f"{foto.data.isoformat()}.json").read_bytes() == antes
    grava(foto, tmp_path, regravar=True)  # só com o pedido explícito (teste local)


def test_acentos_sobrevivem_ao_json(foto, tmp_path):
    arquivo_json, _ = grava(foto, tmp_path)
    texto = arquivo_json.read_text(encoding="utf-8")
    assert "Índice de Exclusão" in texto and "\\u00cd" not in texto


# ------------------------------------------------------------------------------------------------ config e datas
def test_config_real_tem_os_sete_papeis_e_a_saida_dentro_do_projeto():
    cfg = config.carrega(RAIZ / "config.toml")
    assert set(cfg.papeis.values()) == {"essencial", "complementar"} and len(cfg.papeis) == 7
    assert cfg.saida == RAIZ / "data_local" and cfg.tentativas == 3


def test_config_com_papel_invalido_e_recusada(tmp_path):
    arquivo = tmp_path / "config.toml"
    arquivo.write_text('[geral]\n[fontes]\nbcb_sgs = "talvez"\n', encoding="utf-8")
    with pytest.raises(ValueError, match="papel inválido"):
        config.carrega(arquivo)


def test_config_real_da_ao_ibge_um_limite_curto():
    cfg = config.carrega(RAIZ / "config.toml")
    assert cfg.limites == {"ibge": config.Limite(tentativas=1, timeout_s=15)}


def test_limite_parcial_deixa_o_outro_campo_para_o_padrao(tmp_path):
    arquivo = tmp_path / "config.toml"
    arquivo.write_text(
        '[geral]\n[fontes]\nibge = "complementar"\n[limites]\nibge = { timeout_s = 5 }\n', "utf-8"
    )
    assert config.carrega(arquivo).limites == {"ibge": config.Limite(tentativas=None, timeout_s=5)}


@pytest.mark.parametrize(
    ("limites", "erro"),
    [
        ("outra = { timeout_s = 5 }", "não está em \\[fontes\\]"),
        ("ibge = { timeout_s = 0 }", "números positivos"),
        ("ibge = { tentativas = -1 }", "números positivos"),
    ],
)
def test_limite_invalido_e_recusado(tmp_path, limites, erro):
    arquivo = tmp_path / "config.toml"
    arquivo.write_text(f'[geral]\n[fontes]\nibge = "complementar"\n[limites]\n{limites}\n', encoding="utf-8")
    with pytest.raises(ValueError, match=erro):
        config.carrega(arquivo)


def test_trimestres_para_tras():
    assert datas.trimestres_para_tras(date(2026, 10, 30), 3) == ["202609", "202606", "202603"]
    assert datas.trimestres_para_tras(date(2026, 2, 10), 3) == ["202512", "202509", "202506"]
    assert datas.trimestres_para_tras(date(2026, 3, 1), 1) == ["202603"]


def test_datas_basicas():
    assert datas.parse_br("30/10/2026") == date(2026, 10, 30)
    assert datas.fim_do_trimestre("202606") == date(2026, 6, 30)
    assert datas.fim_do_mes(2028, 2) == date(2028, 2, 29)
    assert datas.agora_brt().utcoffset().total_seconds() == -3 * 3600


# ------------------------------------------------------------------------------------------------ linha de comando
@pytest.fixture
def principal_com_amostras(monkeypatch, agora):
    monkeypatch.setattr(cli_principal, "Cliente", lambda **kw: ClienteGravado(PASTA))
    monkeypatch.setattr(cli_principal, "agora_brt", lambda: agora)
    return cli_principal.principal


def test_comando_coletar_grava_e_a_segunda_vez_recusa(principal_com_amostras, tmp_path, capsys, hoje):
    argumentos = ["coletar", "--config", str(RAIZ / "config.toml"), "--saida", str(tmp_path)]
    assert principal_com_amostras(argumentos) == 0
    saida = capsys.readouterr().out
    assert "Status do dia: OK" in saida and "Foto gravada em" in saida
    assert (tmp_path / f"{hoje.isoformat()}.json").exists()
    assert principal_com_amostras(argumentos) == 1  # a foto do dia já existe
    assert "já existe" in capsys.readouterr().err


def test_comando_passa_os_limites_do_config_para_a_coleta(monkeypatch, agora):
    pedidos = []

    class Anota(ClienteGravado):
        def com_limites(self, tentativas=None, timeout_s=None):
            pedidos.append((tentativas, timeout_s))
            return self

    monkeypatch.setattr(cli_principal, "Cliente", lambda **kw: Anota(PASTA))
    monkeypatch.setattr(cli_principal, "agora_brt", lambda: agora)
    argumentos = ["coletar", "--config", str(RAIZ / "config.toml"), "--sem-gravar"]
    assert cli_principal.principal(argumentos) == 0
    assert pedidos == [(1, 15)]  # só o IBGE tem limite próprio


class Instavel(ClienteGravado):
    """Cliente de amostras em que as fontes cujo endereço contém um dos trechos de `quebrados` não respondem."""

    def __init__(self, quebrados: list[str]):
        super().__init__(PASTA)
        self.quebrados = quebrados

    def bytes(self, url: str) -> bytes:
        if any(trecho in url for trecho in self.quebrados):
            raise Falha("sem resposta")
        return super().bytes(url)


@pytest.fixture
def coleta_instavel(monkeypatch, agora):
    """Devolve (cliente instável, lista dos tempos de espera pedidos). A espera não demora de verdade."""
    cliente = Instavel(["Expectativas"])  # o Focus (essencial) não responde
    esperas: list[int] = []
    monkeypatch.setattr(cli_principal, "Cliente", lambda **kw: cliente)
    monkeypatch.setattr(cli_principal, "agora_brt", lambda: agora)
    monkeypatch.setattr(cli_principal, "dormir", esperas.append)
    return cliente, esperas


ARGS = ["coletar", "--config", str(RAIZ / "config.toml"), "--sem-gravar", "--repetir-se-parcial", "20"]


def test_dia_parcial_espera_e_coleta_de_novo(coleta_instavel, monkeypatch, capsys):
    cliente, esperas = coleta_instavel

    def volta_a_funcionar(segundos):
        esperas.append(segundos)
        cliente.quebrados = []  # o problema era passageiro

    monkeypatch.setattr(cli_principal, "dormir", volta_a_funcionar)
    assert cli_principal.principal(ARGS) == 0
    saida = capsys.readouterr().out
    assert esperas == [1200]
    assert "1ª tentativa" in saida and "saiu PARCIAL" in saida
    assert "Status do dia: OK" in saida and "Status do dia: PARCIAL" not in saida


def test_dia_que_continua_parcial_repete_so_uma_vez(coleta_instavel, capsys):
    _, esperas = coleta_instavel
    assert cli_principal.principal(ARGS) == 0
    saida = capsys.readouterr().out
    assert esperas == [1200]
    assert "Status do dia: PARCIAL" in saida and "FALHOU   bcb_focus" in saida


def test_segunda_tentativa_pior_nao_substitui_a_primeira(coleta_instavel, monkeypatch, capsys):
    cliente, esperas = coleta_instavel

    def piora(segundos):
        esperas.append(segundos)
        cliente.quebrados = ["Expectativas", "taxaJuros"]  # agora falham duas fontes essenciais

    monkeypatch.setattr(cli_principal, "dormir", piora)
    assert cli_principal.principal(ARGS) == 0
    final = capsys.readouterr().out.split("Radar Pricing: coleta de")[1]
    assert "OK       bcb_taxas" in final and "FALHOU   bcb_focus" in final  # ficou a 1ª, que era melhor


def test_dia_ok_nao_espera_nem_repete(principal_com_amostras, monkeypatch, capsys):
    monkeypatch.setattr(cli_principal, "dormir", lambda s: pytest.fail("não devia esperar"))
    assert principal_com_amostras(ARGS) == 0
    assert "Status do dia: OK" in capsys.readouterr().out


def test_sem_a_opcao_dia_parcial_nao_repete(coleta_instavel, capsys):
    _, esperas = coleta_instavel
    sem_opcao = [a for a in ARGS if a not in ("--repetir-se-parcial", "20")]
    assert cli_principal.principal(sem_opcao) == 0
    assert esperas == [] and "Status do dia: PARCIAL" in capsys.readouterr().out


def test_pular_se_a_foto_de_hoje_ja_existe(principal_com_amostras, monkeypatch, tmp_path, capsys, hoje):
    argumentos = ["coletar", "--config", str(RAIZ / "config.toml"), "--saida", str(tmp_path)]
    assert principal_com_amostras(argumentos) == 0  # grava a foto de hoje
    foto_gravada = (tmp_path / f"{hoje.isoformat()}.json").read_bytes()
    capsys.readouterr()

    def nao_devia_coletar(**kw):
        raise AssertionError("não devia nem criar o cliente")

    monkeypatch.setattr(cli_principal, "Cliente", nao_devia_coletar)
    assert cli_principal.principal([*argumentos, "--pular-se-ja-existe"]) == 0
    assert "já existe; nada a fazer" in capsys.readouterr().out
    assert [p.read_bytes() for p in tmp_path.glob("*.json")] == [foto_gravada]  # a foto não foi tocada


def test_comando_sem_gravar_nao_escreve_nada(principal_com_amostras, tmp_path, capsys):
    argumentos = ["coletar", "--config", str(RAIZ / "config.toml"), "--saida", str(tmp_path), "--sem-gravar"]
    assert principal_com_amostras(argumentos) == 0
    assert "nada foi escrito" in capsys.readouterr().out and not list(tmp_path.iterdir())


def test_comando_com_so_algumas_fontes(principal_com_amostras, tmp_path, capsys):
    argumentos = [
        "coletar",
        "--config",
        str(RAIZ / "config.toml"),
        "--fontes",
        "bcb_sgs,ibge",
        "--sem-gravar",
    ]
    assert principal_com_amostras(argumentos) == 0
    saida = capsys.readouterr().out
    assert "bcb_sgs" in saida and "ibge" in saida and "tesouro" not in saida
