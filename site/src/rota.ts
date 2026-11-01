import { useEffect, useState } from "react";
import type { Tela } from "./tipos";

export const TELAS: { id: Tela; nome: string; resumo: string }[] = [
  { id: "briefing", nome: "Briefing", resumo: "A história do dia" },
  { id: "mercado", nome: "Mercado", resumo: "Gráficos e tabelas" },
  { id: "calculadoras", nome: "Calculadoras", resumo: "Quanto vale" },
  { id: "bastidores", nome: "Bastidores", resumo: "Robô, fontes e dicionário" },
];

export type Rota = { tela: Tela; sub: string | null };

export function lerRota(hash = globalThis.location?.hash ?? ""): Rota {
  const [, tela, sub] = /^#\/([a-z]+)(?:\/([\w-]+))?/.exec(hash) ?? [];
  const achada = TELAS.find((t) => t.id === tela);
  return { tela: achada?.id ?? "briefing", sub: sub ?? null };
}

export function enderecoDa(tela: Tela, sub?: string | null) {
  return `#/${tela}${sub ? `/${sub}` : ""}`;
}

export function irPara(tela: Tela, sub?: string | null) {
  globalThis.location.hash = enderecoDa(tela, sub);
}

export function useRota(): Rota {
  const [rota, setRota] = useState<Rota>(() => lerRota());
  useEffect(() => {
    const aoMudar = () => {
      setRota(lerRota());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", aoMudar);
    return () => window.removeEventListener("hashchange", aoMudar);
  }, []);
  return rota;
}
