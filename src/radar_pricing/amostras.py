"""Respostas reais gravadas, para os testes rodarem offline com o que as fontes realmente devolveram.

`Gravador` é um `Cliente` que guarda cada resposta; `ClienteGravado` devolve o que foi guardado e recusa
qualquer endereço que não tenha amostra (assim, mudar a consulta de um coletor derruba o teste até regravar).
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from .http import Cliente, Falha


class Gravador(Cliente):
    def __init__(self, pasta: Path, **kw: Any) -> None:
        super().__init__(**kw)
        self.pasta = pasta
        self.indice: dict[str, str] = {}
        pasta.mkdir(parents=True, exist_ok=True)

    def _uma_vez(self, url: str) -> bytes:
        corpo = super()._uma_vez(url)
        nome = hashlib.sha1(url.encode("utf-8")).hexdigest()[:12] + ".bin"
        (self.pasta / nome).write_bytes(corpo)
        self.indice[url] = nome
        return corpo

    def salva_indice(self) -> None:
        (self.pasta / "index.json").write_text(
            json.dumps(self.indice, ensure_ascii=False, indent=1, sort_keys=True),
            encoding="utf-8",
            newline="\n",
        )


class ClienteGravado:
    """Mesma interface de leitura do `Cliente` (`bytes`, `texto`, `json`), servida da pasta de amostras."""

    def __init__(self, pasta: Path) -> None:
        self.pasta = pasta
        self.indice: dict[str, str] = json.loads((pasta / "index.json").read_text(encoding="utf-8"))

    def com_limites(self, tentativas: int | None = None, timeout_s: int | None = None) -> ClienteGravado:
        """Amostras não têm rede, então os limites não mudam nada."""
        return self

    def bytes(self, url: str) -> bytes:
        if url not in self.indice:
            raise Falha(f"sem amostra gravada para {url}")
        return (self.pasta / self.indice[url]).read_bytes()

    def texto(self, url: str, codificacao: str = "utf-8") -> str:
        return self.bytes(url).decode(codificacao)

    def json(self, url: str) -> Any:
        try:
            return json.loads(self.bytes(url).decode("utf-8"))
        except ValueError as e:
            raise Falha(f"a amostra de {url} não é JSON") from e
