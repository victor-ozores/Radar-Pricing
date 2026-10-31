# O painel

O painel é uma página estática que mostra a foto mais recente que o robô guardou. Fica na pasta [`site/`](../site) e vai ao ar pelo GitHub Pages. Não tem servidor, banco de dados nem biblioteca de terceiros: HTML, CSS e JavaScript puros.

## Como ele pega os números

A página não é refeita a cada coleta. Quando alguém abre, o próprio navegador baixa o JSON da foto direto da branch `data`, em `raw.githubusercontent.com/victor-ozores/Radar-Pricing/data/fotos/AAAA-MM-DD.json`.

Medi isso em 31/10/2026 antes de decidir:

- a foto tem 321 KB e chega com **18 KB** (gzip);
- o endereço responde com `Access-Control-Allow-Origin: *`, inclusive quando o arquivo não existe (404), então o navegador deixa ler;
- o cache é de 5 minutos (`Cache-Control: max-age=300`).

Escolhi assim por um motivo prático: o robô grava na branch `data` com o `GITHUB_TOKEN`, e um envio feito com esse token **não dispara outros workflows**. Se o site precisasse ser publicado de novo a cada coleta, o robô não conseguiria fazer isso sozinho. Do jeito que está, o site só é publicado quando eu mudo a página, e o robô nem sabe que ele existe.

Para achar a foto mais nova, a página tenta a data de hoje em Brasília e volta dia a dia, até 10 dias (fim de semana e feriado não têm foto). Não uso a API do GitHub para listar a pasta, porque ela limita a 60 consultas por hora por endereço. Os botões "Foto anterior" e "Próxima foto" fazem a mesma busca, para um lado e para o outro.

Se a foto mais nova tem mais de 4 dias, a página avisa que o robô pode ter parado. Se uma fonte essencial falhou, avisa no topo. Se só a complementar falhou (hoje, o IBGE), diz qual.

## O que tem na página

| Bloco | O que mostra |
|---|---|
| Resumo do dia | Meta Selic, CDI anualizado, IPCA em 12 meses, a taxa do Tesouro para 3 anos (em R$ fixos e com IPCA), a mediana dos financiamentos de veículos e de imóveis, e a Selic e o IPCA esperados no Focus. Abaixo, as mudanças do dia que o robô detectou. |
| Custo do dinheiro | O único gráfico: as curvas do Tesouro Prefixado e do IPCA+ (taxa por prazo até o vencimento), com a tabela dos mesmos números. Depois, as expectativas do Focus e a Selic, o CDI e o IPCA do Banco Central. |
| Crédito concorrente | Taxas de financiamento imobiliário e de veículos por banco: menor, quartis, mediana e maior, e a lista dos bancos. |
| Setor de consórcio | O boletim mensal da ABAC e as 125 métricas do Panorama de Consórcios do Banco Central, contra o trimestre anterior. |
| Calculadora de valor presente | Valor, prazo e spread à escolha, na curva do Tesouro do dia. O spread de 5 p.p. é de demonstração. |
| Fontes e frescor | Cada fonte, se respondeu, quantos registros trouxe e a idade do último dado. Os botões do Excel e dos arquivos da foto. |

Só uso um gráfico porque a foto guarda janelas curtas de cada série; uma linha do tempo de poucos pontos não diria nada. O resto é número e tabela. O gráfico tem legenda, a dica ao passar o mouse (ou ao focar com Tab) e uma tabela com os mesmos números logo abaixo. As cores das duas linhas (azul e laranja) passaram pelo validador de paleta da skill de gráficos que uso, nos temas claro e escuro.

## A calculadora e o Excel

**Calculadora.** É a mesma conta que o robô faz em `derivados.py` (interpolação linear da curva e desconto composto), escrita de novo em JavaScript. Para não ficar com duas contas que divergem, `tests/test_site.py` roda as duas com a mesma foto em **4.800 combinações** de curva, prazo, spread e valor, e exige o mesmo resultado, ao centavo. Também confere que a tabela de 5 prazos que o robô grava na foto sai igual na calculadora.

**Excel.** É gerado no navegador, na hora, para o dia que a pessoa está vendo. Não guardo um arquivo por dia no repositório (um `.xlsx` não comprime e o repositório cresceria à toa). O arquivo tem uma aba por bloco da página, com a data e a fonte de cada número, e uma aba com todas as observações da foto, com filtro. Escrevi o gerador de `.xlsx` à mão (`site/js/xlsx.js`, um zip com os XMLs que o Excel exige) para não depender de CDN nem de biblioteca.

**O que ainda não sei:** testei o arquivo abrindo com o `openpyxl` e conferindo valores, formatos, filtro e linha congelada. **Não abri no Excel da Microsoft** nem no LibreOffice. O arquivo sai sem compressão (769 KB no dia 31/10, quase tudo da aba de observações).

## Segurança

- Todo texto que vem da foto entra na página por `textContent`, nunca por `innerHTML`.
- A página declara uma política de conteúdo (CSP) fechada: só scripts e estilos do próprio site, e só se conecta ao `raw.githubusercontent.com`.
- `?base=` (para apontar a página para outra pasta de fotos) só funciona em `localhost`. No site publicado a origem dos números é fixa, para ninguém montar um link que mostre números falsos.

## Rodar no meu computador

```bash
python -m http.server 8765
```

Na pasta do repositório, e abrir `http://localhost:8765/site/index.html`. Para ler fotos locais em vez das da branch `data`: `?base=/data_local`.

## Testes

```bash
node --test site/tests/*.test.mjs
python -m pytest tests/test_site.py
```

- 36 testes de JavaScript no Node (formatação, busca da foto, calculadora, medianas e quartis, gerador de Excel, eixos do gráfico).
- 5 testes em Python que rodam o JavaScript com uma foto de verdade (a mesma que o robô grava, a partir das respostas reais gravadas): calculadora contra o robô, medianas contra o robô, curvas e Panorama contra a foto, e o Excel aberto com o `openpyxl`.
- Quebrei o código de propósito, 25 vezes (divisor do desconto, spread ignorado, mediana, fuso de Brasília, escape do XML, data do Excel, linha de cabeçalho congelada, filtro, e outras), uma de cada vez. Os testes pegaram as 25. Em 4 delas rodei só os testes em Python, para ter certeza de que eles pegam sozinhos uma divergência entre o robô e o painel.

O `ci.yml` roda tudo isso a cada envio, com `EXIGE_NODE=1`: no CI, faltar o Node é falha, não pulo.

## Publicação

O workflow [`pages.yml`](../.github/workflows/pages.yml) publica `site/` (sem a pasta de testes) quando algo em `site/` muda na `main`, depois de rodar os testes de JavaScript. Precisa de uma configuração única no repositório: **Settings → Pages → Build and deployment → Source = GitHub Actions**.

## Limites que conheço

- Vi o painel só em um navegador baseado em Chromium (o do app em que desenvolvo), no tema escuro e no claro, em tela larga e simulando celular. Não testei Safari nem Firefox.
- Se o `raw.githubusercontent.com` ficar fora do ar, a página mostra uma mensagem e um botão para tentar de novo; não guarda cópia dos números.
- O limite de "mais de 4 dias" para o aviso de robô parado cobre um fim de semana com feriado; um feriadão maior vai gerar um aviso que não é problema.
