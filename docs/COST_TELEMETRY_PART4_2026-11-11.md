# Etapa 4/7 — custos e telemetria

Data: 11/11/2026 (America/New_York). Agente: Athena / ChatGPT.
Base: main 495fc6349e7255164b03a7f46d31592729029c62.

## Correções

- Uma chamada contabilizada no orçamento e ausente do buffer de trace agora torna os totais de tokens desconhecidos, preservando o subtotal reportado. Inclui truncamento do buffer de 24 eventos.
- A contagem final não pode ser menor que as tentativas observadas, incluindo pesquisa web confirmada.
- Uso booleano e preços nulos, vazios, booleanos, negativos ou não finitos deixam de virar números válidos. Zero explicitamente configurado continua válido.
- O detalhamento de uso por etapa conserva rota e duração junto ao modelo, tokens e estimativa.
- A proteção do blueprint verifica o resultado de preço desconhecido em vez de exigir uma expressão específica no código.

Nenhum modelo, papel, pipeline, política de síntese ou limite de chamadas foi alterado. Sem novas chamadas pagas ou deploy manual.

## Validações

- Testes de cobertura de custos, truncamento, tarifas inválidas, blueprint, telemetria e auditoria de runtime: PASS.
- Diagnóstico integral: 74/80 comandos de teste passam; seis falhas permanecem. Não equivale a npm test aprovado.
- npm test foi tentado e parou no contrato textual de preços, corrigido nesta etapa.
- npm run build foi tentado: bundler passou, verify falhou exigindo texto antigo `PERMANENT PROJECT CHAT`, enquanto a UI já está em português.
- Release safety gates: PASS; não substituem suíte completa ou homologação.
- Runtime local Node 24.22.1/npm 11.9.0; projeto exige Node 22/npm 10.9. Instalação ocorreu com engine-strict desabilitado somente para o comando, sem alterar configuração/lockfile. CI Node 22 continua pendente.

## Falhas restantes identificadas

- scripts/zeus-personal-tests.mjs: contrato textual de chat permanente.
- scripts/a11y-polish-tests.mjs: contrato de rótulos de inputs.
- scripts/chat-reliability-tests.mjs: asserção a diagnosticar.
- scripts/phase4-worker-lease-tests.mjs: asserção a diagnosticar.
- scripts/phase2-workspace-tests.mjs: exige `Linked file:` na UI traduzida.
- scripts/release-production-tests.mjs: exige `Approve +$5` na UI traduzida.

Não enfraquecer controles de acessibilidade, recuperação ou worker para satisfazer testes. Corrigir contratos obsoletos somente após verificar o comportamento real.

## Limites da auditoria de preços

A tabela atual foi preservada. O preço-base do Grok 4.3 foi conferido em https://docs.x.ai/developers/models/grok-4.3 (consulta 11/11/2026). A própria página distingue cache e contexto longo. O cálculo atual usa tarifa-base de texto: não é conciliação de fatura nem cobertura completa de descontos, contexto longo, mídia ou ferramentas. Preços dos demais modelos não foram todos revalidados nesta etapa; modelos sem tarifa continuam desconhecidos. Nenhum preço novo foi inventado.

## Próximo passo

5/7: estabilidade de background/recovery com idempotência e fencing preservados. Na fase de integração, resolver as seis falhas e o verify, executar Node 22/CI e homologar no site Netlify correto. Produção e cobrança real não validadas.
