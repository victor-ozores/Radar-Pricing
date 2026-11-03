# O painel

O painel é um site estático que mostra a foto mais recente que o robô guardou. Fica na pasta [`site/`](../site) e vai ao ar pelo GitHub Pages. Não tem servidor nem banco de dados: o navegador baixa a foto direto do GitHub e desenha tudo. É feito com React, TypeScript e Vite; o GitHub Actions constrói e publica.

## Para que ele serve

Para quem precifica cotas de consórcio. Ele responde, todo dia útil, quatro perguntas:

1. **O que aconteceu hoje, em uma frase?** A manchete diz quanto mudou, em 7 dias, o valor de hoje de um dinheiro a receber em 3 anos.
2. **De onde vem isso?** Cinco capítulos contam a história na ordem em que o preço é formado: o custo do dinheiro, a curva de juros do Tesouro, quanto isso pesa no valor, o crédito que concorre e o setor.
3. **Quanto vale ou rende esta cota?** Quatro calculadoras (cota cancelada, cota ativa, retorno de uma oferta e precatório) e uma quinta, que calcula uma lista de cotas de uma vez.
4. **Dá para confiar?** O robô está em dia, de onde vem cada número e o que cada termo quer dizer.

## As quatro telas

- **Briefing** é a história do dia, feita para ler de cima para baixo (e para imprimir em uma ou duas folhas). Abre com a manchete, os números do dia (cada um com a variação em 7 dias, uma linha do tempo pequena, a fonte e a data) e o que mexeu na semana. Depois vêm cinco capítulos, cada um com um título que diz a conclusão (montado só com números da foto), um ou mais gráficos e um quadro "o que isso significa para o preço":
  1. *O custo do dinheiro*: a Selic e o CDI nos últimos 30 ou 60 dias e a Selic que o mercado espera (Focus) contra 30 dias atrás.
  2. *A curva de juros do Tesouro*: a taxa de cada vencimento hoje, há 7 e há 30 dias.
  3. *Quanto isso pesa no valor*: quanto mudou o valor de hoje em cada prazo e uma tabela de sensibilidade (e se a taxa subir ou cair até 3 p.p.?). O spread de risco é um campo só, de exemplo, que refaz tudo.
  4. *O crédito que concorre*: a taxa de cada banco no financiamento de imóveis e de veículos, na mesma escala.
  5. *O setor*: o índice de exclusão, cotas ativas e excluídas, onde saíram mais cotas, inadimplência e custo no Panorama do Banco Central e o volume de vendas da ABAC.
- **Mercado** tem os números por trás da história: o Tesouro vencimento a vencimento (gráfico de 5 semanas e tabela), Selic, CDI, IPCA e Focus (inclusive a Selic esperada por reunião do Copom), o crédito por banco (mediana no tempo e tabela) e as 125 métricas do Panorama. As tabelas ordenam ao clicar no título, buscam, mudam de densidade, baixam em CSV e explicam cada coluna num balão.
- **Calculadoras**: cota cancelada, cota ativa, retorno de uma oferta, precatório e várias cotas de uma vez, com "e se?" (prazos e spreads vizinhos), gráficos e "como foi calculado" com a conta escrita com os números. Estão a um toque: botão **Calcular** no topo e, no celular, a barra de baixo (veja "Onde ficam e como usar no dia a dia").
- **Bastidores** responde "dá para confiar?": o robô travou? (as últimas 14 rodadas e o veredito), de onde vêm os números (cada fonte e se respondeu), o dicionário (19 termos) e como foi feito (o caminho do número até a tela e o que o painel não é).

No topo, sempre: o selo do robô, o botão **Calcular**, o botão do Excel, imprimir, tema claro ou escuro, o link do código e as setas para ver a foto de outro dia. Não há rodapé. No celular o topo é uma barra fina (o nome, o Excel e o tema); o selo do robô e a data vêm numa faixa logo abaixo, que rola junto com a página, e as telas e o botão **Calcular** ficam numa barra fixa embaixo. Os balões dos títulos das colunas, que o Radix só abre com mouse ou foco, abrem também por toque (por uns 3 segundos).

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

1. **A foto.** O robô roda de segunda a sexta, por volta das 10h17 de Brasília. A página calcula qual foto já deveria existir agora: a de hoje, se hoje é dia útil e já passaram 10 horas do horário (o agendamento do GitHub chegou a atrasar 9 horas neste projeto, no primeiro dia, e 5,5 horas no meu outro); senão, a do último dia útil. Se a foto mais nova é mais velha que isso, o selo fica amarelo ("Robô atrasado") e diz quantos dias úteis faltam.
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

**Cores.** As cores das séries são quatro (azul, laranja, violeta e verde) e passaram pelo validador de paleta da skill de gráficos, uma vez para o fundo claro (`#fffdf8`) e outra para o escuro (`#121a19`): separação para quem tem daltonismo, contraste e faixa de luminosidade. Nos vencimentos do Tesouro (6 linhas) eu usava um azul só, mais forte quanto mais longo o prazo; na revisão de 02/11 vi que era confuso e medi: o validador reprova essa escada (os degraus ficam a 0,05 de claridade, o mínimo é 0,06, e o mais claro tem 1,7:1 de contraste contra o fundo, o piso é 2:1). Hoje cada vencimento tem uma cor (os 6 primeiros passos da paleta categórica validada, que passa nos dois temas) e a legenda é clicável: mostra o ano e a taxa de hoje, destaca a linha ao passar o mouse e esconde ou mostra ao clicar (nunca esconde a última). Nos gráficos que comparam o mesmo número em dias diferentes, "hoje" é azul cheio, "há 7 dias" é laranja tracejado e "há 30 dias" é cinza tracejado. As marcas dos eixos de taxa têm passo redondo (6%, 7%, 8%, 9%), não 6; 6,75; 7,5; as 3 cores de menor contraste no fundo claro (aqua, amarelo e magenta) têm a taxa escrita na legenda e a tabela "Ver os números do gráfico". Laranja quer dizer "taxa mais alta" e azul "taxa mais baixa" nas tabelas e nos cartões, sempre com seta e sinal além da cor.

**O que o índice de exclusão quer dizer.** O Banco Central publica o "índice de exclusão" e as cotas ativas e excluídas. Conferi com os números de jun/2026: 12.751,82 ÷ (13.376,26 + 12.751,82) = 48,8%, o mesmo que ele publica. Por isso o painel diz "de cada 100 cotas (ativas e excluídas), 49 já saíram do grupo".

## O número do dia e o que "mexe no preço"

O robô já guarda, para cada vencimento do Tesouro, a taxa de 7 dias atrás. Com ela monto a curva de uma semana antes, interpolo para o mesmo prazo e desconto o mesmo valor com a mesma taxa de risco (spread). A diferença é o efeito da semana. Não preciso de dado novo nem de mexer no robô.

O **spread** (5 p.p. de exemplo) é de demonstração e é uma premissa só: trocar em uma tela troca em todas, inclusive a manchete.

**Sensibilidade.** A tabela do capítulo 3 usa a mesma conta com a taxa do Tesouro deslocada de −3 a +3 p.p. em todos os prazos: valor de hoje de R$ 1.000 em cada prazo e quanto muda contra hoje. Serve para dizer "se a taxa subir 1 ponto, o valor cai X%" sem esperar o mercado andar. A taxa de desconto nunca fica abaixo de zero.

## As calculadoras

São modelos simples de **demonstração**. Usam só o que a pessoa digita e as curvas do Tesouro do dia (e, no precatório, a Selic e o IPCA que o Focus espera). Nenhum dado de empresa. Os campos já vêm com valores inventados e aceitam número do jeito brasileiro ("50.000,50").

| Calculadora | Pergunta | Conta |
|---|---|---|
| **Cota cancelada** | Quanto vale hoje o valor que a administradora vai devolver no fim do grupo? | Valor ÷ (1 + taxa do Tesouro no prazo + spread)^(prazo em anos de 252 dias úteis). Três jeitos de corrigir: **pela inflação** (curva IPCA+, resultado em reais de hoje), **por uma taxa que a pessoa informa** (o índice do bem: INCC, tabela FIPE; o valor de hoje cresce a essa taxa até a data e desconta pela curva Prefixada) ou **sem correção** (curva Prefixada). Mostra também prazos vizinhos e spreads vizinhos. O preço pedido já vem ligado, com um exemplo: o quadro de veredito diz se compensa, quanto lucra e qual é o preço máximo. |
| **Cota ativa** | Quanto vale a cota de quem recebe o crédito quando for contemplada e continua pagando as parcelas? | Crédito descontado até o mês da contemplação, menos todas as parcelas descontadas, na curva IPCA+ mais o spread. Mostra o valor por mês de contemplação. O preço pedido já vem ligado: o quadro de veredito conta as parcelas que ainda saem do bolso, e abaixo dele aparece o ágio sobre o crédito **e** sobre o saldo devedor (a base muda o percentual). |
| **Retorno de uma oferta** | Pagando X para receber Y em N meses, quanto rende ao ano? Qual o preço máximo para um retorno-alvo? | (Y ÷ X)^(1 ÷ prazo em anos úteis) − 1, comparado com o Tesouro do prazo (e com o CDI, se não for corrigido pela inflação). Preço máximo = Y ÷ (1 + alvo)^(prazo em anos úteis); sem alvo digitado, o alvo é o Tesouro + spread. Os custos de transferência entram no que se paga. Mostra o deságio. |
| **Várias cotas** | Quanto vale cada cota de uma lista? Quais cabem no preço pedido? | Cola-se a lista (copiada do Excel, com tabulação, ou separada por ponto e vírgula; uma cota por linha, até 500; uma linha de título no começo é ignorada). Cada linha passa pela **mesma conta** da calculadora de uma cota (cancelada ou ativa), com o spread do painel. Sai uma tabela que ordena e baixa em CSV, com a soma do que valem, quantas cabem no preço pedido e, em cada linha com erro, o que está errado. |
| **Precatório** | Quanto vale hoje um precatório que só será pago daqui a N meses? Que deságio faz a compra valer a pena? | O valor atualizado hoje vira o valor esperado no pagamento, corrigido mês a mês; tiram-se as retenções informadas; o resultado é descontado na curva Prefixada mais o spread. Dá o valor de hoje, o *deságio justo* e, se houver uma oferta de compra, o retorno ao ano, o *deságio mínimo* e o preço máximo. |

**Como ler o resultado: o quadro de veredito.** Na primeira versão o resultado era um cartão verde e um parágrafo; eu não sabia dizer, olhando, se o negócio era bom ou ruim, nem quanto se ganhava ou perdia. Hoje cada calculadora abre com o mesmo quadro: uma palavra grande, **Compensa** (verde), **No limite** (amarelo) ou **Não compensa** (vermelho), sempre com ícone e palavra (a cor sozinha não basta), uma frase curta e três números em linhas separadas:

- **Lucro no fim**, em reais: o que se recebe menos tudo o que sai do bolso (preço, custos e, na cota ativa, as parcelas), sem descontar nada, e o mesmo em %;
- **Rende ao ano** contra o retorno que se exige (a taxa do Tesouro no prazo mais o spread, ou o alvo digitado na oferta);
- **Sobra** (ou **Falta**) **sobre o exigido**, em reais de hoje: o valor de hoje do que se recebe menos o que sai do bolso hoje.

A palavra vem da última conta: vermelho se a folga é negativa (rende menos que o exigido), amarelo se sobra menos de 5% do que sai do bolso hoje, verde daí para cima (`MARGEM_MINIMA_PCT` em `site/js/calc.js`, um valor de demonstração). **Pode haver lucro em reais e mesmo assim "Não compensa":** ganhar menos que o Tesouro mais o spread também é perder, e o quadro mostra os dois números lado a lado para isso ficar claro. No celular a barra fixa de baixo leva a mesma cor e o lucro. O cartão do valor ("Vale hoje") deixou de ser verde para a cor ficar só no veredito. A mesma regra (`leituraDoNegocio`) serve às cinco telas, inclusive à lista de várias cotas, que ganhou as colunas "Veredito" e "Lucro no fim".

**Como o precatório é corrigido.** Cada mês multiplica o valor por (1 + taxa do ano)^(1 ÷ 12), e a taxa muda conforme o ano em que o mês cai. No ano corrente, a Selic é a média entre a meta de hoje e o que o Focus espera para o fim do ano; nos anos seguintes é o que o Focus espera, e depois do último ano do Focus repete o último. O IPCA de cada ano também vem do Focus. A pessoa escolhe o índice, porque a regra mudou e a transição é discutida: **Selic**; **IPCA mais juros ao ano**, nunca acima da Selic; **uma taxa própria**; ou **sem correção**. Pelo que li em fontes públicas, a Emenda 113 (2021) mandou usar a Selic, e a Emenda 136 (promulgada em 09/09/2025) passou a prever IPCA mais 2% ao ano, limitado pela Selic, nas novas requisições de estados e municípios. Não conferi o texto oficial das emendas e isto não é orientação jurídica: por isso o painel não escolhe o índice por ninguém. O prazo pode ser digitado em meses ou escolhido por mês e ano, até 30 anos.

**O que uma calculadora precisa ter para ser usada todo dia.** Antes de montar a quarta, pesquisei como são as calculadoras de cota e de precatório que existem e vi o que faltava nas três primeiras. Depois, na revisão final de uso (me pondo no lugar de quem precifica todo dia), vi mais três lacunas e fechei:

- *Prazo por data.* Quem pensa "o grupo acaba em 03/2029" não quer contar meses: cada calculadora aceita meses ou o mês e o ano.
- *Preço pedido e custos de transferência.* O que se compra tem preço e taxas; a conta diz se cabe e qual é o máximo.
- *Ágio nas duas bases.* O mesmo preço é uma porcentagem do crédito e outra, maior, do saldo devedor; mostrar só uma induz a erro.
- *Spread só desta conta.* Um precatório tem prazo mais incerto que uma cota; dá para usar outro spread sem mexer no do painel.
- *Copiar o resumo* da conta (para colar numa mensagem) e *voltar aos exemplos*.
- *Correção pelo índice do bem.* O reembolso de uma cota cancelada segue o preço do bem (INCC, tabela FIPE), não o IPCA; a cota cancelada aceita uma taxa própria.
- *Uma lista de cotas de uma vez.* Quem precifica um estoque não quer digitar uma por uma: a quinta aba calcula a lista colada.
- *O Excel com as mesmas contas.* Agora tem o precatório, o preço pedido, os custos e o ágio (veja abaixo).

**Onde ficam e como usar no dia a dia.** No computador, o botão **Calcular** no topo abre a lista das cinco e leva direto à última que a pessoa usou. No celular, a barra fixa de baixo tem **Calcular**, que faz o mesmo. A tela das calculadoras tem as cinco em abas no alto. Os campos de cada calculadora, e o *spread de risco* do painel, ficam guardados no navegador de quem usa (`localStorage`, só neste aparelho; nada vai para servidor). O rótulo "exemplo" só aparece enquanto o spread é o de demonstração; com o spread da pessoa, o painel diz "o seu", então voltar no dia seguinte é continuar de onde parou; um campo guardado de versão antiga ou estragado é descartado e volta ao exemplo. Se o navegador bloqueia o armazenamento, a página funciona do mesmo jeito, sem lembrar. No celular, o resultado principal fica numa barra fixa em cima da barra de baixo enquanto a pessoa muda os campos.

Quando o prazo cai fora da faixa de vencimentos da curva do Tesouro, a calculadora diz qual é a faixa, que taxa usou em cada ponta e que o resultado é uma estimativa. **Por que não derivei uma taxa para o trecho curto:** a curva IPCA+ do Tesouro começa em 2,5 anos, e quase toda conta com parcelas passa por esse trecho. Testei dois jeitos de estimar o trecho curto na foto de 31/10/2026: manter a taxa do primeiro vencimento (o que faço), usar a inflação implícita constante do Tesouro (muda o valor em menos de 1% em prazos de 6 a 24 meses) e tirar o IPCA do Focus da curva Prefixada (cria um salto de 2,3 p.p. na curva, porque o mercado embute uma inflação de 6,6% ao ano contra os 4,2% do Focus). O segundo quase não muda o resultado e o terceiro piora, então fico com a taxa do primeiro vencimento e aviso. O quadro do spread mostra o tamanho de 1 p.p. de erro.

O que o modelo **não** considera: a chance de ser contemplada, lance, seguro, fundo de reserva, as regras de cada grupo e o risco de a administradora atrasar; no precatório, a ordem da fila, o imposto de cada caso (as retenções são um percentual que a pessoa informa) e o risco de o ente atrasar o pagamento. Na cota ativa, um spread maior não derruba sempre o valor da cota: ele também encolhe as parcelas, que ficam mais longe que o crédito. Por isso a calculadora mostra os números do spread vizinho e não afirma uma direção.

Antes da primeira versão, eu tinha descartado fazer um "precificador de cota". O que existe agora não é isso: é uma conta transparente, com premissas públicas, que mostra o raciocínio. Preço de verdade depende de extratos, regras e histórico que só a empresa tem, e isso não entra neste repositório.

## O Excel

É gerado no navegador, na hora, para o dia que a pessoa está vendo (botão no topo; o gerador só é baixado quando alguém pede). Não guardo um arquivo por dia no repositório (um `.xlsx` não comprime e o repositório cresceria à toa). Escrevi o gerador de `.xlsx` à mão (`site/js/xlsx.js`, um zip com os XMLs que o Excel exige) para não depender de biblioteca.

**Um padrão só em todas as abas** (`site/js/folha.js`): título, subtítulo com a data da foto, uma frase dizendo para que serve a aba, seções e tabelas iguais; azul-marinho e cinza, amarelo só nas células de digitar e azul-claro só nos resultados. Quinze abas: Leia-me (com um link para cada aba), Hoje, as quatro calculadoras (cota cancelada, retorno da oferta, cota ativa e precatório), o cálculo mês a mês da cota ativa, Custo do dinheiro, **Prazos** (o prazo de 0 a 720 meses em dias úteis, ÷ 252, com `EDATE` e `NETWORKDAYS`, que todas as calculadoras leem), **Feriados** (os feriados nacionais que a aba Prazos desconta), Crédito concorrente, Setor, Mudanças, Fontes e Observações (os números brutos, com filtro).

**As calculadoras do Excel são fórmulas de verdade**, não valores colados: troque uma célula amarela e tudo se recalcula. O spread e o valor de referência são nomes (`Spread`, `ValorRef`) na aba Hoje. As células de digitar têm validação (número maior que zero, lista Sim/Não). Cada fórmula leva também o valor já calculado, para os leitores que não recalculam. Têm os mesmos campos do painel: taxa própria de correção na cota cancelada, preço pedido e custos de transferência nas três cotas, ágio nas duas bases na cota ativa, e o precatório inteiro (retenções, deságio da oferta, retorno de quem compra, preço máximo e deságio mínimo). **Uma diferença:** o precatório do Excel usa uma *correção média ao ano* (já vem preenchida com a média que o painel calcula mês a mês pelo Focus); o painel segue a Selic ou o IPCA ano a ano, então com outro prazo os números diferem um pouco. A lista de várias cotas só existe no painel.

Como conferi (31/10/2026, Excel 16 no Windows, com `scripts/confere_excel.py`):

- o arquivo abre e **as 5.774 fórmulas, recalculadas pelo Excel, dão o mesmo valor que o painel guardou, sem nenhum erro** (02/11/2026, depois de trocar o prazo para dias úteis);
- troquei as células amarelas das quatro calculadoras por 16 conjuntos de valores diferentes (com taxa própria, custos, preço pedido, ágio, retenções e oferta) e comparei o resultado do Excel com o do JavaScript do painel: **0 diferenças**;
- errei uma fórmula de propósito, seis vezes (taxa própria sem crescer o valor, preço máximo sem tirar os custos, custos fora do total pago, ágio na base errada, retenção ignorada, curva errada no precatório), e o verificador pegou as seis; depois da troca do prazo errei as fórmulas da aba Prazos e das calculadoras mais 5 vezes (a data-base contada como dia útil, os feriados fora da conta, a linha do mês deslocada em um, o desconto de volta em meses ÷ 12 e a base 250 no lugar de 252) e o verificador pegou todas.

Isso roda no meu computador: precisa do Windows com o Excel. No CI, sem Excel, só confiro com o `openpyxl` que cada faixa e cada nome usado por uma fórmula cai em células com número. A tabela de sensibilidade, os gráficos de evolução e a lista de várias cotas existem só no painel, não no Excel.

**O que ainda não sei:** não abri o arquivo no Excel para Mac, no Excel Online, no Excel Mobile nem no LibreOffice, nem em versões antigas do Excel. O arquivo sai sem compressão (cerca de 1,8 MB).

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

- **161 testes de contas e leitura**, no Node: formatação e leitura de número em português, busca da foto, as contas das calculadoras (conferidas contra fórmulas fechadas, como a anuidade, e a correção do precatório mês a mês contra o produto das taxas, a taxa própria da cota cancelada, a lista de várias cotas contra as calculadoras de uma cota), a sensibilidade, o que mudou em 7 dias, as frases da manchete e dos capítulos, o histórico (inclusive contra a foto de verdade), a saúde do robô, o monitor, o dicionário e o escritor de Excel.
- **51 testes das telas**, com o vitest e a foto de 31/10/2026: cada tela abre sem erro, as quatro calculadoras abrem e lembram o que foi digitado (e ignoram um valor guardado estragado), a manchete e os títulos dos capítulos saem como esperado, a tabela do Tesouro ordena e filtra, o exemplo da cota cancelada dá o valor da conta independente (R$ 39.399,23) e o do precatório também (R$ 79.199,60), um campo inválido avisa, o robô mostra as rodadas, o dicionário filtra, o tema troca, e **nenhum texto vaza "NaN", "undefined" ou "null"**.
- **9 testes em Python** que rodam o JavaScript com uma foto de verdade (a que o robô grava, a partir das respostas reais gravadas): a calculadora contra o robô (4.800 combinações, ao centavo), as três primeiras calculadoras contra a mesma conta escrita de novo em Python em 224 combinações (inclusive a taxa própria), o precatório em 576 e o retorno com custos em outras, medianas e curvas contra a foto, o Excel aberto com o `openpyxl` e a conferência das referências das fórmulas.
- Quebrei o código de propósito, 193 vezes em dez rodadas (85 nas versões anteriores, 18 nas calculadoras novas e no celular, 9 na revisão final de uso, 20 nas últimas correções, 6 delas no Excel de verdade, 15 no quadro de veredito e 20 na segunda revisão dos cálculos e dos gráficos, 9 delas na própria auditoria: virada de ano na correção, teto da Selic, retenção ignorada, taxa do Tesouro de outro prazo, custos fora do preço máximo, ágio na base errada, Selic do ano em curso sem a média, meses entre datas, valor guardado estragado, atalho do celular, spread só da conta, prazo por data, balão por toque, spread lembrado, "exemplo" no rótulo, unidade da ABAC, fonte complementar no briefing, deságio com custos, taxa própria, lista de cotas, aviso do trecho curto, nome interno da ABAC, margem do veredito, lucro sem as parcelas, custos fora do veredito, cor do vermelho, cartão do valor de volta ao verde, barra do celular sem cor, margem do veredito nas duas direções, lucro e folga na lista, cores e legenda dos gráficos e rótulos do eixo; e 26 na troca do prazo para dias úteis: a data-base contada como dia útil, feriado que some, Consciência Negra antes ou depois de 2024, fim de mês que passa para o mês seguinte, base 250, e cada calculadora de volta em meses ÷ 12): CDI com 365 dias em vez de 252, série fora de ordem, dia do alvo errado, prazo do título medido com 365 dias, quartil trocado pela mediana, spread ignorado, choque no sentido contrário, "subiu" e "caiu" trocados, frase que sempre promete "mais nos prazos longos", entre outras. Os testes pegaram todas; duas só na segunda tentativa, e cada uma ganhou um teste.

O `ci.yml` roda tudo isso (menos o Excel de verdade) a cada envio, com `EXIGE_NODE=1`: no CI, faltar o Node é falha, não pulo.

## Publicação

O workflow [`pages.yml`](../.github/workflows/pages.yml) instala as dependências, confere os tipos, roda os testes, constrói o site e publica `site/dist` quando algo em `site/` muda na `main`. A página só vai ao ar se tudo passar. Precisa de uma configuração única no repositório: **Settings → Pages → Build and deployment → Source = GitHub Actions** (já está).

## Limites que conheço

- Vi o painel só em um navegador baseado em Chromium (o do app em que desenvolvo), em tela larga (1280 px) e simulando celular de 320, 375 e 768 px, sem rolagem lateral em 13 telas. Vi os temas claro e escuro, mas das calculadoras novas só o precatório no escuro em tela larga e a cota cancelada e a oferta no escuro no celular; a cota ativa no escuro eu não vi. Não testei em um celular de verdade, nem no Safari ou Firefox.
- Se o `raw.githubusercontent.com` ficar fora do ar, a página mostra uma mensagem e um botão para tentar de novo; não guarda cópia dos números. Se a API do GitHub passar do limite de consultas, o histórico de rodadas some e o selo vale pela foto.
- O histórico do robô começa curto: o GitHub só mostra as rodadas que ainda existem, e as primeiras foram de teste. A tira de 14 rodadas vai enchendo com os dias úteis.
- O histórico dos gráficos é o que cada foto traz (cerca de 5 semanas de Tesouro e 2 meses de Selic). Uma linha do tempo mais longa, juntando muitas fotos, só faz sentido depois de algumas semanas de coleta.
- Não há dado público de preço de cota nem de precatório (valor e credor); o painel não finge ter.
- A calculadora de precatório depende do índice que a pessoa escolhe e das projeções do Focus para a Selic e o IPCA, que mudam toda semana. A regra de correção mudou em 2025 e a transição é discutida; li sobre isso em fontes públicas, não conferi o texto oficial e não sou advogado. Retenções (imposto, contribuição, honorários) são um percentual digitado, não uma conta.
- Os campos lembrados ficam só no navegador (`localStorage`): trocar de aparelho ou limpar os dados do site volta aos exemplos. O Excel tem as mesmas contas do painel, mas o precatório dele usa uma correção média, não a Selic ano a ano.
- A comparação "há 7 dias" depende de a foto ter a taxa de referência de cada vencimento. Se faltar, a página diz "sem comparação" em vez de inventar.
- Quem usa leitor de tela: os gráficos têm descrição e tabela com os mesmos números, mas não testei com um leitor de verdade.
