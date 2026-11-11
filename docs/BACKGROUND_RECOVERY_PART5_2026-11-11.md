# Etapa 5/7 — recuperação de tarefas em background

11/11/2026 (America/New_York). Athena / ChatGPT.
Base: main 27a786ed2738332b3e8bae7c638accc7b2a89f64.

## Falha e correção

Se a resposta inicial ou a confirmação de dispatch se perdesse, a consulta por requestId recuperava o estado QUEUED, mas não os dados necessários para invocar o worker. O navegador ficava consultando uma fila sem worker até a expiração.

Agora a transição para QUEUED salva o payload do pedido na metadata da mensagem original no mesmo statement SQL que cria o nonce. Somente campos suportados são selecionados; headers, cookies e credenciais de transporte não são persistidos. A consulta autenticada por proprietário/requestId retorna esse payload e o mesmo nonce enquanto a fila está válida. Não há dispatch nem escrita no GET.

A restauração da conversa, o polling e Recuperar resultado podem invocar o worker original. A aquisição continua exclusiva, condicionada a QUEUED, proprietário, nonce e lease vigente. Workers duplicados não criam uma nova execução. O navegador evita repetir dispatch já confirmado na mesma aba; uma confirmação perdida permite repetir o mesmo nonce. Não se trata de reiniciar um trabalho já adquirido por um worker.

A confirmação exige HTTP 202 e rejeita redirecionamentos. Página de login ou resposta 200 genérica não significa que o worker iniciou. Filas e workers cuja reserva expirou são apresentados como stalled; não há reinício pago automático.

Nenhuma mudança de modelos, papéis dos especialistas, síntese ou pipeline. Sem migração de banco, deploy manual ou chamada paga nesta etapa.

## Validação

- Novos testes locais exercitam recuperação do payload original, filtragem de campos, mesmo nonce/requestId, expiração, estados terminais, ausência de payload legado, erro de confirmação e HTTP 200 versus 202.
- Testes de worker verificam aquisição exclusiva, entregas duplicadas, nonce antigo, lease expirada e bloqueio de gravação de worker antigo; PASS. São simulações, não um PostgreSQL de produção.
- Contratos de fila, UI, blueprint, chat reliability, orçamento e release safety gates: PASS.
- Diagnóstico integral: 77/81 comandos de teste passaram. Quatro falhas restantes: zeus-personal, a11y-polish, phase2-workspace, release-production.
- npm test tentado: novos testes passam; build do cliente executa, verify interrompe por exigir o texto antigo PERMANENT PROJECT CHAT. Suíte completa e produção não aprovadas.
- Runtime local: Node 24/npm 11; Node 22/CI ainda não homologado.

## Compatibilidade e limites

Pedidos enfileirados antes desta alteração não têm payload persistido; não é seguro inventar opções de imagem, comparação ou aprovação. Esses pedidos continuam consultáveis, mas podem precisar de reenvio explícito após expiração. O navegador precisa voltar ao app para a recuperação; não foi criado scheduler externo.

O endpoint continua validando proprietário, conversa, anexos, nível e políticas existentes antes de adquirir o worker. O nonce não substitui autenticação. A metadata adicional duplica parte do texto do pedido na mesma mensagem privada e não é copiada para telemetria de provedor.

Pendências: executar o SQL em PostgreSQL real, testar perda da resposta e recarga no Safari/iPhone, verificar SSO e 202 na Netlify correta, geração de imagem/Workbook e persistência do resultado. Não há prova de recuperação ponta a ponta em produção.

## Próximo passo

6/7: corrigir os quatro contratos de teste restantes e verify, executar suíte/build no runtime exigido e preparar a homologação final da etapa 7/7.
