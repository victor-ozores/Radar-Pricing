import { diasEntre } from "../../js/foto.js";
import { dataBR, mesAno, num } from "../../js/formato.js";
import { PERIODO_DO_KPI, sparkDoKpi, TERMO_DO_KPI } from "../kpis";
import type { Foto } from "../tipos";
import { Delta } from "./Delta";
import { Spark } from "./Spark";
import { Contagem } from "./blocos";
import { Dica, Termo } from "./dicas";

export type Manchete = { id: string; rotulo: string; valor: number; unidade: string; data: string; delta7: { delta: number } | null; fonte: string; nota?: string; dataEhMes?: boolean };

/** Um número de manchete: o valor de hoje, o que mudou em 7 dias, a forma recente e de onde veio. */
export function Kpi({ m, foto }: { m: Manchete; foto: Foto }) {
  const spark = sparkDoKpi(foto, m.id);
  const termo = TERMO_DO_KPI[m.id];
  const rotulo = termo ? <Termo id={termo}>{m.rotulo}</Termo> : m.rotulo;
  // um mesmo jeito de escrever a data em todos os cartões (com o ano): dia/mês/ano, ou mês/ano para o que sai uma vez por mês
  const quando = m.dataEhMes ? mesAno(m.data) : dataBR(m.data);
  const idade = m.dataEhMes ? 0 : diasEntre(m.data, foto.data);
  return (
    <li className="folha group relative flex min-w-0 flex-col justify-between gap-3 p-4 transition-shadow hover:shadow-[0_18px_36px_-20px_rgb(21_33_30/0.4)]">
      <div>
        <p className="m-0 text-[0.8125rem] font-semibold leading-snug text-tinta2">{rotulo}</p>
        <p className="display num m-0 mt-1.5 flex items-baseline gap-1 text-[2rem] font-semibold leading-none tracking-tight text-tinta">
          <Contagem valor={m.valor} casas={2} />
          <span className="font-sans text-sm font-semibold text-tinta3">{m.unidade === "% a.a." ? "% a.a." : m.unidade}</span>
        </p>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0 text-xs text-tinta3">
          {m.delta7 ? <Delta valor={m.delta7.delta} tipo="pp" tamanho="p" periodo={PERIODO_DO_KPI} /> : <span>{m.nota ?? "sem comparação de 7 dias"}</span>}
          <Dica texto={`${m.fonte}${m.nota ? ` · ${m.nota}` : ""}. Dado de ${m.dataEhMes ? mesAno(m.data) : dataBR(m.data)}.`}>
            <button type="button" className="-mx-1 mt-0.5 block max-w-full cursor-help break-words px-1 py-1 border-0 bg-transparent text-left text-[0.72rem] leading-snug text-tinta3 underline decoration-dotted underline-offset-4">
              {m.fonte.replace(/ \(.*\)/, "")} · {quando}
              {idade >= 2 ? ` · há ${idade} dias` : ""}
            </button>
          </Dica>
        </div>
        <Spark valores={spark} cor="var(--s1)" largura={84} altura={34} rotulo={spark.length > 1 ? `Evolução de ${m.rotulo}: de ${num(spark[0], 2)} a ${num(spark.at(-1)!, 2)}` : undefined} />
      </div>
    </li>
  );
}
