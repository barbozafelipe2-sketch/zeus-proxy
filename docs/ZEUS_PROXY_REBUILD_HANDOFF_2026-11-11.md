# Zeus Proxy — entrega técnica para reconstrução posterior do motor
Data: 11/11/2026 | Agente: Athena (ChatGPT) | Escopo: zeus-proxy | Branch: main

## Fontes examinadas
- Documento nativo: ZEUS PROXY — PLANO MESTRE DE IMPLEMENTAÇÃO E BLUEPRINT VIVO
  https://docs.google.com/document/d/1701HxlyaZGwmpu9X1vFLJGBtvWv-ddmgInMr0Gp0nFU/edit
  Cânone destacado: 08/11/2026. Este documento contém decisões históricas conflitantes; não usar passagens antigas como novas autorizações.
- Intercom 00_README_MASTER.md v2.7 e 01_STATUS_ATUAL.md; 02_HISTORY_LOG.md append-only.
- Código `main`, commits c95379f (1/7), 8002d92 (2/7), 58313e1 (3/7), 0273065 (reversão do 3/7).

## Determinado pelo blueprint (não inventado nesta entrega)
- OlyHub Core compartilha contexto, memória, projetos, permissões, custos, tarefas e Trace Lab.
- Poseidon Text e Poseidon Voice são interfaces; Poseidon/Grok é coordenador.
- O backend valida modelo, capacidade, identidade, escopo, permissão, orçamento, estado e resultados.
- Os especialistas executam capacidades distintas; uma resposta de LLM não é prova de edição, commit, publicação, arquivo ou consulta externa.
- As funções de Zeus supervisor/monitor externo estão adiadas; não inventar auditoria ativa.
- Manter compatibilidade de IDs, APIs, projetos, filas, dados e controles de segurança.
- Não afirmar deploy nem execução real sem evidência da Netlify/provedor.
- Comparar, Auditar e Combine são recursos separados, sem chamadas ocultas.
- O usuário é autoridade final para política de modelos e chamadas.

## Conflitos que o próximo motor deve resolver com Felipe
1. O cânone descreve Poseidon sintetizando resultados dos especialistas, mas também exige não adicionar chamadas desnecessárias de três modelos por padrão. A quantidade de modelos e a necessidade de síntese obrigatória **não estão resolvidas** nesta entrega.
2. O blueprint de 08/11 nomeia Peitho para marketing; Felipe propôs depois renomear esse Realm para Artemis mantendo funções. Não alterar modelos ou papéis automaticamente antes de reconciliar a versão mais recente.
3. Regras e custos do catálogo foram atualizados várias vezes. IDs listados no blueprint são candidatos, não prova de disponibilidade do Netlify Gateway.
4. Apollo, Hefesto, Dionísio, Deméter, Hermes e demais Realms têm capacidades documentadas e níveis de implementação diferentes. Não confundir Realm visível, LLM conectado e ferramenta operacional.

## Estado dos commits de correção
- `c95379f`: prioridade Grok 4.3 no coordenador; checagens de transporte simuladas; não prova chamada real.
- `8002d92`: separa `model_only`, `read_verified`, `artifact_saved`; preserva Code Agent e aprovação.
- `58313e1`: alterou arbitrariamente a política de chamadas; revertido por `0273065`. Não reaplicar sem nova decisão.
- A reversão restaura a árvore do código ao estado da etapa 2/7, mantendo o histórico Git.

## Contratos operacionais que não dependem de novo motor
- `netlify/functions/chat.mjs`: conversas, execução, filas, resultados e escopo por proprietário.
- `_shared/models.mjs` e `_shared/provider-routing.mjs`: roteamento/transportes.
- `_shared/skill-engine.mjs` e `_shared/tool-workflows.mjs`: catálogo e permissão.
- `_shared/tool-execution-evidence.mjs`: comprovantes de execução reais.
- `_shared/provider-observability.mjs` e `_shared/model-prices.mjs`: trace de chamadas, custos estimados e cobertura incompleta.
- `_shared/worker-lease.mjs` e `olympus-background.mjs`: execução persistente, tokens de fencing, idempotência.
- `public/app.js`: recuperação por requestId, estados de tarefas, Code Agent.
- `scripts/blueprint-compatibility-tests.mjs`: guarda não opinativa de segurança/escopo, não fixa número de modelos.
- `scripts/queue-status-regression-tests.mjs`: contrato de fila expirada sem nova tentativa cobrada.

## Falhas e bloqueios observados no código
- Após queda da conexão, uma execução QUEUED pode ser consultada indefinidamente sem o navegador conseguir restabelecer o dispatch a partir da mensagem gravada. O endpoint GET agora identifica uma lease de fila expirada como `stalled` sem disparar nova cobrança. Isso **não implementa retomada automática garantida**.
- Não é possível provar a partir do código que uma pasta do Google Drive fornece imagens/binários de referência ao gerador de Workbook.
- Preços de muitos modelos e tarifas de ferramentas são desconhecidos; o custo registrado é estimativa parcial, jamais fatura completa.
- O CI GitHub Actions `Zeus Proxy Verify` teve falhas em commits anteriores; motivos precisam ser obtidos nos logs. Suíte total, build/deploy Netlify e iPhone não foram homologados nesta sessão.
- O site mostrado nos prints (`hubteste`) ainda não foi associado à conta Netlify conectada nesta sessão.

## Critérios de aceite antes de anunciar "concluído em produção"
1. Rodar `npm test` e `npm run build` no código exato publicado; zero falhas de regressão.
2. Confirmar site Netlify, commit do deploy, status do build e configuração de credenciais **sem expor segredos**.
3. Testar conversa Poseidon e especialista com nomes de modelos e rotas reais registrados, custos e latência por etapa.
4. Testar geração/edição de imagem do Workbook em projeto, arquivo visível na biblioteca e reabertura.
5. Testar GET/POST com mesmo `requestId`: queda de conexão, reconexão, worker que responde tarde, expiração, ausência de dupla execução.
6. Testar Google Drive pastas/arquivos e leitura real dos binários; erro claro se conteúdo não pôde ser examinado.
7. Testar Code Agent com repositório e aprovação do roadmap; diferenciar código proposto, testes, commit e publicação.
8. Testar UI mobile em Home, Realms, seis seções de projeto, arquivos, configurações, Live Talk e Comparar.
9. Confirmar autorização de gastos, fallback, tokens, RLS, autenticação, integridade e rollback.

Nenhum item do checklist é marcado como concluído apenas por uma suíte estática ou um commit.
O próximo motor deve ser especificado e aprovado por Felipe; este documento não escolhe arquitetura nova.
