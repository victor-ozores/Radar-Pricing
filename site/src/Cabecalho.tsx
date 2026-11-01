import { ChevronLeft, ChevronRight, FileSpreadsheet, Moon, Printer, Sun } from "lucide-react";
import { useState } from "react";
import { dataBR, diaDaSemana } from "../js/formato.js";
import { haQuanto } from "../js/saude.js";
import { baixaExcel } from "./baixa";
import { useDados } from "./dados";
import { irPara, TELAS, enderecoDa, type Rota } from "./rota";
import { useTema } from "./tema";
import { Dica } from "./ui/dicas";

const GITHUB = "https://github.com/victor-ozores/Radar-Pricing";

function Logo() {
  return (
    <svg viewBox="0 0 40 40" width="38" height="38" aria-hidden focusable="false" className="shrink-0">
      <rect width="40" height="40" rx="10" fill="var(--marca)" />
      <path d="M8 32.5h24" stroke="var(--marca-sobre)" strokeOpacity=".4" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 29C14 28 17 20 22 19S31 12 33 9" fill="none" stroke="var(--marca-sobre)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="33" cy="9" r="3.4" fill="#e0a52c" stroke="var(--marca)" strokeWidth="1.6" />
    </svg>
  );
}

function IconeGitHub() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden focusable="false">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

const botaoIcone = "grid size-9 place-items-center rounded-full border border-linha bg-folha p-0 text-tinta2 transition-colors hover:border-marca hover:text-marca";

export function Cabecalho({ rota }: { rota: Rota }) {
  const { estado, veredito, data, maisRecente, vizinha, vaiParaAMaisRecente, trabalhando } = useDados();
  const [tema, trocaTema] = useTema();
  const [gerando, setGerando] = useState(false);
  const [nota, setNota] = useState("");
  const vai = (sentido: -1 | 1) =>
    vizinha(sentido).then((achou: boolean) => {
      if (achou) return setNota("");
      setNota(sentido < 0 ? "Não há foto anterior guardada ainda." : "Esta já é a foto mais recente.");
      globalThis.setTimeout(() => setNota(""), 4000);
    });
  const tom = veredito?.estado === "em_dia" ? "ok" : veredito?.estado === "falhou" ? "erro" : "aviso";
  const cor = { ok: "bg-ok", aviso: "bg-aviso", erro: "bg-erro" }[tom];
  const texto = !veredito || !estado ? "Verificando o robô…" : veredito.estado === "em_dia" ? `Atualizado ${haQuanto(estado.foto.gerado_em)}` : veredito.curto;
  const antiga = data && maisRecente && data < maisRecente;

  return (
    <header className="nao-imprime sticky top-0 z-40 border-b border-linha bg-papel/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[76rem] items-center gap-3 px-4 py-2.5 md:gap-5 md:px-6">
        <a href={enderecoDa("briefing")} className="flex items-center gap-2.5 rounded-lg no-underline" aria-label="Radar Pricing, ir ao briefing">
          <Logo />
          <span className="leading-none">
            <span className="display block text-[1.22rem] font-semibold tracking-tight text-tinta">Radar Pricing</span>
            <span className="mt-0.5 hidden text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-tinta3 sm:block">Premissas públicas de mercado</span>
          </span>
        </a>

        <nav aria-label="Telas do painel" className="ml-2 hidden gap-1 md:flex">
          {TELAS.map((t) => (
            <a
              key={t.id}
              href={enderecoDa(t.id)}
              aria-current={rota.tela === t.id ? "page" : undefined}
              className="rounded-full px-3.5 py-1.5 text-sm font-semibold text-tinta2 no-underline transition-colors hover:bg-folha2 hover:text-tinta aria-[current=page]:bg-tinta aria-[current=page]:text-papel"
            >
              {t.nome}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => irPara("bastidores", "robo")}
            className="hidden items-center gap-2 rounded-full border border-linha bg-folha px-3 py-1.5 text-[0.8125rem] font-semibold text-tinta2 hover:border-marca sm:inline-flex"
            aria-label={`Situação do robô: ${texto}. Ver detalhes`}
          >
            <span className={`relative inline-block size-2.5 rounded-full ${cor}`}>
              {tom === "ok" ? <span className={`absolute inset-0 animate-ping rounded-full ${cor} opacity-40 motion-reduce:hidden`} /> : null}
            </span>
            {texto}
          </button>
          <Dica texto="Imprimir ou salvar o briefing em PDF">
            <button type="button" className={`${botaoIcone} hidden sm:grid`} aria-label="Imprimir o briefing" onClick={() => globalThis.print()}>
              <Printer size={17} />
            </button>
          </Dica>
          <Dica texto={gerando ? "Gerando o Excel…" : "Baixar o Excel desta foto (12 abas, com fórmulas)"}>
            <button
              type="button"
              className={botaoIcone}
              aria-label="Baixar o Excel desta foto"
              disabled={!estado || gerando}
              onClick={() => {
                if (!estado) return;
                setGerando(true);
                baixaExcel(estado.foto).finally(() => setGerando(false));
              }}
            >
              <FileSpreadsheet size={17} />
            </button>
          </Dica>
          <Dica texto={tema === "claro" ? "Tema escuro" : "Tema claro"}>
            <button type="button" className={botaoIcone} aria-label={tema === "claro" ? "Mudar para o tema escuro" : "Mudar para o tema claro"} onClick={trocaTema}>
              {tema === "claro" ? <Moon size={17} /> : <Sun size={17} />}
            </button>
          </Dica>
          <Dica texto="Código e documentação no GitHub">
            <a className={botaoIcone} href={GITHUB} target="_blank" rel="noopener noreferrer" aria-label="Código e documentação no GitHub">
              <IconeGitHub />
            </a>
          </Dica>
        </div>
      </div>

      <nav aria-label="Telas do painel (celular)" className="mx-auto flex max-w-[76rem] gap-1 overflow-x-auto px-3 pb-2 md:hidden">
        {TELAS.map((t) => (
          <a
            key={t.id}
            href={enderecoDa(t.id)}
            aria-current={rota.tela === t.id ? "page" : undefined}
            className="whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold text-tinta2 no-underline aria-[current=page]:bg-tinta aria-[current=page]:text-papel"
          >
            {t.nome}
          </a>
        ))}
      </nav>

      {estado && data ? (
        <div className="border-t border-linha/70 bg-folha/60">
          <div className="mx-auto flex max-w-[76rem] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 text-[0.8rem] text-tinta2 md:px-6">
            <span className="flex items-center gap-1">
              <Dica texto="Foto anterior">
                <button type="button" disabled={trabalhando} aria-label="Ver a foto anterior" onClick={() => vai(-1)} className="grid size-6 place-items-center rounded-md border-0 bg-transparent p-0 text-tinta2 hover:bg-folha2 hover:text-marca disabled:opacity-40">
                  <ChevronLeft size={16} />
                </button>
              </Dica>
              <span className="num font-semibold text-tinta">
                Foto de {dataBR(data)}
              </span>
              <span className="hidden capitalize text-tinta3 sm:inline">· {diaDaSemana(data)}</span>
              <Dica texto="Foto seguinte">
                <button type="button" disabled={trabalhando || !antiga} aria-label="Ver a foto seguinte" onClick={() => vai(1)} className="grid size-6 place-items-center rounded-md border-0 bg-transparent p-0 text-tinta2 hover:bg-folha2 hover:text-marca disabled:opacity-30">
                  <ChevronRight size={16} />
                </button>
              </Dica>
            </span>
            <span role="status" aria-live="polite" className="text-aviso empty:hidden">{nota}</span>
            {antiga ? (
              <span className="text-aviso">
                Foto antiga.{" "}
                <button type="button" onClick={vaiParaAMaisRecente} className="border-0 bg-transparent p-0 font-semibold text-marca underline">
                  Ver a mais recente ({dataBR(maisRecente)})
                </button>
              </span>
            ) : (
              <span className="hidden text-tinta3 sm:inline">Cada dia fica guardado para sempre: dá para voltar e ver os números daquele dia.</span>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}
