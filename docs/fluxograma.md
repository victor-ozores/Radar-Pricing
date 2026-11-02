# Fluxogramas do Radar Pricing

Aqui está o caminho completo, do dado público até o número na tela. Cada desenho confere com o código: o nome do arquivo que faz cada passo está nas legendas. Os desenhos são em [Mermaid](https://mermaid.js.org/), que o GitHub mostra direto na página.

1. [Visão geral](#1-visão-geral)
2. [A rodada diária do robô](#2-a-rodada-diária-do-robô)
3. [Dentro da coleta: da fonte à foto](#3-dentro-da-coleta-da-fonte-à-foto)
4. [A foto no navegador: do arquivo à tela](#4-a-foto-no-navegador-do-arquivo-à-tela)
5. [O número do dia: como o valor de hoje é calculado](#5-o-número-do-dia-como-o-valor-de-hoje-é-calculado)
6. [O robô travou? Como o painel decide](#6-o-robô-travou-como-o-painel-decide)
7. [Do código ao site: testes e publicação](#7-do-código-ao-site-testes-e-publicação)

---

## 1. Visão geral

Três partes que não se falam diretamente: o **robô** (Python, roda no GitHub Actions), a **branch `data`** (onde ficam as fotos, uma por dia) e o **painel** (React, roda no navegador de quem abre). O painel só *lê* arquivos; o robô nem sabe que o painel existe.

```mermaid
flowchart TD
    FONTES["1. Sete fontes públicas e oficiais<br/>Banco Central: Selic, CDI, IPCA, Focus, taxas por banco e Panorama<br/>Tesouro Nacional: taxas dos títulos<br/>ABAC: vendas do setor · IBGE: só conferência do IPCA"]

    subgraph ROBO["2. Robô diário no GitHub Actions"]
        R1["Coleta as 7 fontes em paralelo"] --> R2["Calcula os derivados:<br/>curvas, valor presente, variações"]
        R2 --> R3["Marca o que mudou no dia"]
        R3 --> R4["Monta a foto do dia<br/>JSON e CSV"]
    end

    DATA[("Branch data<br/>uma foto por dia, nunca reescrita")]
    HC["Healthchecks<br/>vigia externo: avisa por e-mail<br/>se o robô não rodar"]

    subgraph NAV["3. Painel, no navegador de quem abre"]
        P1["Baixa a foto mais nova<br/>direto do GitHub"] --> P2["Contas, histórico e frases<br/>em JavaScript"]
        P2 --> P3["Telas: Briefing, Mercado,<br/>Calculadoras e Bastidores"]
        P2 --> P4["Excel gerado na hora,<br/>com fórmulas"]
    end

    FONTES --> ROBO
    R4 -->|"publica"| DATA
    ROBO -.->|"avisa início, sucesso ou falha"| HC
    DATA -->|"raw.githubusercontent.com"| P1
    API["API pública do GitHub Actions<br/>rodadas do robô"] -.->|"para o selo e o 'robô travou?'"| P3

    classDef fonte fill:#e1eee8,stroke:#0b5d4b,color:#15211e
    classDef robo fill:#f6ead0,stroke:#8f6314,color:#15211e
    classDef painel fill:#e3edfa,stroke:#1757ac,color:#15211e
    class FONTES fonte
    class R1,R2,R3,R4 robo
    class P1,P2,P3,P4 painel
```

**Por que assim.** O robô grava na branch `data` com o `GITHUB_TOKEN`, e um envio feito com esse token **não dispara outros workflows**. Se o site precisasse ser publicado de novo a cada coleta, o robô não conseguiria fazer isso sozinho. Do jeito que está, o site só é publicado quando eu mudo a página.

---

## 2. A rodada diária do robô

Arquivo: [`.github/workflows/coleta-diaria.yml`](../.github/workflows/coleta-diaria.yml). Roda de segunda a sexta às 10h17 de Brasília (13h17 UTC) e também à mão.

```mermaid
flowchart TD
    A(["Começa: cron 13h17 UTC<br/>ou clique em Run workflow"]) --> B["Avisa o Healthchecks: início"]
    B --> C["Prepara a branch data<br/>cria vazia na 1ª vez, baixa nas outras"]
    C --> D{"A foto de hoje<br/>já existe?"}
    D -->|"sim"| Z1["Pula a coleta, sem erro<br/>rodar duas vezes no mesmo dia é seguro"]
    Z1 --> I
    D -->|"não"| E["Coleta as 7 fontes<br/>em paralelo, cada uma isolada"]
    E --> F{"Todas as fontes<br/>essenciais vieram OK?"}
    F -->|"sim"| H
    F -->|"não: dia parcial"| G["Espera 20 minutos<br/>e coleta de novo, uma vez só"]
    G --> G2["Fica com a tentativa<br/>que teve mais fontes OK"]
    G2 --> H["Grava a foto do dia<br/>JSON e CSV, data de Brasília"]
    H --> I["Publica na branch data"]
    I --> J{"O envio tenta alterar<br/>ou apagar foto antiga?"}
    J -->|"sim"| Z2(["Recusado antes de sair<br/>do servidor: a rodada falha"])
    J -->|"não"| K["Resumo da coleta<br/>na página da rodada"]
    K --> L{"O dia ficou parcial<br/>mesmo depois da 2ª tentativa?"}
    L -->|"sim"| M["A foto fica publicada,<br/>com status parcial e o que faltou"]
    M --> N(["Marca a rodada como falha<br/>e avisa o Healthchecks: fail"])
    L -->|"não"| O(["Rodada verde<br/>e avisa o Healthchecks: sucesso"])

    HC2["Se o robô nem rodar,<br/>o Healthchecks avisa por e-mail<br/>depois de 8 h de tolerância"] -.-> B

    classDef fim fill:#e1eee8,stroke:#0b5d4b,color:#15211e
    classDef ruim fill:#fbe4e1,stroke:#b42318,color:#15211e
    classDef decisao fill:#f6ead0,stroke:#8f6314,color:#15211e
    class O fim
    class N,Z2 ruim
    class D,F,J,L decisao
```

O que o desenho mostra de importante: **uma fonte que cai não derruba as outras**, **o dia parcial é publicado de qualquer jeito** (com o aviso do que faltou) e **uma foto publicada nunca é alterada**.

---

## 3. Dentro da coleta: da fonte à foto

Arquivos: [`src/radar_pricing/coleta.py`](../src/radar_pricing/coleta.py), [`derivados.py`](../src/radar_pricing/derivados.py), [`mudancas.py`](../src/radar_pricing/mudancas.py), [`foto.py`](../src/radar_pricing/foto.py).

```mermaid
flowchart TD
    subgraph UMA["Para cada fonte (até 4 ao mesmo tempo)"]
        direction TB
        U1["Chama a fonte<br/>até 3 tentativas, 90 s cada<br/>IBGE: 2 tentativas, 20 s"]
        U1 --> U2{"Veio algum registro,<br/>sem erro?"}
        U2 -->|"não"| U3["Situação: falhou"]
        U2 -->|"sim"| U4{"Alguma parte<br/>falhou?"}
        U4 -->|"sim"| U5["Situação: parcial"]
        U4 -->|"não"| U6{"Dado mais velho<br/>que o limite da fonte?"}
        U6 -->|"sim"| U7["Situação: atrasado"]
        U6 -->|"não"| U8["Situação: ok"]
    end

    UMA --> V["Junta os registros<br/>fonte, série, dimensão, data, valor"]
    V --> W["Conferências entre fontes<br/>IPCA do IBGE contra o do BCB,<br/>observações repetidas"]
    subgraph DER["Derivados (derivados.py)"]
        direction TB
        X1["Curva do Tesouro Prefixado<br/>e do IPCA+ na data mais nova"]
        X2["Âncoras: CDI anualizado<br/>e taxa de cada prazo por interpolação"]
        X3["Valor presente de R$ 1.000<br/>em 6, 12, 24, 36 e 48 meses"]
        X4["Variação em 1, 7 e 30 dias<br/>de cada série"]
        X5["Setor: cada métrica do Panorama<br/>contra o trimestre anterior"]
        X1 --> X2 --> X3 --> X4 --> X5
    end
    V --> DER
    DER --> Y["Mudanças do dia (mudancas.py)<br/>regras com limiar em pontos percentuais"]
    W --> Y
    H1["Foto anterior<br/>(historico.py)"] --> Y
    Y --> S{"Todas as fontes essenciais<br/>estão ok?"}
    S -->|"sim"| T1["Status do dia: ok"]
    S -->|"não"| T2["Status do dia: parcial"]
    T1 --> FIM["Foto do dia<br/>AAAA-MM-DD.json e .csv"]
    T2 --> FIM
```

**Papel de cada fonte** (arquivo [`config.toml`](../config.toml)): *essenciais* são BCB SGS, Focus, taxas de crédito, Panorama e Tesouro; *complementares* são IBGE e ABAC. Se uma essencial falta ou está atrasada, o dia sai parcial; se uma complementar falta, o dia continua ok e o painel só diz que ela não respondeu.

---

## 4. A foto no navegador: do arquivo à tela

Arquivos em [`site/`](../site): `js/foto.js` (busca), `src/dados.tsx` (estado), `js/modelo.js`, `js/historico.js`, `js/calc.js`, `js/leitura.js`, `js/narrativa.js` (contas e frases) e `src/telas/` (telas).

**4a. Como o painel acha a foto.** Hoje de manhã a foto de hoje ainda pode não existir (fim de semana, feriado, robô atrasado), então ele volta dia a dia.

```mermaid
flowchart TD
    A(["Alguém abre o painel"]) --> B["Calcula a data de hoje em Brasília"]
    B --> C["Tenta baixar a foto desse dia<br/>raw.githubusercontent.com"]
    C --> D{"Existe?<br/>o GitHub responde 404 se não"}
    D -->|"sim"| G{"O formato é o que o painel<br/>conhece? versão 1"}
    G -->|"sim"| H(["Foto na memória:<br/>desenha as telas"])
    G -->|"não"| ERRO
    D -->|"não"| E{"Já voltou 10 dias?"}
    E -->|"não"| F["Tenta o dia anterior"]
    F --> C
    E -->|"sim"| ERRO(["Mostra 'não achei foto'<br/>e o botão de tentar de novo"])

    classDef erro fill:#fbe4e1,stroke:#b42318,color:#15211e
    classDef ok fill:#e1eee8,stroke:#0b5d4b,color:#15211e
    class ERRO erro
    class H ok
```

**4b. O que ele faz com a foto.** Nada é calculado no servidor: as contas, o histórico e as frases saem da foto, no navegador.

```mermaid
flowchart TD
    H["Foto na memória"] --> CONTAS
    S["Spread de risco<br/>escolhido pela pessoa"] --> CONTAS

    subgraph CONTAS["Contas e leitura (site/js)"]
        direction LR
        M1["modelo.js<br/>manchetes, curvas,<br/>crédito, setor, fontes"]
        M2["historico.js<br/>séries no tempo<br/>da própria foto"]
        M3["calc.js<br/>valor presente, impacto em 7 dias,<br/>sensibilidade, calculadoras"]
    end

    CONTAS --> N["narrativa.js e leitura.js<br/>títulos e frases só com números da foto"]
    N --> TELAS

    subgraph TELAS["Telas (site/src/telas)"]
        direction LR
        T1["Briefing"]
        T2["Mercado"]
        T3["Calculadoras"]
        T4["Bastidores"]
    end

    H --> XL["Excel: excel.js monta o .xlsx<br/>com fórmulas, no navegador"]
    API["API pública do GitHub Actions<br/>rodadas do robô"] -.->|"selo do topo e<br/>'o robô travou?'"| TELAS
```

O **spread de risco** (5 p.p. de exemplo) é uma premissa só: trocar em uma tela refaz as contas em todas.

---

## 5. O número do dia: como o valor de hoje é calculado

Arquivo: [`site/js/calc.js`](../site/js/calc.js) (`interpola`, `valorPresente`, `impactoNoPrazo`). A mesma conta está escrita em Python em [`derivados.py`](../src/radar_pricing/derivados.py) e [`prazo.py`](../src/radar_pricing/prazo.py) (a contagem de dias úteis, também em [`prazo.js`](../site/js/prazo.js)), e um teste compara as duas ao centavo.

```mermaid
flowchart TD
    A["Taxa de compra de cada vencimento<br/>do Tesouro, hoje"] --> B["Prazo de cada vencimento em anos<br/>dias úteis até o vencimento ÷ 252"]
    B --> C["Curva: taxa por prazo"]
    C --> D["Interpola linearmente entre os dois<br/>vencimentos vizinhos do prazo pedido<br/>fora da curva usa a ponta mais próxima"]
    D --> E["Taxa do Tesouro para o prazo"]
    E --> F["+ spread de risco<br/>exemplo: 5 p.p."]
    F --> G["Taxa de desconto"]
    G --> H["Valor presente =<br/>valor a receber ÷ (1 + taxa de desconto)<br/>elevado ao prazo: dias úteis ÷ 252"]

    A2["Taxa de cada vencimento<br/>há 7 dias, guardada pelo robô"] --> B2["Mesma conta<br/>com a curva de 7 dias atrás"]
    B2 --> H2["Valor presente há 7 dias"]
    H --> I["Variação =<br/>valor hoje ÷ valor há 7 dias − 1"]
    H2 --> I
    I --> J(["Manchete: 'Um valor a receber em 3 anos<br/>vale hoje 5,2% menos do que há 7 dias'"])

    H --> K["Tabela de sensibilidade:<br/>a mesma conta com a taxa do Tesouro<br/>deslocada de −3 a +3 p.p."]

    classDef fim fill:#f6ead0,stroke:#8f6314,color:#15211e
    class J fim
```

**Convenções** (iguais no JavaScript, no Python e no Excel): taxa efetiva ao ano, capitalização composta, prazo em dias úteis (sem fins de semana nem feriados nacionais) ÷ 252, contado da data-base da curva até o mesmo dia do mês, N meses depois. O que segue um índice por calendário (a correção do precatório, a taxa própria) fica em meses corridos, 1 mês = 1/12 de ano. Valor corrigido pela inflação usa a curva **IPCA+** e o resultado fica em reais de hoje; valor sem correção usa a curva **Prefixada**.

---

## 6. O robô travou? Como o painel decide

Arquivo: [`site/js/saude.js`](../site/js/saude.js). O robô roda de segunda a sexta às 10h17; o GitHub pode atrasar o agendamento em algumas horas, por isso o painel dá 6 horas de folga antes de reclamar.

```mermaid
flowchart TD
    A["Agora, em Brasília"] --> B{"Hoje é dia útil e já passou<br/>10h17 + 6 horas de folga?"}
    B -->|"sim"| C["Foto esperada = a de hoje"]
    B -->|"não"| D["Foto esperada = a do último dia útil<br/>antes de hoje"]
    C --> E{"A foto mais nova que existe<br/>é mais velha que a esperada?"}
    D --> E
    E -->|"sim"| ATR(["Robô atrasado<br/>selo amarelo, diz quantos dias úteis faltam"])
    E -->|"não"| F{"A última rodada concluída<br/>no GitHub terminou com falha?"}
    F -->|"sim"| FAL(["Última rodada falhou<br/>selo vermelho"])
    F -->|"não, ou o GitHub<br/>não respondeu"| OK(["Robô em dia<br/>selo verde: Atualizado há X h"])

    classDef ok fill:#e1eee8,stroke:#17724f,color:#15211e
    classDef aviso fill:#fbefd2,stroke:#8a5a00,color:#15211e
    classDef erro fill:#fbe4e1,stroke:#b42318,color:#15211e
    class OK ok
    class ATR aviso
    class FAL erro
```

Se o GitHub não responder, o veredito vale só pela foto, e a tela diz que não conseguiu ver o histórico das rodadas. O Healthchecks (e-mail se o robô nem rodar) não aparece aqui: o painel não enxerga esse vigia.

---

## 7. Do código ao site: testes e publicação

Arquivos: [`ci.yml`](../.github/workflows/ci.yml) e [`pages.yml`](../.github/workflows/pages.yml).

```mermaid
flowchart TD
    A(["git push na main"]) --> CI
    A --> PG

    subgraph CI["ci.yml: Testes (a cada envio e pull request)"]
        direction TB
        C1["Ruff: erros e formato"] --> C2["Instala o painel<br/>npm ci --ignore-scripts"]
        C2 --> C3["Tipos, testes de contas e de telas<br/>e a construção do site"]
        C3 --> C4["npm audit<br/>só informa"]
        C4 --> C5["Pytest: 156 testes offline<br/>inclusive o JavaScript contra o robô"]
    end

    subgraph PG["pages.yml: Painel (só se algo em site/ mudou)"]
        direction TB
        P1["npm ci --ignore-scripts"] --> P2["Tipos"]
        P2 --> P3["Testes: contas e telas"]
        P3 --> P4{"Passaram?"}
        P4 -->|"não"| PX(["Não vai ao ar"])
        P4 -->|"sim"| P5["Constrói: site/dist"]
        P5 --> P6["Publica no GitHub Pages"]
    end

    P6 --> SITE(["victor-ozores.github.io/Radar-Pricing"])
    ROB(["Robô diário"]) -.->|"não dispara nada aqui:<br/>o token do Actions não aciona<br/>outros workflows"| PG

    classDef ruim fill:#fbe4e1,stroke:#b42318,color:#15211e
    classDef fim fill:#e1eee8,stroke:#0b5d4b,color:#15211e
    class PX ruim
    class SITE fim
```

Outro fluxo, **fora** do CI: [`scripts/verifica_fontes.py`](../scripts/verifica_fontes.py) testa cada fonte com chamada de verdade (workflow `verifica-fontes.yml`, só à mão), e [`scripts/confere_excel.py`](../scripts/confere_excel.py) abre o Excel de verdade no meu Windows para conferir as fórmulas.
