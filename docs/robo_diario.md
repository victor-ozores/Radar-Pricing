# Como o robô diário funciona

Todo dia útil o GitHub Actions roda o workflow [`coleta-diaria.yml`](../.github/workflows/coleta-diaria.yml), coleta as fontes e guarda a **foto do dia** na branch `data`.

## O que acontece em cada rodada

1. **Prepara a branch `data`.** Ela só tem as fotos (`fotos/AAAA-MM-DD.json` e `.csv`) e um README, sem o código. Na primeira vez o robô a cria vazia; nos outros dias baixa o que já existe.
2. **Coleta** as sete fontes, em paralelo e isoladas (uma que falha não derruba as outras), e grava a foto do dia. A data é a de **Brasília**.
3. **Se o dia sair parcial** (alguma fonte essencial não veio), espera 20 minutos e coleta de novo, uma vez só. Fica com a tentativa que tiver mais fontes boas. Falha de rede costuma passar nesse intervalo.
4. **Publica** a foto na branch `data`. Foto já publicada não se altera nem se apaga: se o código tentasse, o envio é recusado antes de sair do servidor.
5. **Se o dia continua parcial**, a foto é publicada mesmo assim, com o status "parcial" e a lista do que faltou, e a rodada aparece como **falha** no Actions, com o resumo das fontes na página da rodada. O Healthchecks também recebe o aviso de falha.
6. **Avisa o Healthchecks** (início, sucesso ou falha). É o vigia externo: se o robô **não rodar**, quem avisa é ele, por e-mail. O aviso só é enviado se o segredo `HEALTHCHECKS_URL` estiver cadastrado no repositório; sem ele, essa parte é pulada.

Rodar de novo no mesmo dia é seguro: se a foto de hoje já existe, o robô sai sem coletar e sem erro.

## O que eu sei e o que não sei sobre o agendamento

- **Horário:** 10:17 em Brasília (13:17 UTC), de segunda a sexta. O GitHub avisa que os agendamentos podem atrasar em horário de pico e que, em casos extremos, uma rodada pode ser descartada. No meu outro projeto (Radar PNCP) medi atrasos de 3 a 5 horas com o mesmo tipo de agendamento, por isso o horário é cedo e o Healthchecks tem 8 horas de tolerância.
- **Desligamento por inatividade:** a documentação do GitHub diz que, em repositório público, os agendamentos são desligados depois de 60 dias sem atividade no repositório. Ela **não define** o que conta como atividade, então não sei se o commit que o próprio robô faz na branch `data` conta. Se o agendamento parar, o Healthchecks avisa e eu religo em *Actions → Coleta diária → Enable workflow*.
- **Dados que não vêm de graça no dia:** o Focus é publicado em boletim toda semana, mas a pesquisa tem uma linha por dia útil, o Panorama de Consórcios é trimestral e o IPCA é mensal. A foto diária guarda o que cada fonte tinha naquele dia, com a idade do dado ao lado.
- **IBGE:** não responde a partir dos servidores do GitHub (ver [`fontes_de_dados.md`](fontes_de_dados.md)). Ele só serve de conferência do IPCA do BCB, então a foto sai normal e a conferência fica sem dado.

## Testes

O workflow [`ci.yml`](../.github/workflows/ci.yml) roda o ruff e os testes a cada envio. Tudo é offline: respostas reais gravadas das fontes e repositórios git temporários para provar a regra da branch `data` (criar órfã, baixar no dia seguinte, recusar alteração de foto antiga).
