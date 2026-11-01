import { useEstado } from "../dados";
import { enderecoDa } from "../rota";
import { MercadoCredito, MercadoSetor } from "./mercado/CreditoESetor";
import { MercadoJuros } from "./mercado/Juros";
import { MercadoTesouro } from "./mercado/Tesouro";

const ABAS = [
  { id: "tesouro", nome: "Tesouro", resumo: "Curva de juros dia a dia" },
  { id: "juros", nome: "Selic, inflação e Focus", resumo: "Custo do dinheiro e expectativas" },
  { id: "credito", nome: "Crédito por banco", resumo: "Quem cobra quanto" },
  { id: "setor", nome: "Setor de consórcio", resumo: "Panorama do Banco Central e ABAC" },
] as const;

export function Mercado({ sub }: { sub: string | null }) {
  const { foto } = useEstado();
  const aba = ABAS.find((a) => a.id === sub) ?? ABAS[0];
  return (
    <div className="mx-auto max-w-[76rem] px-4 pb-20 pt-8 md:px-6 md:pt-12">
      <p className="rotulo m-0 mb-2">Mercado</p>
      <h1 className="m-0 max-w-[26ch] text-balance text-[2rem] font-semibold leading-[1.1] md:text-[2.8rem]">Os números por trás da história</h1>
      <p className="mb-6 mt-3 max-w-[62ch] text-tinta2">Gráficos que mostram como cada número andou e tabelas completas, que você pode ordenar, buscar e baixar em CSV. Passe o mouse sobre os títulos das colunas para ver o que cada uma quer dizer.</p>
      <nav aria-label="Seções do mercado" className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {ABAS.map((a) => (
          <a
            key={a.id}
            href={enderecoDa("mercado", a.id)}
            aria-current={aba.id === a.id ? "page" : undefined}
            className="shrink-0 rounded-2xl border border-linha bg-folha px-4 py-2.5 no-underline transition-colors hover:border-marca aria-[current=page]:border-marca aria-[current=page]:bg-marca2"
          >
            <span className="block text-sm font-semibold text-tinta">{a.nome}</span>
            <span className="block text-xs text-tinta3">{a.resumo}</span>
          </a>
        ))}
      </nav>
      {aba.id === "tesouro" ? <MercadoTesouro foto={foto} /> : aba.id === "juros" ? <MercadoJuros foto={foto} /> : aba.id === "credito" ? <MercadoCredito foto={foto} /> : <MercadoSetor foto={foto} />}
    </div>
  );
}
