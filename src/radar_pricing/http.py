"""Acesso às fontes. Cada regra existe porque uma fonte real se comportou assim (docs/fontes_de_dados.md)."""

from __future__ import annotations

import copy
import gzip
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from typing import Any

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36 RadarPricing/0.1"
GZIP = bytes([0x1F, 0x8B])


class Falha(Exception):
    """A fonte respondeu, mas não do jeito que o robô precisa (ou não respondeu)."""


def codifica(parametros: dict[str, str]) -> str:
    """Monta a consulta OData: espaços viram %20 e `$` vira %24 (o BCB aceita)."""
    return urllib.parse.urlencode(parametros, quote_via=urllib.parse.quote)


class Cliente:
    """Faz as chamadas com limite de tempo e tentativas.

    Tenta de novo: erro de rede, HTTP 5xx e 429, e (em `json`) corpo que não é JSON, porque o BCB devolve
    uma página HTML com HTTP 200 quando algo dá errado. NÃO tenta de novo: HTTP 4xx (o pedido está errado e
    repetir não ajuda).
    Confia no CORPO, não no cabeçalho: o BCB marca JSON válido como `text/html` (SGS 13522).
    """

    def __init__(
        self,
        tentativas: int = 3,
        timeout_s: int = 90,
        esperas: tuple[float, ...] = (1.0, 3.0),
        dormir: Callable[[float], None] = time.sleep,
        abre: Callable[..., Any] = urllib.request.urlopen,
    ) -> None:
        self.tentativas = max(1, tentativas)
        self.timeout_s = timeout_s
        self.esperas = esperas
        self._dormir = dormir
        self._abre = abre

    def com_limites(self, tentativas: int | None = None, timeout_s: int | None = None) -> Cliente:
        """Cópia com outros limites de tentativas e de tempo, para uma fonte que precisa de regra própria."""
        outro = copy.copy(self)
        if tentativas is not None:
            outro.tentativas = max(1, tentativas)
        if timeout_s is not None:
            outro.timeout_s = timeout_s
        return outro

    def _uma_vez(self, url: str) -> bytes:
        pedido = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with self._abre(pedido, timeout=self.timeout_s) as r:
                corpo = r.read()
        except urllib.error.HTTPError as e:
            if e.code >= 500 or e.code == 429:
                raise _Tentar(f"HTTP {e.code}") from e
            raise Falha(f"HTTP {e.code} em {_curto(url)}") from e
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
            raise _Tentar(f"{type(e).__name__}: {str(e)[:80]}") from e
        # o IBGE às vezes manda gzip mesmo sem o cliente pedir
        return gzip.decompress(corpo) if corpo[:2] == GZIP else corpo

    def _com_tentativas(self, url: str, entende: Callable[[bytes], Any]) -> Any:
        ultimo = ""
        for n in range(self.tentativas):
            try:
                return entende(self._uma_vez(url))
            except _Tentar as e:
                ultimo = str(e)
            if n + 1 < self.tentativas:
                self._dormir(self.esperas[min(n, len(self.esperas) - 1)] if self.esperas else 0)
        raise Falha(f"{ultimo} em {_curto(url)} (depois de {self.tentativas} tentativas)")

    def bytes(self, url: str) -> bytes:
        return self._com_tentativas(url, lambda corpo: corpo)

    def texto(self, url: str, codificacao: str = "utf-8") -> str:
        return self._com_tentativas(url, lambda corpo: corpo.decode(codificacao))

    def json(self, url: str) -> Any:
        def entende(corpo: bytes) -> Any:
            try:
                return json.loads(corpo.decode("utf-8"))
            except ValueError as e:
                raise _Tentar(f"o corpo não é JSON (começa com {corpo[:40]!r})") from e

        return self._com_tentativas(url, entende)


class _Tentar(Exception):
    """Problema que vale tentar de novo."""


def _curto(url: str) -> str:
    return url if len(url) <= 110 else url[:107] + "..."
