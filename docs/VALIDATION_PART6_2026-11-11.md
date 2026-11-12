# Etapa 6/7 — suíte e build

11/11/2026 (America/New_York). Agente: Athena / ChatGPT.
Base: main 1b8ece6ed0097c6ec93e5f8d9b22e626c9716f72.

## Mudanças

As quatro verificações pendentes exigiam rótulos antigos em inglês para chat permanente, memória, inputs, fontes/revisões e aprovação de orçamento. Foram alinhadas aos elementos/IDs e textos atuais da UI. A checagem de erro de rede também passou a exigir a orientação atual de recuperar a execução original.

O verify do build exigia texto de status removido e o antigo fallback inline. Agora verifica a apresentação do estado real, a resposta de dispatch recuperável, aquisição exclusiva, lease e fencing. Não foi removida a proteção contra tarefas longas no caminho síncrono nem a verificação de migrações e segredos.

Ao rodar a suíte no Node 22, apareceu uma falha intermitente adicional: pickToolCandidate podia escolher aleatoriamente outro modelo antes da aplicação de preferFirstModel no CEO. Em zeus-directed.mjs, o CEO sem toolId agora mantém o primeiro candidato já ordenado pela política existente. A exploração continua nos especialistas e nas etapas de ferramentas dedicadas. Não há troca de catálogo/modelos, quantidade de chamadas, papéis ou pipeline.

O teste novo força o seletor a escolher o último candidato e verifica dois casos: coordenador sem ferramenta preserva a prioridade; ferramenta dedicada preserva sua seleção existente. Evita que o problema seja ocultado fixando Math.random no teste.

## Evidências locais

Runtime: Node 22.23.5, npm 10.9.2, instalados fora do repositório, sem alterar engines ou lockfile.

1. npm ci --ignore-scripts --no-audit --no-fund: PASS com engine-strict original.
2. npm test: PASS integral após instalação limpa; inclui build/verify e todos os scripts da suíte.
3. npm run build: PASS, incluindo verificador de produção.
4. npm run release:check: PASS.
5. node scripts/gemini-live-safari-tests.mjs: PASS (contratos de microfone/estágios de erro; não é teste em Safari físico).
6. git diff --check: PASS.

O diagnóstico anterior tinha 81/81 scripts aprovados antes da correção da seleção intermitente; a evidência final é a execução sequencial completa de npm test no código corrigido, com exit code zero. Migração-base permanece com SHA-256 90dece71adbd153d42168585fab6988e000fec715c33a6bef3595c2096a52d70.

## Limites e próximo passo

Esta entrega valida código e testes locais com transporte de provedores simulado. Não prova deploy Netlify, chamada real, execução PostgreSQL real, geração/edição Workbook, SSO ou Safari/iPhone físico. Não houve chamada paga nem deploy manual. CI remoto precisa de confirmação independente.

7/7: identificar o destino Netlify correto, conferir commit publicado e executar homologação dos fluxos reais, com evidência de worker, provedores, arquivos e recuperação. Não chamar produção de corrigida com base somente nesta suíte.
