import type { ColumnDef } from "@tanstack/react-table";
import { Bot, Check, CircleAlert, Clock, ExternalLink, Search, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { dataBR, diaDaSemana, idade, num } from "../../js/formato.js";
import { GLOSSARIO, NOMES_DO_GLOSSARIO } from "../../js/glossario.js";
import * as modelo from "../../js/modelo.js";
import { ENDERECO_DAS_RODADAS_NO_GITHUB, passosDoRobo, quandoEmTexto } from "../../js/robo.js";
import { duracaoEmTexto, haQuanto, RODADAS_NA_TIRA, taxaDeSucesso } from "../../js/saude.js";
import { useDados, useEstado } from "../dados";
import { enderecoDa } from "../rota";
import { Selo, type Tom } from "../ui/blocos";
import { Dica, Termo, type TermoDoGlossario } from "../ui/dicas";
import { Tabela } from "../ui/Tabela";

const ABAS = [
  { id: "robo", nome: "O robô travou?", resumo: "Saúde das rodadas diárias" },
  { id: "fontes", nome: "De onde vêm os números", resumo: "Fontes oficiais e se responderam" },
  { id: "dicionario", nome: "Dicionário", resumo: "Os termos, em uma frase" },
  { id: "como", nome: "Como foi feito", resumo: "O caminho do número até a tela" },
] as const;

const GITHUB = "https://github.com/victor-ozores/Radar-Pricing";

// ------------------------------------------------------------------------------------------------ robô
type Rodada = { numero: number; quando: string; dia: string; evento: string; situacao: "sucesso" | "falha" | "andamento" | "outra"; duracaoS: number | null; endereco: string };

const ROTULO_DA_RODADA = { sucesso: "rodou com sucesso", falha: "terminou com falha", andamento: "está rodando agora", outra: "não terminou" } as const;
const ESTILO_DA_RODADA = {
  sucesso: { classe: "bg-ok2 text-ok border-ok/30", Icone: Check },
  falha: { classe: "bg-erro2 text-erro border-erro/40", Icone: X },
  andamento: { classe: "bg-aviso2 text-aviso border-aviso/40", Icone: Clock },
  outra: { classe: "bg-folha2 text-tinta2 border-linha2", Icone: CircleAlert },
} as const;

function Numero({ rotulo, valor, nota }: { rotulo: ReactNode; valor: ReactNode; nota?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-linha bg-folha2 p-4">
      <p className="rotulo m-0">{rotulo}</p>
      <p className="display num m-0 mt-1 text-[1.7rem] font-semibold leading-tight text-tinta">{valor}</p>
      {nota ? <p className="m-0 mt-1 text-xs text-tinta3">{nota}</p> : null}
    </div>
  );
}

function PainelDoRobo() {
  const { veredito, rodadas, maisRecente } = useDados();
  const { foto } = useEstado();
  const lista = Array.isArray(rodadas) ? (rodadas as Rodada[]) : null;
  const ultima = lista?.filter((r) => r.situacao !== "andamento").at(-1) ?? null;
  const taxa = lista ? (taxaDeSucesso(lista) as number | null) : null;
  const tom: Tom = veredito?.estado === "em_dia" ? "ok" : veredito?.estado === "falhou" ? "erro" : "aviso";
  const titulo = veredito?.estado === "em_dia" ? "Robô em dia" : veredito?.estado === "atrasado" ? "Robô atrasado" : "A última rodada falhou";
  const corIcone = { ok: "bg-ok2 text-ok", aviso: "bg-aviso2 text-aviso", erro: "bg-erro2 text-erro", info: "bg-folha2 text-tinta2" }[tom];
  const passos = useMemo(() => passosDoRobo(foto) as [string, string, string][], [foto]);
  const vazias = lista ? Math.max(0, RODADAS_NA_TIRA - lista.length) : RODADAS_NA_TIRA;
  return (
    <div className="grid grid-cols-1 gap-5">
      <section className="folha p-5 md:p-7" aria-labelledby="robo-t">
        <div className="flex flex-wrap items-start gap-4">
          <span className={`grid size-14 shrink-0 place-items-center rounded-2xl ${corIcone}`}>
            <Bot size={28} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="robo-t" className="m-0 text-[1.7rem] font-semibold leading-tight">
              {titulo}
            </h2>
            <p className="m-0 mt-1 max-w-[62ch] text-tinta2">{veredito?.detalhe ?? "Verificando…"}</p>
            <p className="m-0 mt-2">
              <Selo tom={tom}>{tom === "ok" ? "Operacional" : tom === "erro" ? "Com falha" : "Atenção"}</Selo>
            </p>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Numero rotulo={<>Última <Termo id="foto">foto</Termo></>} valor={maisRecente ? dataBR(maisRecente).slice(0, 5) : "—"} nota={maisRecente ? `${diaDaSemana(maisRecente)} · gerada ${haQuanto(foto.gerado_em)}` : undefined} />
          <Numero rotulo={<>Rodadas com sucesso</>} valor={taxa === null ? "—" : `${num(taxa, 0)}%`} nota={lista ? `${lista.filter((r) => r.situacao === "sucesso").length} de ${lista.filter((r) => r.situacao !== "andamento").length} concluídas` : rodadas === undefined ? "buscando no GitHub…" : "o GitHub não respondeu agora"} />
          <Numero rotulo="Duração da última rodada" valor={ultima ? duracaoEmTexto(ultima.duracaoS) : "—"} nota={ultima ? `rodada de ${quandoEmTexto(ultima.quando)}` : undefined} />
        </div>
      </section>

      <section className="folha p-5 md:p-7" aria-labelledby="tira-t">
        <h2 id="tira-t" className="m-0 font-sans text-base font-semibold">
          {lista && lista.length >= RODADAS_NA_TIRA ? `Últimas ${RODADAS_NA_TIRA}` : lista?.length === 1 ? "A única" : "As"} <Termo id="rodadas">rodadas</Termo>{lista && lista.length < RODADAS_NA_TIRA && lista.length !== 1 ? ` até agora (${lista.length})` : ""}
        </h2>
        {rodadas === undefined ? <p className="m-0 mt-3 text-sm text-tinta3" role="status">Buscando as últimas rodadas no GitHub…</p> : null}
        {rodadas === null ? <p className="m-0 mt-3 text-sm text-tinta2">Não consegui ver o histórico das rodadas agora (o GitHub limita as consultas). A situação acima vem da própria foto.</p> : null}
        {lista && lista.length === 0 ? <p className="m-0 mt-3 text-sm text-tinta2">O GitHub ainda não tem rodadas do robô.</p> : null}
        {lista && lista.length > 0 ? (
          <>
            <ol className="m-0 mt-4 flex list-none flex-wrap gap-2 p-0">
              {Array.from({ length: vazias }, (_, i) => (
                <li key={`v${i}`} aria-hidden>
                  <span className="grid size-10 place-items-center rounded-xl border border-dashed border-linha2" />
                </li>
              ))}
              {lista.map((r) => {
                const { classe, Icone } = ESTILO_DA_RODADA[r.situacao];
                const texto = `${quandoEmTexto(r.quando)}: rodada ${r.evento === "agendada" ? "agendada" : "manual"} ${ROTULO_DA_RODADA[r.situacao]}${r.duracaoS === null ? "" : ` em ${duracaoEmTexto(r.duracaoS)}`}`;
                return (
                  <li key={r.numero}>
                    <Dica texto={texto}>
                      <a href={r.endereco} target="_blank" rel="noopener noreferrer" aria-label={texto} className={`grid size-10 place-items-center rounded-xl border ${classe} transition-transform hover:-translate-y-0.5`}>
                        <Icone size={18} strokeWidth={2.4} aria-hidden />
                      </a>
                    </Dica>
                  </li>
                );
              })}
            </ol>
            <div className="mt-2 flex justify-between text-xs text-tinta3">
              <span>mais antiga: {dataBR(lista[0].dia).slice(0, 5)}</span>
              <span>mais nova: {dataBR(lista.at(-1)!.dia).slice(0, 5)}</span>
            </div>
            <ul className="m-0 mt-3 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 text-xs text-tinta2">
              <li className="inline-flex items-center gap-1.5"><Check size={14} className="text-ok" aria-hidden /> Sucesso</li>
              <li className="inline-flex items-center gap-1.5"><X size={14} className="text-erro" aria-hidden /> Falha</li>
              <li className="inline-flex items-center gap-1.5"><Clock size={14} className="text-aviso" aria-hidden /> Rodando</li>
            </ul>
            {ultima ? (
              <p className={`m-0 mt-4 rounded-xl px-3 py-2 text-sm ${ultima.situacao === "sucesso" ? "bg-ok2 text-ok" : "bg-erro2 text-erro"}`}>
                Rodada de {quandoEmTexto(ultima.quando)} ({ultima.evento === "agendada" ? "agendada" : "manual"}): {ROTULO_DA_RODADA[ultima.situacao]}
                {ultima.duracaoS === null ? "" : ` em ${duracaoEmTexto(ultima.duracaoS)}`}.
              </p>
            ) : null}
          </>
        ) : null}
      </section>

      <section className="folha p-5 md:p-7" aria-labelledby="passos-t">
        <h2 id="passos-t" className="m-0 font-sans text-base font-semibold">O que o robô fez na última rodada</h2>
        <ol className="m-0 mt-4 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {passos.map(([, nome, detalhe], i) => (
            <li key={nome} className="rounded-2xl border border-linha bg-folha2 p-4">
              <span className="display num text-2xl text-marca/70">{i + 1}</span>
              <p className="m-0 mt-1 text-sm font-semibold text-tinta">{nome}</p>
              <p className="m-0 mt-0.5 text-[0.8125rem] leading-snug text-tinta3">{detalhe}</p>
            </li>
          ))}
        </ol>
        <p className="m-0 mt-5 text-sm leading-relaxed text-tinta2">De segunda a sexta o robô roda por volta das 10h17 (Brasília); o agendamento do GitHub pode atrasar algumas horas. Se ele parar de rodar, um vigia externo (Healthchecks) manda um e-mail depois de 8 horas de atraso.</p>
        <p className="m-0 mt-3">
          <a href={ENDERECO_DAS_RODADAS_NO_GITHUB} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-marca underline underline-offset-2">
            Ver todas as rodadas no GitHub <ExternalLink size={14} aria-hidden />
          </a>
        </p>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ fontes
type Fonte = { id: string; nome: string; link: string | null; papel: string; situacao: string; n_registros: number; ultimo_dado: string | null; idade_dias: number | null; tempo_s: number | null; observacoes: string[] };

const SITUACAO: Record<string, { tom: Tom; nome: string }> = { ok: { tom: "ok", nome: "OK" }, atrasado: { tom: "aviso", nome: "Atrasado" }, parcial: { tom: "aviso", nome: "Parcial" }, falhou: { tom: "erro", nome: "Falhou" } };

function Fontes() {
  const { foto } = useEstado();
  const dados = useMemo(() => modelo.fontes(foto) as Fonte[], [foto]);
  const problemas = dados.filter((f) => f.situacao !== "ok");
  const colunas = useMemo<ColumnDef<Fonte, any>[]>(
    () => [
      { accessorKey: "nome", header: "Fonte", meta: { largura: "17rem" }, cell: (c) => (c.row.original.link ? <a href={c.row.original.link} target="_blank" rel="noopener noreferrer" className="font-semibold text-marca underline underline-offset-2">{c.getValue()}</a> : <span className="font-semibold text-tinta">{c.getValue()}</span>) },
      { accessorKey: "papel", header: "Papel", meta: { ajuda: "Essencial: se falha, o dia sai incompleto. Complementar: enriquece, mas o painel funciona sem.", largura: "8rem" }, cell: (c) => <span className="capitalize text-tinta2">{c.getValue()}</span> },
      { accessorKey: "situacao", header: "Situação", meta: { largura: "8rem" }, cell: (c) => <Selo tom={SITUACAO[c.getValue()]?.tom ?? "info"}>{SITUACAO[c.getValue()]?.nome ?? c.getValue()}</Selo> },
      { accessorKey: "n_registros", header: "Registros", meta: { numerica: true, ajuda: "Quantos números esta fonte entregou na foto." }, cell: (c) => num(c.getValue(), 0) },
      { accessorKey: "ultimo_dado", header: "Dado mais novo", meta: { ajuda: "A data do dado mais recente que a fonte tinha." }, cell: (c) => <span className="num">{c.getValue() ? dataBR(c.getValue()) : "—"}</span> },
      { accessorKey: "idade_dias", header: "Idade", meta: { numerica: true, ajuda: "Quantos dias o dado mais novo tinha quando o robô leu." }, cell: (c) => (c.getValue() === null ? "—" : idade(c.getValue())) },
      { accessorKey: "tempo_s", header: "Tempo", meta: { numerica: true, ajuda: "Quanto tempo o robô levou para ler a fonte." }, cell: (c) => (c.getValue() === null ? "—" : duracaoEmTexto(Math.round(c.getValue()))) },
      { id: "obs", header: "Observações", accessorFn: (f) => f.observacoes.join(" · "), meta: { largura: "20rem" }, cell: (c) => <span className="text-tinta2">{c.getValue() || "—"}</span> },
    ],
    [],
  );
  return (
    <div className="grid grid-cols-1 gap-5">
      <p className={`m-0 rounded-2xl border p-4 text-[0.95rem] ${problemas.length ? "border-aviso/40 bg-aviso2 text-tinta" : "border-ok/30 bg-ok2 text-tinta"}`}>
        {problemas.length === 0 ? "Todas as fontes responderam nesta foto." : `${problemas.length} de ${dados.length} fontes com problema nesta foto: ${problemas.map((f) => `${f.nome} (${SITUACAO[f.situacao]?.nome.toLowerCase() ?? f.situacao}, ${f.papel})`).join("; ")}. ${problemas.every((f) => f.papel !== "essencial") ? "Nenhuma é essencial: o dia está completo para o que o painel mostra." : "Há fonte essencial com problema: o dia é parcial."}`}
      </p>
      <Tabela dados={dados} colunas={colunas} legenda="Fontes da foto e a situação de cada uma" nomeDoArquivo={`radar-pricing-fontes-${foto.data}`} idDaLinha={(f) => f.id} altura="26rem" />
      <p className="m-0 text-xs text-tinta3">Todas as fontes são públicas e oficiais (Banco Central, Tesouro Nacional, IBGE, ABAC). Cada número do painel mostra a fonte e a data ao passar o mouse.</p>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ dicionário
function Dicionario() {
  const [busca, setBusca] = useState("");
  const itens = useMemo(
    () =>
      (Object.keys(GLOSSARIO) as TermoDoGlossario[])
        .map((id) => ({ id, nome: NOMES_DO_GLOSSARIO[id as keyof typeof NOMES_DO_GLOSSARIO] as string, texto: GLOSSARIO[id] as string }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
        .filter((t) => !busca.trim() || `${t.nome} ${t.texto}`.toLowerCase().includes(busca.trim().toLowerCase())),
    [busca],
  );
  return (
    <div>
      <label className="relative mb-4 block max-w-md">
        <span className="sr-only">Buscar no dicionário</span>
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tinta3" aria-hidden />
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar um termo (ex.: spread, quartil)" className="w-full rounded-xl border border-linha2 bg-folha py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-tinta3 focus:border-marca" />
      </label>
      {itens.length === 0 ? <p className="text-tinta2">Nenhum termo com “{busca}”.</p> : null}
      <dl className="m-0 grid grid-cols-1 gap-3 md:grid-cols-2">
        {itens.map((t) => (
          <div key={t.id} className="folha p-4">
            <dt className="m-0 text-[0.95rem] font-semibold text-tinta">{t.nome}</dt>
            <dd className="m-0 mt-1 text-[0.9rem] leading-relaxed text-tinta2">{t.texto}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ como foi feito
function Como() {
  const etapas = [
    { n: "1", t: "Fontes oficiais", d: "Banco Central (Selic, CDI, IPCA, Focus, taxas de crédito, Panorama de Consórcios), Tesouro Nacional, IBGE e ABAC. Só dados públicos." },
    { n: "2", t: "Robô diário", d: "Um programa em Python roda de segunda a sexta no GitHub Actions, de graça. Lê cada fonte, confere as datas e calcula o que mudou." },
    { n: "3", t: "Foto datada", d: "O resultado vira um arquivo por dia, guardado para sempre na branch data. Nunca é reescrito: qualquer preço do passado pode ser refeito." },
    { n: "4", t: "Painel e Excel", d: "Este painel lê a foto direto do GitHub, sem servidor. O Excel é gerado no seu navegador, com fórmulas que você pode mudar." },
  ];
  return (
    <div className="grid grid-cols-1 gap-6">
      <ol className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-4">
        {etapas.map((e) => (
          <li key={e.n} className="folha relative p-5">
            <span className="display num text-4xl text-marca/70">{e.n}</span>
            <h3 className="m-0 mt-1 font-sans text-[0.95rem] font-semibold text-tinta">{e.t}</h3>
            <p className="m-0 mt-1 text-[0.85rem] leading-relaxed text-tinta2">{e.d}</p>
          </li>
        ))}
      </ol>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="folha p-5">
          <h3 className="m-0 font-sans text-base font-semibold">O que as contas fazem</h3>
          <ul className="m-0 mt-2 list-disc pl-5 text-[0.9rem] leading-relaxed text-tinta2">
            <li>A taxa para um prazo qualquer sai de uma interpolação entre os dois vencimentos vizinhos do Tesouro.</li>
            <li>O valor de hoje é o valor a receber dividido por (1 + taxa de desconto) elevado ao prazo em anos. A taxa de desconto é a do Tesouro mais o spread.</li>
            <li>O JavaScript do painel e o Python do robô fazem a mesma conta, e um teste compara os dois ao centavo com a foto de verdade.</li>
            <li>O Excel foi aberto no Excel de verdade para conferir que as fórmulas dão o mesmo resultado do painel.</li>
          </ul>
        </section>
        <section className="folha p-5">
          <h3 className="m-0 font-sans text-base font-semibold">O que este painel não é</h3>
          <ul className="m-0 mt-2 list-disc pl-5 text-[0.9rem] leading-relaxed text-tinta2">
            <li>Não é preço de cota nem recomendação: o spread e os exemplos das calculadoras são de demonstração.</li>
            <li>Não usa nenhum dado interno de empresa. Projeto de portfólio, independente, só com dados públicos.</li>
            <li>Não calcula lance, seguro, fundo de reserva nem a chance de contemplação.</li>
            <li>Não encontrei fonte pública de preço de cota no mercado secundário; por isso o painel acompanha as premissas, não o preço.</li>
          </ul>
        </section>
      </div>
      <p className="m-0">
        <a href={GITHUB} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-marca underline underline-offset-2">
          Código, testes e documentação no GitHub <ExternalLink size={14} aria-hidden />
        </a>
      </p>
    </div>
  );
}

export function Bastidores({ sub }: { sub: string | null }) {
  const aba = ABAS.find((a) => a.id === sub) ?? ABAS[0];
  return (
    <div className="mx-auto max-w-[76rem] px-4 pb-20 pt-8 md:px-6 md:pt-12">
      <p className="rotulo m-0 mb-2">Bastidores</p>
      <h1 className="m-0 max-w-[26ch] text-balance text-[2rem] font-semibold leading-[1.1] md:text-[2.8rem]">Dá para confiar nestes números?</h1>
      <p className="mb-6 mt-3 max-w-[62ch] text-tinta2">Aqui está o que sustenta o painel: se o robô está rodando, de onde vem cada número, o que cada termo quer dizer e como as contas foram conferidas.</p>
      <nav aria-label="Seções dos bastidores" className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {ABAS.map((a) => (
          <a key={a.id} href={enderecoDa("bastidores", a.id)} aria-current={aba.id === a.id ? "page" : undefined} className="shrink-0 rounded-2xl border border-linha bg-folha px-4 py-2.5 no-underline transition-colors hover:border-marca aria-[current=page]:border-marca aria-[current=page]:bg-marca2">
            <span className="block text-sm font-semibold text-tinta">{a.nome}</span>
            <span className="block text-xs text-tinta3">{a.resumo}</span>
          </a>
        ))}
      </nav>
      {aba.id === "robo" ? <PainelDoRobo /> : aba.id === "fontes" ? <Fontes /> : aba.id === "dicionario" ? <Dicionario /> : <Como />}
    </div>
  );
}
