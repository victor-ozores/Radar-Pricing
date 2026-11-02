import { useEffect } from "react";
import { num } from "../../js/formato.js";
import { CALCULADORAS, guardaUltimaCalculadora, ultimaCalculadora, type IdDaCalculadora } from "../calc/memoria";
import { useDados } from "../dados";
import { enderecoDa } from "../rota";
import { Campo, Selo } from "../ui/blocos";
import { Termo } from "../ui/dicas";
import { Ativa } from "./calculadoras/Ativa";
import { Cancelada } from "./calculadoras/Cancelada";
import { Oferta } from "./calculadoras/Oferta";
import { Precatorio } from "./calculadoras/Precatorio";

const TELAS = { cancelada: Cancelada, ativa: Ativa, oferta: Oferta, precatorio: Precatorio } as const;

export function Calculadoras({ sub }: { sub: string | null }) {
  const id: IdDaCalculadora = CALCULADORAS.find((c) => c.id === sub)?.id ?? ultimaCalculadora();
  const { spread, defineSpread, estado } = useDados();
  const padrao = estado?.parametros.spread_demonstracao_pp ?? 5;
  useEffect(() => guardaUltimaCalculadora(id), [id]);
  const Tela = TELAS[id];
  return (
    <div className="mx-auto max-w-[76rem] px-4 pb-32 pt-5 md:px-6 md:pb-20 md:pt-12">
      <p className="rotulo m-0 mb-1.5 flex items-center gap-2 md:mb-2">
        Calculadoras <Selo tom="aviso">Demonstração</Selo>
      </p>
      <h1 className="m-0 max-w-[24ch] text-balance text-[1.5rem] font-semibold leading-[1.1] md:text-[2.8rem]">Quanto vale, em valor de hoje?</h1>
      <p className="mb-4 mt-1.5 max-w-[64ch] text-[0.85rem] leading-snug text-tinta2 md:mb-6 md:mt-3 md:text-base">
        Contas simples sobre as taxas do dia, com valores de exemplo: troque pelos seus. A página lembra o que você usou por último. Não é preço nem recomendação.
      </p>
      <nav aria-label="Calculadoras" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
        {CALCULADORAS.map((c) => (
          <a
            key={c.id}
            href={enderecoDa("calculadoras", c.id)}
            aria-current={id === c.id ? "page" : undefined}
            className="min-w-[10.5rem] shrink-0 rounded-2xl border border-linha bg-folha px-4 py-3 no-underline transition-colors hover:border-marca aria-[current=page]:border-marca aria-[current=page]:bg-marca2 md:min-w-0"
          >
            <span className="block text-sm font-semibold text-tinta">{c.nome}</span>
            <span className="block text-xs leading-snug text-tinta3">{c.resumo}</span>
          </a>
        ))}
      </nav>
      <details className="group mb-4 rounded-2xl border border-linha bg-folha2 md:mb-6">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-tinta2 [&::-webkit-details-marker]:hidden">
          <span>
            <Termo id="spread">Spread de risco</Termo> do painel: <span className="num text-tinta">{num(spread, 1)} p.p.</span> <span className="font-normal text-tinta3">(exemplo)</span>
          </span>
          <span className="text-xs font-semibold text-marca group-open:hidden">Mudar</span>
        </summary>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3 border-t border-linha px-4 pb-4 pt-3">
          <div className="w-44">
            <Campo rotulo="Spread de risco" valor={spread} aoMudar={defineSpread} sufixo="p.p." casas={1} max={30} passo={0.5} />
          </div>
          <p className="m-0 min-w-[14rem] max-w-[52ch] flex-1 text-[0.8125rem] leading-snug text-tinta3">
            Adicional somado à taxa do Tesouro para refletir o risco. Vale para as quatro calculadoras e para o briefing; cada conta pode usar outro, só nela.{" "}
            {spread !== padrao ? (
              <button type="button" onClick={() => defineSpread(padrao)} className="border-0 bg-transparent p-0 font-semibold text-marca underline underline-offset-2">
                Voltar para {num(padrao, 1)} p.p.
              </button>
            ) : (
              `Padrão: ${num(padrao, 1)} p.p.`
            )}
          </p>
        </div>
      </details>
      <Tela />
    </div>
  );
}
