# O painel

O painel é um site estático que mostra a foto mais recente que o robô guardou. Fica na pasta [`site/`](../site) e vai ao ar pelo GitHub Pages. Não tem servidor nem banco de dados: o navegador baixa a foto direto do GitHub e desenha tudo. É feito com React, TypeScript e Vite; o GitHub Actions constrói e publica.

## Para que ele serve

Para quem precifica cotas de consórcio. Ele responde, todo dia útil, quatro perguntas:

1. **O que aconteceu hoje, em uma frase?** A manchete diz quanto mudou, em 7 dias, o valor de hoje de um dinheiro a receber em 3 anos.
2. **De onde vem isso?** Cinco capítulos contam a história na ordem em que o preço é formado: o custo do dinheiro, a curva de juros do Tesouro, quanto isso pesa no valor, o crédito que concorre e o setor.
3. **Quanto vale ou rende esta cota?** Três calculadoras: cota cancelada, retorno de uma oferta e cota ativa.
4. **Dá para confiar?** O robô está em dia, de onde vem cada número e o que cada termo quer dizer.

## As quatro telas

- **Briefing** é a história do dia, feita para ler de cima para baixo (e para imprimir em uma ou duas folhas). Abre com a manchete, os números do dia (cada um com a variação em 7 dias, uma linha do tempo pequena, a fonte e a data) e o que mexeu na semana. Depois vêm cinco capítulos, cada um com um título que diz a conclusão (montado só com números da foto), um ou mais gráficos e um quadro "o que isso significa para o preço":
  1. *O custo do dinheiro*: a Selic e o CDI nos últimos 30 ou 60 dias e a Selic que o mercado espera (Focus) contra 30 dias atrás.
  2. *A curva de juros do Tesouro*: a taxa de cada vencimento hoje, há 7 e há 30 dias.
  3. *Quanto isso pesa no valor*: quanto mudou o valor de hoje em cada prazo e uma tabela de sensibilidade (e se a taxa subir ou cair até 3 p.p.?). O spread de risco é um campo só, de exemplo, que refaz tudo.
  4. *O crédito que concorre*: a taxa de cada banco no financiamento de imóveis e de veículos, na mesma escala.
  5. *O setor*: o índice de exclusão, cotas ativas e excluídas, onde saíram mais cotas, inadimplência e custo no Panorama do Banco Central e o volume de vendas da ABAC.
- **Mercado** tem os números por trás da história: o Tesouro vencimento a vencimento (gráfico de 5 semanas e tabela), Selic, CDI, IPCA e Focus (inclusive a Selic esperada por reunião do Copom), o crédito por banco (mediana no tempo e tabela) e as 125 métricas do Panorama. As tabelas ordenam ao clicar no título, buscam, mudam de densidade, baixam em CSV e explicam cada coluna num balão.
- **Calculadoras**: cota cancelada, retorno de uma oferta e cota ativa, com "e se?" (prazos e spreads vizinhos), o gráfico do valor da cota por mês de contemplação e "como foi calculado" com a conta escrita com os números.
- **Bastidores** responde "dá para confiar?": o robô travou? (as últimas 14 rodadas e o veredito), de onde vêm os números (cada fonte e se respondeu), o dicionário (18 termos) e como foi feito (o caminho do número até a tela e o que o painel não é).

No topo, sempre: o selo do robô, o botão do Excel, imprimir, tema claro ou escuro, o link do código e as setas para ver a foto de outro dia. Não há rodapé.

Cada termo técnico no texto (Selic, spread, valor presente, quartil...) abre uma explicação curta ao passar o mouse, focar com Tab ou tocar. As explicações vêm do dicionário; um teste confere que todo termo usado existe e que todo termo do dicionário aparece em alguma tela.

## Por que mudei a pilha

As três primeiras versões (31/10 e 1/11/2026) eram HTML, CSS e JavaScript puros, sem biblioteca. Mostrei o resultado e ouvi que ainda parecia pobre: o visual copiava o do meu outro projeto, as tabelas eram simples, os balões eram poucos e faltava contar uma história. Concordei com a crítica e vi que o limite estava na ferramenta: tabela com ordenação e busca, balão que não sai da tela, gráfico com várias séries e animação são trabalho de biblioteca, não de quem escreve tudo à mão. Troquei a pilha e deixei de fora o que não ajudava:

| Biblioteca | Para quê |
|---|---|
| React 19 + TypeScript | Telas em componentes, com os tipos pegando erro antes de ir ao ar |
| Vite | Constrói o site para o GitHub Pages |
| Tailwind CSS 4 | Estilos num arquivo só, com duas paletas (claro e escuro) |
| Recharts | Gráficos de linha, barra e área com balão ao passar o mouse |
| TanStack Table | Ordenação, busca e colunas das tabelas |
| Radix UI | Balões, popovers e controles que funcionam com teclado e leitor de tela |
| Motion | Entrada suave da manchete e dos números (respeita "reduzir movimento") |
| Lucide | Ícones |
| Fontes Fraunces e Inter | Serifada nos títulos, sem serifa no texto; ficam no próprio site, sem CDN |

O que continua sendo código meu, sem biblioteca: as contas (`site/js/calc.js`), a leitura da foto (`modelo.js`, `historico.js`), as frases (`leitura.js`, `narrativa.js`), a saúde do robô (`saude.js`) e o gerador de Excel (`xlsx.js`, `folha.js`, `excel.js`). Mantive tudo isso em JavaScript simples, com os mesmos testes de antes, e as telas apenas chamam essas funções.

**Cuidado com as dependências.** Todas têm versão exata no `package.json` e no `package-lock.json`, e escolhi só versões publicadas há mais de 14 dias. O CI instala com `npm ci --ignore-scripts` (os pacotes não rodam código na instalação) e roda `npm audit` (0 vulnerabilidades em 01/11/2026). O código que chega ao navegador é só o que o Vite empacota: nada vem de CDN.

**Peso.** A primeira tela baixa cerca de 300 KB comprimidos (o gráfico, as telas e as contas), mais as fontes, que o navegador baixa só se precisar. Carreguei por demanda o gerador de Excel e as telas que não são o Briefing.

## Como ele pega os números

A página não é refeita a cada coleta. Quando alguém abre, o próprio navegador baixa o JSON da foto direto da branch `data`, em `raw.githubusercontent.com/victor-ozores/Radar-Pricing/data/fotos/AAAA-MM-DD.json`.

Medi isso em 31/10/2026 antes de decidir:

- a foto tem 321 KB e chega com **18 KB** (gzip);
- o endereço responde com `Access-Control-Allow-Origin: *`, inclusive quando o arquivo não existe (404), então o navegador deixa ler;
- o cache é de 5 minutos (`Cache-Control: max-age=300`).

Escolhi assim por um motivo prático: o robô grava na branch `data` com o `GITHUB_TOKEN`, e um envio feito com esse token **não dispara outros workflows**. Se o site precisasse ser publicado de novo a cada coleta, o robô não conseguiria fazer isso sozinho. Do jeito que está, o site só é publicado quando eu mudo a página, e o robô nem sabe que ele existe.

Para achar a foto mais nova, a página tenta a data de hoje em Brasília e volta dia a dia, até 10 dias (fim de semana e feriado não têm foto). As setas do topo fazem a mesma busca, para um lado e para o outro, e o endereço guarda o dia (`?data=AAAA-MM-DD`).

## O histórico que a foto já traz

Cada foto não guarda só o dia: o robô junta janelas de história das fontes. Na foto de 31/10/2026 há 24 dias de Tesouro (de 25/09 a 29/10, 15 vencimentos), 61 dias de Selic meta, 41 de CDI, 25 dias úteis de Focus (de 18/09 a 23/10), 6 janelas semanais de taxas de veículos (as que começaram de 02/10 a 09/10) e 3 meses de crédito imobiliário e de ABAC. Por isso os gráficos de evolução já funcionam desde o primeiro dia, sem esperar semanas de fotos.

Conferi as contas do histórico contra as do robô, com a foto de verdade: a âncora de 3 anos montada dia a dia termina igual à que o robô guardou (diferença menor que 0,00006 ponto percentual), e a taxa de 7 dias atrás de cada um dos 11 vencimentos bate exatamente com a referência que o robô gravou.

## O robô está em dia?

Duas fontes, que se completam:

1. **A foto.** O robô roda de segunda a sexta, por volta das 10h17 de Brasília. A página calcula qual foto já deveria existir agora: a de hoje, se hoje é dia útil e já passaram 6 horas do horário (no meu outro projeto o agendamento do GitHub chegou a atrasar 5,5 horas); senão, a do último dia útil. Se a foto mais nova é mais velha que isso, o selo fica amarelo ("Robô atrasado") e diz quantos dias úteis faltam.
2. **As rodadas do GitHub Actions.** A página consulta a API pública do GitHub (`.../actions/workflows/coleta-diaria.yml/runs`, 60 consultas por hora por endereço, com `Access-Control-Allow-Origin: *`) e desenha as últimas 14 rodadas: verde deu certo, vermelho falhou, âmbar está rodando. Uma rodada que falhou deixa o selo vermelho ("Última rodada falhou"). Se o GitHub não responder, a página avisa e segue com o que a foto diz.

O que **não** vejo daqui: o vigia externo (Healthchecks), que manda e-mail se o robô parar. A tela diz isso com todas as letras.

## Os gráficos

Todos têm título que diz o que mostram, balão ao passar o mouse (e ao focar com o teclado), legenda quando há mais de uma série e uma "tabela gêmea" com os mesmos números, que se abre embaixo.

| Gráfico | Onde | Para quê |
|---|---|---|
| Linhas: meta Selic e CDI | Briefing 1 | Ver quando a meta mudou |
| Linhas: Selic esperada (Focus), hoje contra 30 dias atrás | Briefing 1 | O que o mercado espera para os próximos anos |
| Linhas: curva do Tesouro hoje, há 7 e há 30 dias | Briefing 2 | Mostrar que a curva toda andou, e onde mais |
| Barras: quanto o valor mudou por prazo | Briefing 3 | Mostrar que prazo longo sofre mais |
| Mapa de calor: sensibilidade a −3...+3 p.p. | Briefing 3 | A pergunta "e se a taxa andar?" |
| Faixas: taxa de cada banco | Briefing 4 | Comparar imóvel e veículo na mesma escala |
| Rosca e barras: índice de exclusão, cotas ativas e excluídas, por segmento | Briefing 5 | O que está acontecendo nos grupos |
| Linhas: cada vencimento do Tesouro, 5 semanas | Mercado | Ver o dia a dia |
| Linhas: Focus dia a dia; Selic por reunião do Copom | Mercado | Como a expectativa mudou |
| Área e linha: mediana e miolo do crédito no tempo | Mercado | Ver se o crédito encareceu |

**Cores.** As cores das séries são quatro (azul, laranja, violeta e verde) e passaram pelo validador de paleta da skill de gráficos, uma vez para o fundo claro (`#fffdf8`) e outra para o escuro (`#121a19`): separação para quem tem daltonismo, contraste e faixa de luminosidade. Nos vencimentos do Tesouro (6 linhas) uso uma só cor, mais forte quanto mais longo o prazo, com legenda. Laranja quer dizer "taxa mais alta" e azul "taxa mais baixa" em todo o painel, sempre com seta e sinal além da cor.

**O que o índice de exclusão quer dizer.** O Banco Central publica o "índice de exclusão" e as cotas ativas e excluídas. Conferi com os números de jun/2026: 12.751,82 ÷ (13.376,26 + 12.751,82) = 48,8%, o mesmo que ele publica. Por isso o painel diz "de cada 100 cotas (ativas e excluídas), 49 já saíram do grupo".

## O número do dia e o que "mexe no preço"

O robô já guarda, para cada vencimento do Tesouro, a taxa de 7 dias atrás. Com ela monto a curva de uma semana antes, interpolo para o mesmo prazo e desconto o mesmo valor com a mesma taxa de risco (spread). A diferença é o efeito da semana. Não preciso de dado novo nem de mexer no robô.

O **spread** (5 p.p. de exemplo) é de demonstração e é uma premissa só: trocar em uma tela troca em todas, inclusive a manchete.

**Sensibilidade.** A tabela do capítulo 3 usa a mesma conta com a taxa do Tesouro deslocada de −3 a +3 p.p. em todos os prazos: valor de hoje de R$ 1.000 em cada prazo e quanto muda contra hoje. Serve para dizer "se a taxa subir 1 ponto, o valor cai X%" sem esperar o mercado andar. A taxa de desconto nunca fica abaixo de zero.

## As calculadoras

São modelos simples de **demonstração**. Usam só o que a pessoa digita e as curvas do Tesouro do dia. Nenhum dado de empresa. Os campos já vêm com valores inventados e aceitam número do jeito brasileiro ("50.000,50").

| Calculadora | Pergunta | Conta |
|---|---|---|
| **Cota cancelada** | Quanto vale hoje o valor que a administradora vai devolver no fim do grupo? | Valor ÷ (1 + taxa do Tesouro no prazo + spread)^(meses ÷ 12). Corrigido pela inflação: curva IPCA+, resultado em reais de hoje; senão, curva Prefixada. Mostra também prazos vizinhos e spreads vizinhos. |
| **Retorno de uma oferta** | Pagando X para receber Y em N meses, quanto rende ao ano? Qual o preço máximo para um retorno-alvo? | (Y ÷ X)^(12 ÷ N) − 1, comparado com o Tesouro do prazo (e com o CDI, se não for corrigido pela inflação). Preço máximo = Y ÷ (1 + alvo)^(N ÷ 12); sem alvo digitado, o alvo é o Tesouro + spread. Mostra o deságio. |
| **Cota ativa** | Quanto vale a cota de quem recebe o crédito quando for contemplada e continua pagando as parcelas? | Crédito descontado até o mês da contemplação, menos todas as parcelas descontadas, na curva IPCA+ mais o spread. Mostra o valor por mês de contemplação. |

Quando o prazo cai fora da faixa de vencimentos da curva do Tesouro, a calculadora avisa qual é a faixa e que usou a ponta mais próxima.

O que o modelo **não** considera: a chance de ser contemplada, lance, seguro, fundo de reserva, as regras de cada grupo e o risco de a administradora atrasar. Na cota ativa, um spread maior não derruba sempre o valor da cota: ele também encolhe as parcelas, que ficam mais longe que o crédito. Por isso a calculadora mostra os números do spread vizinho e não afirma uma direção.

Antes da primeira versão, eu tinha descartado fazer um "precificador de cota". O que existe agora não é isso: é uma conta transparente, com premissas públicas, que mostra o raciocínio. Preço de verdade depende de extratos, regras e histórico que só a empresa tem, e isso não entra neste repositório.

## O Excel

É gerado no navegador, na hora, para o dia que a pessoa está vendo (botão no topo; o gerador só é baixado quando alguém pede). Não guardo um arquivo por dia no repositório (um `.xlsx` não comprime e o repositório cresceria à toa). Escrevi o gerador de `.xlsx` à mão (`site/js/xlsx.js`, um zip com os XMLs que o Excel exige) para não depender de biblioteca.

**Um padrão só em todas as abas** (`site/js/folha.js`): título, subtítulo com a data da foto, uma frase dizendo para que serve a aba, seções e tabelas iguais; azul-marinho e cinza, amarelo só nas células de digitar e azul-claro só nos resultados. Doze abas: Leia-me (com um link para cada aba), Hoje, as três calculadoras, o cálculo mês a mês da cota ativa, Custo do dinheiro, Crédito concorrente, Setor, Mudanças, Fontes e Observações (os números brutos, com filtro).

**As calculadoras do Excel são fórmulas de verdade**, não valores colados: troque uma célula amarela e tudo se recalcula. O spread e o valor de referência são nomes (`Spread`, `ValorRef`) na aba Hoje. As células de digitar têm validação (número maior que zero, lista Sim/Não). Cada fórmula leva também o valor já calculado, para os leitores que não recalculam.

Como conferi (31/10/2026, Excel 16 no Windows, com `scripts/confere_excel.py`):

- o arquivo abre e **as 1.344 fórmulas, recalculadas pelo Excel, dão o mesmo valor que o painel guardou, sem nenhum erro**;
- troquei as células amarelas das três calculadoras por 8 conjuntos de valores diferentes e comparei o resultado do Excel com o do JavaScript do painel: **0 diferenças**;
- errei uma fórmula de propósito e o verificador pegou (3 células e um cenário diferentes, código de saída 1).

Isso roda no meu computador: precisa do Windows com o Excel. No CI, sem Excel, só confiro com o `openpyxl` que cada faixa e cada nome usado por uma fórmula cai em células com número. O gerador não mudou com a troca do painel; a tabela de sensibilidade e os gráficos de evolução existem só no painel, não no Excel.

**O que ainda não sei:** não abri o arquivo no Excel para Mac, no Excel Online, no Excel Mobile nem no LibreOffice, nem em versões antigas do Excel. O arquivo sai sem compressão (cerca de 1,2 MB).

## Segurança

- Todo texto que vem da foto entra na página pelo React, que escapa tudo; não uso `dangerouslySetInnerHTML`.
- A versão publicada declara uma política de conteúdo (CSP) fechada: só scripts, estilos e fontes do próprio site, e só se conecta ao `raw.githubusercontent.com` (as fotos) e ao `api.github.com` (as rodadas do robô). Não há script embutido na página (a escolha do tema é um arquivo à parte). Conferi na versão construída, no navegador, que a política está ativa e que nada é bloqueado: o painel desenha, os balões funcionam e o Excel baixa.
- `?base=` (para apontar a página para outra pasta de fotos) só funciona em `localhost`. No site publicado a origem dos números é fixa, para ninguém montar um link que mostre números falsos.

## Rodar no meu computador

```bash
cd site
npm ci
npm run dev
```

Abre em `http://localhost:5173` e lê as fotos da branch `data`. Para ler fotos locais: `?base=http://localhost:PORTA/pasta` (só em `localhost`). Para ver a versão construída, com a política de conteúdo: `npm run build && npm run preview`.

## Testes

```bash
cd site
npm run typecheck     # tipos
npm test              # contas e leitura (Node) + telas (vitest)
cd ..
python -m pytest tests/test_site.py
python scripts/confere_excel.py arquivo.xlsx foto.json --pdf pasta   # só no Windows com Excel
```

- **108 testes de contas e leitura**, no Node: formatação e leitura de número em português, busca da foto, as contas das calculadoras (conferidas contra fórmulas fechadas, como a anuidade), a sensibilidade, o que mudou em 7 dias, as frases da manchete e dos capítulos, o histórico (inclusive contra a foto de verdade), a saúde do robô, o monitor, o dicionário e o escritor de Excel.
- **13 testes das telas**, com o vitest e a foto de 31/10/2026: cada tela abre sem erro, a manchete e os títulos dos capítulos saem como esperado, a tabela do Tesouro ordena e filtra, o exemplo da cota cancelada dá o valor da conta independente (R$ 39.324,20), um campo inválido avisa, o robô mostra as rodadas, o dicionário filtra, o tema troca, e **nenhum texto vaza "NaN", "undefined" ou "null"**.
- **7 testes em Python** que rodam o JavaScript com uma foto de verdade (a que o robô grava, a partir das respostas reais gravadas): a calculadora contra o robô (4.800 combinações, ao centavo), as três calculadoras contra a mesma conta escrita de novo em Python em 192 combinações, medianas e curvas contra a foto, o Excel aberto com o `openpyxl` e a conferência das referências das fórmulas.
- Quebrei o código de propósito, 85 vezes em quatro rodadas (71 nas versões anteriores e 14 nesta, no histórico, na sensibilidade e nas frases): CDI com 365 dias em vez de 252, série fora de ordem, dia do alvo errado, prazo do título medido com 365 dias, quartil trocado pela mediana, spread ignorado, choque no sentido contrário, "subiu" e "caiu" trocados, frase que sempre promete "mais nos prazos longos", entre outras. Os testes pegaram todas; duas só na segunda tentativa, e cada uma ganhou um teste.

O `ci.yml` roda tudo isso (menos o Excel de verdade) a cada envio, com `EXIGE_NODE=1`: no CI, faltar o Node é falha, não pulo.

## Publicação

O workflow [`pages.yml`](../.github/workflows/pages.yml) instala as dependências, confere os tipos, roda os testes, constrói o site e publica `site/dist` quando algo em `site/` muda na `main`. A página só vai ao ar se tudo passar. Precisa de uma configuração única no repositório: **Settings → Pages → Build and deployment → Source = GitHub Actions** (já está).

## Limites que conheço

- Vi o painel só em um navegador baseado em Chromium (o do app em que desenvolvo), nos temas claro e escuro, em tela larga (1280 px) e simulando celular (375 px, sem rolagem lateral). Não testei Safari nem Firefox.
- Se o `raw.githubusercontent.com` ficar fora do ar, a página mostra uma mensagem e um botão para tentar de novo; não guarda cópia dos números. Se a API do GitHub passar do limite de consultas, o histórico de rodadas some e o selo vale pela foto.
- O histórico do robô começa curto: o GitHub só mostra as rodadas que ainda existem, e as primeiras foram de teste. A tira de 14 rodadas vai enchendo com os dias úteis.
- O histórico dos gráficos é o que cada foto traz (cerca de 5 semanas de Tesouro e 2 meses de Selic). Uma linha do tempo mais longa, juntando muitas fotos, só faz sentido depois de algumas semanas de coleta.
- Não há dado público de preço de cota nem de precatório (valor e credor); o painel não finge ter.
- A comparação "há 7 dias" depende de a foto ter a taxa de referência de cada vencimento. Se faltar, a página diz "sem comparação" em vez de inventar.
- Quem usa leitor de tela: os gráficos têm descrição e tabela com os mesmos números, mas não testei com um leitor de verdade.
