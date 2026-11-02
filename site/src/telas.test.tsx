// Teste de fumaça das telas: abre o painel inteiro com a foto de verdade (a de 31/10/2026) e confere que cada tela
// aparece, que as contas batem e que nenhum texto vaza "NaN", "undefined" ou "null".
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import foto from "../tests/fixtures/foto-2026-10-31.json";
import { App } from "./App";

const RODADAS = {
  workflow_runs: [1, 2, 3].map((n) => ({
    run_number: n,
    event: "schedule",
    status: "completed",
    conclusion: n === 2 ? "failure" : "success",
    run_started_at: `2026-10-${20 + n}T13:17:00Z`,
    created_at: `2026-10-${20 + n}T13:17:00Z`,
    updated_at: `2026-10-${20 + n}T13:18:07Z`,
    html_url: `https://github.com/x/y/actions/runs/${n}`,
  })),
};

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  window.matchMedia = ((q: string) => ({ matches: /reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
  window.scrollTo = (() => {}) as typeof window.scrollTo;
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("api.github.com")) return { ok: true, status: 200, json: async () => RODADAS };
      return { ok: true, status: 200, json: async () => foto };
    }),
  );
  document.documentElement.setAttribute("data-tema", "claro");
  localStorage.clear(); // cada teste começa sem lembrar valores de outro
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function abre(hash: string) {
  window.location.hash = hash;
  render(<App />);
  await screen.findByRole("heading", { level: 1 }, { timeout: 5000 });
}

const textoDaPagina = () => document.body.textContent ?? "";
const semLixo = () => expect(textoDaPagina()).not.toMatch(/NaN|undefined|\bnull\b|\[object/);

describe("briefing", () => {
  it("abre com a manchete, o que mexeu, os números do dia e os cinco capítulos", async () => {
    await abre("#/briefing");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/Um valor a receber em 3 anos vale hoje 5,2% menos do que valia há 7 dias\./);
    expect(screen.getByText("O que mexeu na semana")).toBeTruthy();
    const capitulos = ["01", "02", "03", "04", "05"].map((n) => screen.getByText(n, { selector: "div[aria-hidden]" }));
    expect(capitulos).toHaveLength(5);
    await waitFor(() => expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent).join("|")).toMatch(/A Selic está em 13,75% ao ano/));
    expect(textoDaPagina()).toMatch(/As taxas do Tesouro Prefixado subiram até 2,26 p\.p\. em 7 dias, bem mais nos prazos longos/);
    expect(textoDaPagina()).toMatch(/De cada 100 cotas do consórcio \(ativas e excluídas\), 49 já saíram do grupo\./);
    expect(textoDaPagina()).toMatch(/Financiar um veículo custa 8,8 p\.p\. a mais por ano/);
    semLixo();
  });

  it("rótulos e textos certos: sem '1 meses', ABAC só acumula o que acumula, a diferença da frase fecha", async () => {
    await abre("#/briefing");
    await screen.findByText(/Volume de vendas no ano/);
    const texto = textoDaPagina();
    expect(texto).not.toMatch(/1 meses/);
    expect(texto).toMatch(/TOTAL1 mês(?!es)/); // o prazo médio mudou 1 mês no trimestre
    expect((texto.match(/acumulado até set\/2026/g) ?? []).length).toBe(4); // as quatro séries "no ano"
    expect((texto.match(/em set\/2026/g) ?? []).length).toBeGreaterThanOrEqual(2); // participantes ativos e ticket médio
    expect(texto).toMatch(/de 6,78% para 7,77% ao ano acima do IPCA \(\+0,99 p\.p\.\)/);
  });

  it("os 9 números do dia ocupam 3 colunas nas telas largas (nenhum cartão sozinho)", async () => {
    await abre("#/briefing");
    const lista = document.querySelector('section[aria-labelledby="numeros"] ul') as HTMLElement;
    expect(lista.children).toHaveLength(9);
    expect(lista.className).toContain("lg:grid-cols-3");
    expect(lista.className).not.toContain("lg:grid-cols-4");
  });

  it("mudar o spread refaz a manchete", async () => {
    await abre("#/briefing");
    const antes = screen.getByRole("heading", { level: 1 }).textContent;
    const campo = screen.getByRole("textbox", { name: /Spread de risco/ }) as HTMLInputElement;
    fireEvent.change(campo, { target: { value: "12" } });
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).not.toBe(antes));
    semLixo();
  });
});

describe("mercado", () => {
  it("a tabela do Tesouro ordena e filtra", async () => {
    await abre("#/mercado/tesouro");
    const tabela = await screen.findByRole("table", { name: /Taxas dos títulos do Tesouro/ });
    expect(within(tabela).getAllByRole("row")).toHaveLength(16); // cabeçalho + 15 vencimentos
    const colunaTaxa = within(tabela).getByRole("columnheader", { name: /Taxa hoje/ });
    fireEvent.click(within(colunaTaxa).getByRole("button")); // número: a primeira vez ordena da maior para a menor
    expect(colunaTaxa.getAttribute("aria-sort")).toBe("descending");
    const [maior] = within(tabela).getAllByRole("row").slice(1);
    expect(maior.textContent).toMatch(/Tesouro Prefixado.*15,17%/); // a maior taxa do dia: Prefixado 2032
    fireEvent.click(within(colunaTaxa).getByRole("button"));
    expect(colunaTaxa.getAttribute("aria-sort")).toBe("ascending");
    const [menor] = within(tabela).getAllByRole("row").slice(1);
    expect(menor.textContent).toMatch(/Tesouro Selic/); // a menor: o spread do Tesouro Selic
    fireEvent.change(screen.getByPlaceholderText(/Buscar título ou ano/), { target: { value: "2032" } });
    await waitFor(() => expect(within(tabela).getAllByRole("row")).toHaveLength(3)); // IPCA+ 2032 e Prefixado 2032
    semLixo();
  });

  it("o balão do título da coluna abre por toque (o Radix sozinho só abre com mouse ou foco)", async () => {
    await abre("#/mercado/tesouro");
    const tabela = await screen.findByRole("table", { name: /Taxas dos títulos do Tesouro/ });
    const botao = within(within(tabela).getByRole("columnheader", { name: /Taxa hoje/ })).getByRole("button");
    expect(screen.queryByText(/Taxa de compra do último dia da foto/)).toBeNull();
    fireEvent.pointerDown(botao, { pointerType: "touch" });
    fireEvent.click(botao);
    expect((await screen.findAllByText(/Taxa de compra do último dia da foto/)).length).toBeGreaterThan(0);
  });

  it("Selic e inflação: série mensal mostra o mês, não o dia 1", async () => {
    await abre("#/mercado/juros");
    const tabela = await screen.findByRole("table", { name: /Selic, CDI e IPCA/ });
    const linha = within(tabela).getByText("IPCA em 12 meses").closest("tr") as HTMLElement;
    expect(linha.textContent).toMatch(/set\/2026/);
    expect(linha.textContent).not.toMatch(/01\/09\/2026/);
    const meta = within(tabela).getByText("Meta Selic").closest("tr") as HTMLElement;
    expect(meta.textContent).toMatch(/31\/10\/2026/); // série diária segue com o dia
  });

  it.each([
    ["juros", /Selic, CDI e inflação/],
    ["credito", /Taxa de cada banco/],
    ["setor", /Panorama de Consórcios/],
  ])("a aba %s abre sem lixo no texto", async (aba, titulo) => {
    await abre(`#/mercado/${aba}`);
    await screen.findAllByText(titulo);
    semLixo();
  });
});

describe("calculadoras", () => {
  it("cota cancelada: o exemplo dá o valor que a conta independente dá", async () => {
    await abre("#/calculadoras/cancelada");
    // R$ 50.000 em 24 meses, IPCA+ de 7,76% (ponta mais curta da curva) + 5 p.p. de spread: 50000 / 1,1276^2
    expect((await screen.findAllByText("R$ 39.324,20")).length).toBeGreaterThan(0);
    semLixo();
  });

  it("retorno da oferta e cota ativa abrem com resultado", async () => {
    await abre("#/calculadoras/oferta");
    await screen.findByText(/Esta oferta rende/);
    cleanup();
    await abre("#/calculadoras/ativa");
    await screen.findByText(/A cota vale hoje/);
    semLixo();
  });

  it("um campo com texto inválido avisa e não muda o resultado", async () => {
    await abre("#/calculadoras/cancelada");
    const campo = screen.getByLabelText(/Valor que o grupo vai devolver/) as HTMLInputElement;
    fireEvent.change(campo, { target: { value: "abc" } });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(textoDaPagina()).toMatch(/R\$ 39\.324,20/);
  });
});

describe("bastidores", () => {
  it("robô: mostra o veredito e as rodadas do GitHub", async () => {
    await abre("#/bastidores/robo");
    await screen.findByRole("heading", { name: /rodadas/ });
    await waitFor(() => expect(screen.getAllByRole("link", { name: /rodada agendada/ }).length).toBe(3));
    expect(textoDaPagina()).toMatch(/Rodadas com sucesso/);
    semLixo();
  });

  it("fontes: diz qual fonte falhou, sem confundir com dia incompleto", async () => {
    await abre("#/bastidores/fontes");
    await screen.findByText(/fontes com problema nesta foto/);
    expect(textoDaPagina()).toMatch(/Nenhuma é essencial/);
    semLixo();
  });

  it("dicionário: lista os 19 termos e a busca filtra", async () => {
    await abre("#/bastidores/dicionario");
    await screen.findByText("Spread de risco");
    expect(document.querySelectorAll("dt")).toHaveLength(19);
    fireEvent.change(screen.getByPlaceholderText(/Buscar um termo/), { target: { value: "quartil" } });
    await waitFor(() => expect(document.querySelectorAll("dt").length).toBeLessThan(5));
  });
});

describe("precatório e acesso rápido às calculadoras", () => {
  it("o exemplo do precatório (Selic, 36 meses, spread 5) dá o valor da conta independente, e a oferta rende 31,34% ao ano", async () => {
    await abre("#/calculadoras/precatorio");
    // R$ 100.000 × 1,135^(2/12) × 1,1175 × 1,1 × 1,1^(10/12) = R$ 135.925,24, descontado a 14,93% + 5 p.p. por 3 anos
    expect((await screen.findAllByText("R$ 78.802,76")).length).toBeGreaterThan(0);
    expect(textoDaPagina()).toMatch(/R\$ 135\.925,24/);
    expect(textoDaPagina()).toMatch(/31,34% ao ano/);
    semLixo();
  });

  it("o prazo pode ser uma data: 10/2029 é o mesmo que 36 meses, e 10/2030 são 48 meses (R$ 71.906,68)", async () => {
    await abre("#/calculadoras/precatorio");
    fireEvent.click(screen.getByRole("radio", { name: "Data" }));
    const campo = screen.getByLabelText(/Quando é pago: mês e ano/);
    fireEvent.change(campo, { target: { value: "2029-10" } });
    expect((await screen.findAllByText("R$ 78.802,76")).length).toBeGreaterThan(0);
    fireEvent.change(campo, { target: { value: "2030-10" } });
    expect((await screen.findAllByText("R$ 71.906,68")).length).toBeGreaterThan(0); // 48 meses, conta independente
    expect(textoDaPagina()).toMatch(/R\$ 149\.517,76/);
  });

  it("um spread só desta conta muda o resultado sem mexer no painel", async () => {
    await abre("#/calculadoras/precatorio");
    fireEvent.click(screen.getByRole("switch", { name: /Usar outro spread só nesta conta/ }));
    fireEvent.change(await screen.findByRole("textbox", { name: "Spread desta conta" }), { target: { value: "10" } });
    expect((await screen.findAllByText("R$ 69.714,59")).length).toBeGreaterThan(0);
  });

  it("os valores digitados ficam guardados e a calculadora usada por último vira o atalho", async () => {
    await abre("#/calculadoras/oferta");
    const campo = screen.getByRole("textbox", { name: "Preço da oferta" }) as HTMLInputElement;
    fireEvent.change(campo, { target: { value: "41.000" } });
    cleanup();
    await abre("#/calculadoras/oferta");
    expect((screen.getByRole("textbox", { name: "Preço da oferta" }) as HTMLInputElement).value).toBe("41.000,00");
    // a barra do celular leva para a última calculadora
    const calcular = screen.getAllByRole("link", { name: /Calcular/ }).find((a) => a.closest("nav")?.className.includes("fixed")) as HTMLAnchorElement;
    expect(calcular.getAttribute("href")).toBe("#/calculadoras/oferta");
    fireEvent.click(screen.getByRole("button", { name: "Voltar aos exemplos" }));
    expect((screen.getByRole("textbox", { name: "Preço da oferta" }) as HTMLInputElement).value).toBe("38.000,00");
  });

  it("um valor guardado estragado não derruba a tela: volta ao exemplo", async () => {
    localStorage.setItem("radar-calc-cancelada", JSON.stringify({ valor: "abc", meses: null, corrigido: 7, preco: Infinity }));
    await abre("#/calculadoras/cancelada");
    expect((await screen.findAllByText("R$ 39.324,20")).length).toBeGreaterThan(0);
  });

  it("o menu Calcular, em qualquer tela, lista as calculadoras e a lista de várias cotas", async () => {
    await abre("#/mercado/tesouro");
    fireEvent.click(screen.getByRole("button", { name: "Abrir as calculadoras" }));
    const menu = await screen.findByText("Retorno de uma oferta", { selector: "span" });
    const lista = menu.closest("ul") as HTMLElement;
    expect(within(lista).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["#/calculadoras/cancelada", "#/calculadoras/ativa", "#/calculadoras/oferta", "#/calculadoras/precatorio", "#/calculadoras/lote"]);
  });

  it("copiar resumo põe o texto da conta na área de transferência", async () => {
    const escreve = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText: escreve }, configurable: true });
    await abre("#/calculadoras/precatorio");
    fireEvent.click(await screen.findByRole("button", { name: /Copiar resumo/ }));
    await waitFor(() => expect(escreve).toHaveBeenCalled());
    const texto = (escreve.mock.calls as unknown as string[][])[0][0];
    expect(texto).toMatch(/Radar Pricing · Precatório · foto de 31\/10\/2026/);
    expect(texto).toMatch(/R\$ 78\.802,76/);
    expect(texto).toMatch(/não é preço nem recomendação/);
  });

  it("cota cancelada e cota ativa aceitam um preço pedido e dizem se cabe", async () => {
    await abre("#/calculadoras/cancelada");
    fireEvent.click(screen.getByRole("switch", { name: /Tenho um preço pedido/ }));
    expect(await screen.findByText(/O preço cabe: sobram R\$ 1\.324,20/)).toBeTruthy(); // 39.324,20 − 38.000
    cleanup();
    await abre("#/calculadoras/ativa");
    fireEvent.click(screen.getByRole("switch", { name: /Tenho um preço pedido/ }));
    expect(await screen.findByText(/O ágio pedido, nas duas bases/)).toBeTruthy();
    expect(textoDaPagina()).toMatch(/20,0% do crédito e 17,5% do saldo devedor/);
  });
});

describe("taxa própria na cota cancelada e várias cotas de uma vez", () => {
  it("cota cancelada: 'por uma taxa que eu informo' faz o valor crescer e descontar pela curva Prefixada", async () => {
    await abre("#/calculadoras/cancelada");
    fireEvent.change(screen.getByRole("combobox", { name: /Como o valor é corrigido/ }), { target: { value: "propria" } });
    expect((await screen.findAllByText("R$ 38.468,00")).length).toBeGreaterThan(0); // 50.000 a 5% a.a. por 2 anos = 55.125, descontado a 19,71%
    expect(textoDaPagina()).toMatch(/que viram R\$ 55\.125 em 2 anos/);
    fireEvent.change(screen.getByRole("textbox", { name: "Taxa de correção" }), { target: { value: "0" } });
    expect((await screen.findAllByText("R$ 34.891,61")).length).toBeGreaterThan(0); // 0%: o mesmo que sem correção (50.000 a 19,71%, conta feita à mão)
    semLixo();
  });

  it("prazo curto: o aviso diz a faixa da curva e as taxas usadas nas pontas, e some com um prazo dentro da curva", async () => {
    await abre("#/calculadoras/cancelada");
    expect(textoDaPagina()).toMatch(/O Tesouro só tem vencimentos de 2,5 a 23,8 anos\. O que cai fora dessa faixa usa a taxa do vencimento mais próximo \(7,76% no mais curto, 7,13% no mais longo\)/);
    expect(textoDaPagina()).toMatch(/quadro do spread mostra quanto 1 p\.p\. a mais ou a menos muda o valor/);
    fireEvent.change(screen.getByRole("textbox", { name: "Quando o grupo devolve em meses" }), { target: { value: "60" } });
    await waitFor(() => expect(textoDaPagina()).not.toMatch(/O Tesouro só tem vencimentos/));
  });

  it("a taxa própria entra no resumo copiado", async () => {
    const escreve = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText: escreve }, configurable: true });
    await abre("#/calculadoras/cancelada");
    fireEvent.change(screen.getByRole("combobox", { name: /Como o valor é corrigido/ }), { target: { value: "propria" } });
    fireEvent.click(await screen.findByRole("button", { name: /Copiar resumo/ }));
    await waitFor(() => expect(escreve).toHaveBeenCalled());
    expect((escreve.mock.calls as unknown as string[][])[0][0]).toMatch(/corrigido a 5,00% ao ano/);
  });

  it("várias cotas: abre com o exemplo calculado, com a mesma conta da calculadora de uma cota", async () => {
    await abre("#/calculadoras/lote");
    const tabela = await screen.findByRole("table", { name: /Resultado de cada cota da lista \(cotas canceladas\)/ });
    expect(within(tabela).getAllByRole("row")).toHaveLength(5); // cabeçalho + 4 cotas
    expect(within(tabela).getAllByText("R$ 39.324,20").length).toBeGreaterThan(0); // igual ao exemplo da cota cancelada
    expect((await screen.findAllByText("R$ 180.882,65")).length).toBeGreaterThan(0); // a soma
    expect(textoDaPagina()).toMatch(/Cabem no preço pedido\s*2 de 2/);
    semLixo();
  });

  it("várias cotas: uma linha ruim avisa o que está errado e não derruba as outras", async () => {
    await abre("#/calculadoras/lote");
    fireEvent.change(screen.getByRole("textbox", { name: /Cole a lista/ }), { target: { value: "0;24\n50.000;24;ipca;38.000;0\n50.000;24;xyz" } });
    const tabela = await screen.findByRole("table", { name: /Resultado de cada cota/ });
    await waitFor(() => expect(within(tabela).getAllByRole("row")).toHaveLength(4));
    expect(within(tabela).getByText("valor a devolver inválido")).toBeTruthy();
    expect(within(tabela).getByText("correção: use ipca, sem ou uma taxa em % ao ano")).toBeTruthy();
    expect(within(tabela).getAllByText("R$ 39.324,20").length).toBeGreaterThan(0);
    expect(textoDaPagina()).toMatch(/2 com erro/);
    semLixo();
  });

  it("várias cotas: trocar para cotas ativas usa o exemplo delas, e cada lista fica guardada", async () => {
    await abre("#/calculadoras/lote");
    fireEvent.click(screen.getByRole("radio", { name: "Cotas ativas" }));
    expect((await screen.findAllByText("R$ 78.805,94")).length).toBeGreaterThan(0); // a soma das três cotas ativas do exemplo
    fireEvent.change(screen.getByRole("textbox", { name: /Cole a lista/ }), { target: { value: "100.000;1.900;60;12" } });
    expect((await screen.findAllByText("R$ 3.443,01")).length).toBeGreaterThan(0); // o exemplo da cota ativa
    cleanup();
    await abre("#/calculadoras/lote");
    expect((screen.getByRole("textbox", { name: /Cole a lista/ }) as HTMLTextAreaElement).value).toBe("100.000;1.900;60;12");
    fireEvent.click(screen.getByRole("button", { name: "Voltar aos exemplos" }));
    expect((screen.getByRole("textbox", { name: /Cole a lista/ }) as HTMLTextAreaElement).value).toContain("50.000;24;ipca");
  });

  it("os Bastidores não mostram o nome interno da série da ABAC", async () => {
    await abre("#/bastidores/fontes");
    await screen.findByText(/Fontes da foto e a situação de cada uma/);
    expect(textoDaPagina()).not.toMatch(/abac_ticket_medio/);
    expect(textoDaPagina()).toMatch(/não encontrei ticket médio/);
  });
});

describe("pente fino final (o que um diretor repara ao usar o site publicado)", () => {
  it("o R$ do topo diz com que spread foi calculado, e o 'exemplo' some quando a pessoa põe o dela", async () => {
    await abre("#/briefing");
    expect(textoDaPagina()).toMatch(/por cada R\$ 1\.000, com spread de risco de 5,0 p\.p\., de exemplo\)/);
    await waitFor(() => expect(textoDaPagina()).toMatch(/Em cada prazo, com spread de risco de 5,0 p\.p\. \(exemplo\)\. Variação em %\./));
    fireEvent.change(screen.getByRole("textbox", { name: /Spread de risco/ }), { target: { value: "7" } });
    await waitFor(() => expect(textoDaPagina()).toMatch(/com spread de risco de 7,0 p\.p\.\)/));
    expect(textoDaPagina()).not.toMatch(/7,0 p\.p\., de exemplo/);
    await waitFor(() => expect(textoDaPagina()).toMatch(/Em cada prazo, com spread de risco de 7,0 p\.p\. Variação em %\./));
    expect(textoDaPagina()).not.toMatch(/p\.p\.\./);
    expect(textoDaPagina()).not.toMatch(/7,0 p\.p\. \(exemplo\)/);
  });

  it("o spread escolhido fica guardado entre as visitas, e voltar ao padrão limpa o que foi guardado", async () => {
    await abre("#/calculadoras/cancelada");
    (document.querySelector("main details") as HTMLDetailsElement).open = true;
    fireEvent.change(screen.getByRole("textbox", { name: "Spread de risco" }), { target: { value: "7" } });
    await waitFor(() => expect(localStorage.getItem("radar-spread")).toBe("7"));
    cleanup();
    await abre("#/calculadoras/cancelada");
    expect(textoDaPagina()).toMatch(/do painel: 7,0 p\.p\.\s*\(o seu\)/);
    (document.querySelector("main details") as HTMLDetailsElement).open = true;
    fireEvent.click(screen.getByRole("button", { name: /Voltar para 5,0 p\.p\./ }));
    await waitFor(() => expect(localStorage.getItem("radar-spread")).toBeNull());
    expect(textoDaPagina()).toMatch(/do painel: 5,0 p\.p\.\s*\(exemplo\)/);
  });

  it("o resumo copiado não chama de exemplo o spread que a pessoa escolheu", async () => {
    const escreve = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText: escreve }, configurable: true });
    localStorage.setItem("radar-spread", "7");
    await abre("#/calculadoras/precatorio");
    fireEvent.click(await screen.findByRole("button", { name: /Copiar resumo/ }));
    await waitFor(() => expect(escreve).toHaveBeenCalled());
    const texto = (escreve.mock.calls as unknown as string[][])[0][0];
    expect(texto).toMatch(/Spread de risco: 7,0 p\.p\./);
    expect(texto).not.toMatch(/7,0 p\.p\. \(exemplo\)/);
  });

  it("um spread guardado estragado é ignorado", async () => {
    localStorage.setItem("radar-spread", "abc");
    await abre("#/calculadoras/cancelada");
    expect(textoDaPagina()).toMatch(/do painel: 5,0 p\.p\.\s*\(exemplo\)/);
    cleanup();
    localStorage.setItem("radar-spread", "-3");
    await abre("#/calculadoras/cancelada");
    expect(textoDaPagina()).toMatch(/do painel: 5,0 p\.p\.\s*\(exemplo\)/);
  });

  it("o briefing não gasta uma linha do 'o que mexeu' com fonte complementar fora do ar (isso é assunto dos Bastidores)", async () => {
    await abre("#/briefing");
    expect(screen.getByText("O que mexeu na semana")).toBeTruthy();
    expect(textoDaPagina()).not.toMatch(/fonte complementar sem resposta/);
    cleanup();
    await abre("#/bastidores/fontes");
    expect((await screen.findAllByText(/IBGE/)).length).toBeGreaterThan(0);
  });

  it("as variações da ABAC dizem a unidade (milhões, R$ bilhões)", async () => {
    await abre("#/briefing");
    await screen.findByText(/Volume de vendas no ano/);
    expect(textoDaPagina()).toMatch(/0,38 milhões\s*no mês/);
    expect(textoDaPagina()).toMatch(/64,54 R\$ bilhões\s*no mês/);
  });

  it("a oferta com custos mostra o deságio do preço e o deságio contando os custos", async () => {
    await abre("#/calculadoras/oferta");
    expect(textoDaPagina()).toMatch(/deságio é de 24,0%\./);
    fireEvent.change(screen.getByRole("textbox", { name: "Custos de transferência" }), { target: { value: "1.200" } });
    await waitFor(() => expect(textoDaPagina()).toMatch(/deságio é de 24,0% sobre o preço \(21,6% contando os custos\)/));
  });
});

describe("tema", () => {
  it("o botão troca entre claro e escuro", async () => {
    await abre("#/briefing");
    fireEvent.click(screen.getByRole("button", { name: /Mudar para o tema escuro/ }));
    expect(document.documentElement.getAttribute("data-tema")).toBe("escuro");
    fireEvent.click(screen.getByRole("button", { name: /Mudar para o tema claro/ }));
    expect(document.documentElement.getAttribute("data-tema")).toBe("claro");
  });
});
