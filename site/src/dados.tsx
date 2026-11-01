import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { baseDaFoto, buscaFoto, DIAS_DE_BUSCA, diasEntre, hojeEmBrasilia, procuraFoto, somaDias } from "../js/foto.js";
import { curvas as curvasDaFoto } from "../js/modelo.js";
import { buscaRodadas } from "../js/robo.js";
import { avaliaSaude } from "../js/saude.js";
import type { Estado, Foto } from "./tipos";

type Rodadas = undefined | null | any[]; // undefined: buscando; null: o GitHub não respondeu

type Contexto = {
  fase: "carregando" | "erro" | "pronta";
  mensagem: string;
  estado: Estado | null;
  data: string | null;
  maisRecente: string | null;
  spread: number;
  defineSpread: (v: number) => void;
  rodadas: Rodadas;
  veredito: any | null;
  /** Anda para a foto anterior (-1) ou seguinte (+1). Devolve false se não há outra nesse sentido. */
  vizinha: (sentido: -1 | 1) => Promise<boolean>;
  vaiParaAMaisRecente: () => void;
  trabalhando: boolean;
};

const Dados = createContext<Contexto | null>(null);

export function useDados(): Contexto {
  const c = useContext(Dados);
  if (!c) throw new Error("useDados fora do ProvedorDeDados");
  return c;
}

/** Só para telas que só existem com a foto pronta. */
export function useEstado(): Estado {
  const { estado } = useDados();
  if (!estado) throw new Error("useEstado antes de a foto chegar");
  return estado;
}

export function ProvedorDeDados({ children }: { children: ReactNode }) {
  const [fase, setFase] = useState<Contexto["fase"]>("carregando");
  const [mensagem, setMensagem] = useState("");
  const [foto, setFoto] = useState<Foto | null>(null);
  const [data, setData] = useState<string | null>(null);
  const [maisRecente, setMaisRecente] = useState<string | null>(null);
  const [spreadEscolhido, setSpreadEscolhido] = useState<number | null>(null);
  const [rodadas, setRodadas] = useState<Rodadas>(undefined);
  const [trabalhando, setTrabalhando] = useState(false);
  const base = useMemo(() => baseDaFoto(), []);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const recente = await procuraFoto(hojeEmBrasilia(), -1, DIAS_DE_BUSCA, base);
        if (cancelado) return;
        if (!recente) {
          setMensagem(`Não achei nenhuma foto nos últimos ${DIAS_DE_BUSCA} dias. O robô pode estar parado: veja a situação dele no GitHub.`);
          setFase("erro");
          return;
        }
        setMaisRecente(recente.data);
        const pedida = new URLSearchParams(globalThis.location.search).get("data");
        if (pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) && pedida !== recente.data) {
          const outra = await buscaFoto(pedida, base).catch(() => null);
          if (cancelado) return;
          if (outra) {
            setFoto(outra);
            setData(pedida);
            setFase("pronta");
            return;
          }
        }
        setFoto(recente.foto);
        setData(recente.data);
        setFase("pronta");
      } catch (e) {
        if (cancelado) return;
        setMensagem(e instanceof Error ? e.message : "Não consegui ler a foto de hoje.");
        setFase("erro");
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [base]);

  useEffect(() => {
    if (!maisRecente) return;
    let cancelado = false;
    buscaRodadas().then((r: Rodadas) => !cancelado && setRodadas(r));
    return () => {
      cancelado = true;
    };
  }, [maisRecente]);

  const estado = useMemo<Estado | null>(() => {
    if (!foto) return null;
    const lista = curvasDaFoto(foto) as any[];
    const par = foto.derivados.parametros;
    return {
      foto,
      parametros: par,
      curvas: { nominal: lista.find((c) => c.id === "nominal") ?? null, real: lista.find((c) => c.id === "real") ?? null },
      spread: spreadEscolhido ?? par.spread_demonstracao_pp,
    };
  }, [foto, spreadEscolhido]);

  const veredito = useMemo(() => (maisRecente ? avaliaSaude({ maisRecente, rodadas: (rodadas ?? null) as any }) : null), [maisRecente, rodadas]);

  const vizinha = useCallback(
    async (sentido: -1 | 1) => {
      if (!data || !maisRecente) return false;
      setTrabalhando(true);
      try {
        const limite = sentido < 0 ? DIAS_DE_BUSCA : Math.max(0, diasEntre(data, maisRecente));
        const achada = await procuraFoto(somaDias(data, sentido), sentido, limite, base);
        if (!achada) return false;
        setFoto(achada.foto);
        setData(achada.data);
        const url = new URL(globalThis.location.href);
        if (achada.data === maisRecente) url.searchParams.delete("data");
        else url.searchParams.set("data", achada.data);
        globalThis.history.replaceState(null, "", url);
        return true;
      } catch {
        return false;
      } finally {
        setTrabalhando(false);
      }
    },
    [base, data, maisRecente],
  );

  const vaiParaAMaisRecente = useCallback(() => {
    if (!maisRecente) return;
    setTrabalhando(true);
    buscaFoto(maisRecente, base)
      .then((f: Foto | null) => {
        if (!f) return;
        setFoto(f);
        setData(maisRecente);
        const url = new URL(globalThis.location.href);
        url.searchParams.delete("data");
        globalThis.history.replaceState(null, "", url);
      })
      .finally(() => setTrabalhando(false));
  }, [base, maisRecente]);

  const valor: Contexto = {
    fase,
    mensagem,
    estado,
    data,
    maisRecente,
    spread: estado?.spread ?? 5,
    defineSpread: (v) => Number.isFinite(v) && v >= 0 && setSpreadEscolhido(v),
    rodadas,
    veredito,
    vizinha,
    vaiParaAMaisRecente,
    trabalhando,
  };
  return <Dados.Provider value={valor}>{children}</Dados.Provider>;
}
