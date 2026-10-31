"""Linha de comando: `python -m radar_pricing coletar`."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

from .coleta import coletar_tudo
from .config import carrega
from .datas import agora_brt
from .foto import grava
from .historico import carrega_anterior
from .http import Cliente, Falha
from .mudancas import pt

ICONES = {"ok": "OK      ", "atrasado": "ATRASADO", "parcial": "PARCIAL ", "falhou": "FALHOU  "}
SELOS = {"alta": "ALTA ", "media": "MEDIA", "info": "info "}


def _imprime_fontes(foto: Any) -> None:
    for f in foto.fontes:
        ultimo = (
            f"último dado {f.ultimo_dado.isoformat()} ({f.idade_dias} dias)" if f.ultimo_dado else "sem dado"
        )
        print(
            f"  {ICONES[f.situacao]} {f.id:<13} [{f.papel[:5]}] {f.n_registros:>4} registros, "
            f"{ultimo}, {f.tempo_s:.1f} s"
        )
        for texto in (f.erro, *f.falhas, *f.atrasos, *f.avisos):
            if texto:
                print(f"           - {texto}")
    for c in foto.conferencias:
        print(f"  conferência: {c}")


def _celula(c: dict[str, Any] | None) -> str:
    if c is None:
        return "sem curva"
    marca = "*" if c["extrapolado"] else " "
    return (
        f"{pt(c['taxa_ancora']):>6}% R$ {pt(c['vp_ancora']):>7} | "
        f"demo {pt(c['taxa_demonstracao']):>6}% R$ {pt(c['vp_demonstracao']):>7}{marca}"
    )


def _imprime_derivados(foto: Any) -> None:
    d = foto.derivados
    if not d:
        return
    par = d["parametros"]
    cdi = d["ancoras"]["cdi_anualizado"]
    print(f"\nÂncoras: CDI anualizado {pt(cdi['taxa']) if cdi else '?'}% a.a.", end="")
    for chave, nome in (("curva_nominal", "Prefixado"), ("curva_real", "IPCA+")):
        curva = d["ancoras"][chave]
        if curva:
            print(f" | Tesouro {nome} de {curva['base']}: {len(curva['pontos'])} vencimentos", end="")
        else:
            print(f" | sem Tesouro {nome}", end="")
    print(
        f"\nValor presente de R$ {pt(par['valor_face'], 0)} "
        f"(spread de DEMONSTRAÇÃO: +{pt(par['spread_demonstracao_pp'])} p.p.; * = fora da curva, usa a ponta)"
    )
    print(
        "  meses | em R$ fixos (Tesouro Prefixado)                      | corrigido pelo IPCA (Tesouro IPCA+)"
    )
    for linha in d["valor_presente"]:
        print(f"  {linha['meses']:>5} | {_celula(linha['nominal'])} | {_celula(linha['real'])}")
    for aviso in d["avisos"]:
        print(f"  aviso: {aviso}")


def _imprime_mudancas(foto: Any, tem_anterior: bool) -> None:
    print(f"\nMudanças do dia ({len(foto.mudancas)}):")
    for m in foto.mudancas:
        print(f"  [{SELOS[m['severidade']]}] {m['texto']}")
    if not foto.mudancas:
        print("  Sem mudanças relevantes hoje.")
    if not tem_anterior:
        print(
            "  (sem foto anterior: novidades de trimestre, boletim e revisões só aparecem a partir do 2º dia)"
        )


def _coletar(args: argparse.Namespace) -> int:
    cfg = carrega(Path(args.config))
    agora = agora_brt()
    hoje = agora.date()
    pasta = Path(args.saida) if args.saida else cfg.saida
    cli = Cliente(tentativas=cfg.tentativas, timeout_s=cfg.timeout_s)
    so = [f.strip() for f in args.fontes.split(",")] if args.fontes else None
    anterior = carrega_anterior(pasta, hoje)
    foto = coletar_tudo(
        cli, hoje, agora, cfg.papeis, so=so, derivados=cfg.derivados, mudancas=cfg.mudancas, anterior=anterior
    )

    print(f"Radar Pricing: coleta de {hoje.isoformat()} ({foto.gerado_em})")
    _imprime_fontes(foto)
    _imprime_derivados(foto)
    _imprime_mudancas(foto, anterior is not None)
    print(f"\nStatus do dia: {foto.status.upper()} ({len(foto.registros)} registros)")

    if args.sem_gravar:
        print("(--sem-gravar: nada foi escrito)")
        return 0
    try:
        arquivo_json, arquivo_csv = grava(foto, pasta, args.regravar)
    except Falha as e:
        print(f"ERRO: {e}", file=sys.stderr)
        return 1
    print(f"Foto gravada em {arquivo_json} e {arquivo_csv}")
    return 0


def principal(argv: list[str] | None = None) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(
        prog="radar_pricing", description="Radar Pricing: premissas públicas de mercado."
    )
    sub = ap.add_subparsers(dest="comando", required=True)
    c = sub.add_parser("coletar", help="coleta todas as fontes e grava a foto do dia")
    c.add_argument("--config", default="config.toml", help="caminho do config.toml")
    c.add_argument("--saida", help="pasta onde gravar a foto (padrão: a do config.toml)")
    c.add_argument("--fontes", help="só estas fontes, separadas por vírgula (ex.: bcb_sgs,tesouro)")
    c.add_argument("--regravar", action="store_true", help="sobrescreve a foto do dia (só em teste local)")
    c.add_argument(
        "--sem-gravar", action="store_true", help="coleta e mostra o resultado sem escrever arquivos"
    )
    c.set_defaults(funcao=_coletar)
    args = ap.parse_args(argv)
    return args.funcao(args)


if __name__ == "__main__":
    sys.exit(principal())
