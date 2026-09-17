# Rotina Family — Sprint 2.1

## Auditoria inicial do Participante

Status: **em revisão técnica**  
Objetivo: sanear o código do Participante antes da Sprint 3, preservando comportamento aprovado, cache/offline e reduzindo consultas ao Firebase.

## 1. Runtime real identificado

A entrada de produção passa por `index.html`, que carrega `index-CLIENTE-v6.html` e injeta módulos adicionais. O Service Worker também possui uma camada de compatibilidade que injeta módulos quando a navegação ocorre diretamente no HTML principal.

### Núcleo atual
- `index.html`
- `index-CLIENTE-v6.html`
- `sw.js`
- `client-ui-pro.js`

### Módulos carregados pelo `client-ui-pro.js`
- `client-time-guard-v3.js`
- `client-session-integrity.js`
- `client-reviewed-points.js`
- `client-early-start-ui.js`
- `client-tolerance-timer.js`
- `client-week-nav.js`
- `family-alarm-client.js`
- `client-history-reconciler.js`
- `client-mascot-v3.js`
- `client-zero-feedback-v4.js`

### Módulos adicionados pelo bootstrap/Service Worker
- `client-auth-session-v1.js`
- `client-emergency-compensation-20260826.js`
- `client-execution-source-unifier-v1.js`
- `client-offline-execution-integrity-v1.js`
- `commercial-access-client.js`
- `app-monitoring-extra-v1.js`
- camadas auxiliares de layout/asset/fix dos mascotes
- `runtime-build-info.js`

## 2. Achados principais

### A. Bootstrap fragmentado
Hoje a composição do aplicativo não está declarada em um único lugar. Há módulos inseridos por `index.html`, outros por `client-ui-pro.js` e outros pelo Service Worker. Isso dificulta auditoria, cache, rollback e identificação do proprietário de cada regra.

**Direção:** criar um bootstrap explícito e único. O Service Worker deve voltar a ser responsável por cache/offline, e não por corrigir/compor a aplicação em tempo de execução.

### B. Store central existe parcialmente, mas ainda há acessos paralelos
`index-CLIENTE-v6.html` já mantém caches compartilhados e expõe `window.rotinaClientCacheSnapshot()`. Vários módulos visuais já consomem esse cache, o que é positivo.

Ainda existem acessos diretos ao Firestore em módulos como:
- `client-time-guard-v3.js` — fallback de tarefa/configuração e gravação de execução;
- `family-alarm-client.js` — ciclo próprio de 5 minutos para `despertadores`;
- `client-session-integrity.js` — atualização de retornos de resgate;
- `client-history-reconciler.js` — migração/reconciliação histórica;
- `client-offline-execution-integrity-v1.js` — reconciliação de travas locais.

**Direção:** separar claramente leitura central, gravações de ação e rotinas de reparo/migração.

### C. Orçamento atual de Firebase
O ciclo central de 5 minutos consulta:
1. `tarefas`
2. `historico`
3. `recompensas`
4. `resgates`
5. `conquistas` do perfil
6. `conquistas` coletivas (`__ALL__`)
7. `configGrupos`

Além disso, `family-alarm-client.js` mantém uma oitava consulta periódica independente para `despertadores`.

Observação: o custo real do Firestore depende da quantidade de documentos retornados, portanto o maior risco não é apenas o número de queries, mas especialmente reler histórico e catálogos inteiros sem necessidade.

**Direção:** manter cache-first, reduzir o conteúdo do ciclo de 5 minutos ao que realmente pode mudar externamente e evitar qualquer releitura geral após uma ação local.

### D. Histórico é o principal candidato a redução de custo
O histórico completo é carregado no ciclo central e também é usado por módulos de pontos, semana e integridade. O módulo de reconciliação ainda possui uma migração que, quando necessária, consulta `tarefas`, `historico` e `execucoes`.

**Direção:** separar histórico operacional recente de histórico acumulado. A tela deve receber apenas a janela necessária; migrações devem ser pontuais, versionadas e não fazer parte do fluxo normal.

### E. Alarmes têm sincronização independente
O módulo de alarmes usa cache local, fila offline e reconciliação, mas possui seu próprio timer de 5 minutos para o Firestore.

**Direção:** preservar a lógica de alarmes, porém integrar a leitura periódica ao scheduler central do Participante para evitar dois relógios de sincronização concorrentes.

### F. Há wrappers sobre funções globais
`client-session-integrity.js` e `client-offline-execution-integrity-v1.js` envolvem funções como `iniciarTarefa`, `finalizarTarefa`, `confirmarJustificativaAtraso` e `optarJustificarAtraso`.

**Direção:** consolidar essas proteções em um único `Task Engine`, sem sobrescrever sucessivamente funções globais.

### G. Há código morto/compatibilidade temporária
Foram encontrados identificadores de listeners antigos, aliases temporários, funções de reparo não chamadas e camadas de compatibilidade que permanecem no runtime.

**Direção:** retirar somente depois de teste de contrato, sem apagar histórico/rollback por impulso.

## 3. Arquitetura-alvo

1. **Bootstrap único** — composição explícita dos módulos.
2. **Session/Auth** — uma única camada de sessão permanente.
3. **Participant Store** — fonte única em memória/cache.
4. **Firebase Repository** — leitura/gravação centralizada e contabilizável.
5. **Sync Scheduler** — um único relógio de sincronização.
6. **Task Engine** — início, fim, ordem, tolerância, pontos e justificativa.
7. **Offline Queue** — idempotência e reconciliação.
8. **UI Modules** — apenas consomem o Store.
9. **Telemetry** — mede origem, tempo e quantidade sem provocar leitura extra.

## 4. Regras obrigatórias da Sprint 2.1

- Uma regra funcional = um proprietário.
- Nenhum `onSnapshot` funcional permanente por tela/módulo.
- Cache local primeiro quando válido.
- Gravação local atualiza Store/cache imediatamente.
- Uma gravação não dispara releitura geral do Firebase.
- Toda consulta remota deve ter motivo, frequência e coleção conhecidos.
- O ciclo periódico não deve rodar com o app oculto.
- Offline não pode duplicar execução, histórico ou pontuação.
- Histórico e `execucoes` não são apagados na virada semanal.
- Tarefas inativas permanecem inativas.

## 5. Ordem de refatoração aprovada

### Bloco 1 — Bootstrap e mapa de proprietários
Consolidar a composição do runtime sem mudar comportamento funcional.

### Bloco 2 — Store + Repository + Sync Scheduler
Centralizar leituras e orçamento Firebase.

### Bloco 3 — Task Engine
Unificar wrappers e regras de execução/tolerância/pontos.

### Bloco 4 — Offline
Consolidar fila, travas e reconciliação idempotente.

### Bloco 5 — UI e módulos auxiliares
Remover patches de interface já substituídos pelo código canônico.

### Bloco 6 — Auditoria final
Teste online/offline, sessão permanente, semana, tarefas, pontos, recompensas, desafios, alarmes, mascotes, logs e orçamento Firebase.

## 6. Próximo corte técnico

O próximo passo será o **Bloco 1: Bootstrap e mapa de proprietários**. A primeira mudança deverá ser comportamentalmente neutra: tornar explícito o runtime que hoje é composto em camadas, sem alterar regras de tarefa, pontuação, alarmes ou offline.
