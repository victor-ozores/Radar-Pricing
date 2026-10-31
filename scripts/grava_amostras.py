"""Grava em tests/fixtures as respostas REAIS das fontes de hoje, para os testes rodarem offline.

    python scripts/grava_amostras.py

Roda todos os coletores de verdade, guarda cada resposta e reduz as duas grandes (CSV do Tesouro e
posts da ABAC) para o que os testes precisam. Rode de novo quando uma fonte mudar de formato e confira
o que mudou no git.
"""

from __future__ import annotations

import csv
import html
import io
import json
import re
import shutil
import sys
from datetime import timedelta
from pathlib import Path

from radar_pricing.amostras import Gravador
from radar_pricing.coleta import coletar_tudo
from radar_pricing.config import carrega
from radar_pricing.datas import agora_brt, parse_br

sys.stdout.reconfigure(encoding="utf-8")
RAIZ = Path(__file__).resolve().parent.parent
PASTA = RAIZ / "tests" / "fixtures"
TEXTO_ABAC = 1500  # caracteres do texto de cada boletim da ABAC que ficam nas amostras


def reduz_tesouro(g: Gravador) -> None:
    url = next(u for u in g.indice if u.lower().endswith(".csv"))
    arquivo = g.pasta / g.indice[url]
    linhas = list(csv.reader(io.StringIO(arquivo.read_bytes().decode("latin-1")), delimiter=";"))
    cabecalho, corpo = linhas[0], linhas[1:]
    ultima = max(parse_br(r[2]) for r in corpo)
    mantidas = [r for r in corpo if parse_br(r[2]) >= ultima - timedelta(days=40)]
    saida = io.StringIO()
    escritor = csv.writer(saida, delimiter=";", lineterminator="\r\n")
    escritor.writerow(cabecalho)
    escritor.writerows(mantidas)
    arquivo.write_bytes(saida.getvalue().encode("latin-1"))
    print(f"  Tesouro: {len(corpo)} linhas -> {len(mantidas)} (últimos 40 dias)")


def reduz_abac(g: Gravador) -> None:
    """Deixa só o trecho inicial de cada boletim mensal (onde estão os números), para não reproduzir o texto
    inteiro de um site de terceiros no repositório, e um post de outro assunto só com o título."""
    url = next(u for u in g.indice if "blog.abac.org.br" in u)
    arquivo = g.pasta / g.indice[url]
    posts = json.loads(arquivo.read_text(encoding="utf-8"))
    mantidos = []
    for p in posts:
        if "dados econ" in p["title"]["rendered"] and len(mantidos) < 4:
            texto = re.sub(
                r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", p["content"]["rendered"]))
            ).strip()
            p["content"]["rendered"] = "<p>" + texto[:TEXTO_ABAC].rsplit(" ", 1)[0] + "</p>"
            mantidos.append(p)
    outro = next(p for p in posts if "dados econ" not in p["title"]["rendered"])
    outro["content"]["rendered"] = ""
    arquivo.write_text(json.dumps([*mantidos, outro], ensure_ascii=False), encoding="utf-8", newline="\n")
    print(
        f"  ABAC: {len(posts)} posts -> {len(mantidos) + 1} (primeiros {TEXTO_ABAC} caracteres "
        "de cada boletim)"
    )


def main() -> int:
    cfg = carrega(RAIZ / "config.toml")
    if PASTA.exists():
        shutil.rmtree(PASTA)
    g = Gravador(PASTA, tentativas=cfg.tentativas, timeout_s=cfg.timeout_s)
    agora = agora_brt()
    foto = coletar_tudo(g, agora.date(), agora, cfg.papeis, paralelo=False)
    if foto.status != "ok":
        print("ATENÇÃO: o dia não saiu 'ok'; não vou gravar amostras de uma coleta com problema.")
        for f in foto.fontes:
            print(f"  {f.id}: {f.situacao} {f.erro or ''} {f.falhas} {f.atrasos}")
        return 1
    reduz_tesouro(g)
    reduz_abac(g)
    g.salva_indice()
    (PASTA / "meta.json").write_text(
        json.dumps({"hoje": agora.date().isoformat(), "gravado_em": agora.isoformat()}, indent=1),
        encoding="utf-8",
        newline="\n",
    )
    total = sum(f.stat().st_size for f in PASTA.iterdir())
    print(
        f"{len(g.indice)} respostas gravadas em {PASTA} ({total / 1024:.0f} KB), "
        f"data da coleta {agora.date()}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
