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

  it("o menu Calcular, em qualquer tela, lista as quatro calculadoras", async () => {
    await abre("#/mercado/tesouro");
    fireEvent.click(screen.getByRole("button", { name: "Abrir as calculadoras" }));
    const menu = await screen.findByText("Retorno de uma oferta", { selector: "span" });
    const lista = menu.closest("ul") as HTMLElement;
    expect(within(lista).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["#/calculadoras/cancelada", "#/calculadoras/ativa", "#/calculadoras/oferta", "#/calculadoras/precatorio"]);
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

describe("tema", () => {
  it("o botão troca entre claro e escuro", async () => {
    await abre("#/briefing");
    fireEvent.click(screen.getByRole("button", { name: /Mudar para o tema escuro/ }));
    expect(document.documentElement.getAttribute("data-tema")).toBe("escuro");
    fireEvent.click(screen.getByRole("button", { name: /Mudar para o tema claro/ }));
    expect(document.documentElement.getAttribute("data-tema")).toBe("claro");
  });
});
