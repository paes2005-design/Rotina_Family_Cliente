# Rotina Family — Sprint 2.1 / Bloco 2A

## Auditoria de Firestore, sincronização e timers do Participante

**Data:** 09/09/2026  
**Status:** ETAPA 1 CONCLUÍDA — mapa técnico fechado para iniciar Participant Store + Firebase Repository + Sync Scheduler único.

## Objetivo

Fechar o levantamento iniciado no Bloco 1 e identificar, no runtime atual do Participante, todos os pontos relevantes de leitura/gravação do Firestore, ciclos recorrentes, fallbacks de cache/servidor e timers que devem ou não pertencer ao futuro scheduler central. Esta etapa é somente de auditoria: não altera regra de tarefa, horário, tolerância, pontuação, justificativa, despertador, push, offline, recompensas ou conquistas.

## Resumo executivo

O Participante já possui uma base de cache compartilhado em `index-CLIENTE-v6.html`, exposta por `window.rotinaClientCacheSnapshot()`. Porém, essa responsabilidade ainda está embutida no HTML e não é a única dona do acesso ao Firestore.

Foram encontrados **dois ciclos independentes de consulta ao Firebase a cada 5 minutos**:

1. `index-CLIENTE-v6.html`: tarefas, histórico, recompensas, resgates, conquistas do perfil, conquistas globais e configuração do grupo.
2. `family-alarm-client.js`: despertadores do perfil.

O maior custo recorrente identificável é a leitura de **todo o `historico` do participante em cada ciclo de 5 minutos**, mesmo quando nenhuma tela precisa de histórico completo naquele momento.

Também existem módulos de regra/integridade que ainda acessam o Firestore diretamente. Portanto, o próximo bloco deve extrair o cache central do HTML para um `ParticipantStore`, colocar todo I/O Firestore atrás de um `FirebaseRepository` e deixar apenas um `SyncScheduler` responsável pelas consultas periódicas.

## Mapa de propriedade atual

| Arquivo / módulo | Leituras | Gravações | Timer / gatilho | Destino no Bloco 2 |
|---|---|---|---|---|
| `index-CLIENTE-v6.html` | `tarefas`, `historico`, `recompensas`, `resgates`, `conquistas` perfil + `__ALL__`, `configGrupos`; login em `perfis` | tarefas, execuções, histórico, justificativas, resgates; migração de PIN | sync cache → servidor no início; `setInterval` 5 min; stale em visibility/online; `rotina-request-sync` | Extrair Store/Repository/Scheduler. HTML deixa de ser proprietário de dados. |
| `client-time-guard-v3.js` | primeiro Store compartilhado; depois memória; Firestore cache; fallback servidor para tarefa e `configGrupos`; consulta de tarefas para ordem como último fallback | batch de início: `tarefas` + `execucoes`; batch de término: `tarefas` + `historico` + `execucoes` | sem polling permanente; retries de bootstrap e espera curta de commit | Manter regra temporal/pontuação; mover toda leitura/gravação para Repository/Store. |
| `family-alarm-client.js` | `despertadores`, cache e servidor | `despertadores`, fila offline, silenciamento compartilhado, expiração de alarmes antigos | **segundo `setInterval` Firebase de 5 min**; além de timers locais de relógio/alarme | Despertadores entram no Store/Repository e no único Sync Scheduler. Timers funcionais permanecem no módulo. |
| `client-history-reconciler.js` | migração pontual consulta `tarefas`, `historico`, `execucoes`; reparo diário já usa cache central | batches corretivos em tarefas/histórico/execuções | migração única; reparo após cache de servidor com TTL 5 min | Repository para migração/reparo. Não criar polling próprio. |
| `client-offline-execution-integrity-v1.js` | usa histórico do cache central; fallback atual usa `getDocFromCache` | recuperação de `historico` e `tarefas` a partir da trava local | retries curtos de instalação e timers pós-ação; sem polling Firebase permanente | Preservar trava offline; writes passam pelo Repository. |
| `client-session-integrity.js` | resgates pelo cache central | marca retorno histórico de resgate como visto; existe função legada de limpeza direta de tarefa sem chamada ativa identificada | retry curto de instalação; eventos de sessão/cache | Remover write legado morto e encaminhar patch de resgate pelo Repository. |
| `client-reviewed-points.js` | somente `rotinaClientCacheSnapshot().historico` | nenhuma | eventos de cache; sem polling | Já alinhado ao futuro Store. |
| `client-early-start-ui.js` | somente tarefas do cache central | nenhuma | eventos de cache/sessão | Já alinhado ao futuro Store. |
| `client-week-nav.js` | tarefas + histórico do cache central | nenhuma | eventos/MutationObserver | Já alinhado ao futuro Store. |
| `client-execution-source-unifier-v1.js` | histórico do cache central | nenhuma | eventos + timeouts curtos | Já alinhado ao futuro Store. |
| `client-tolerance-timer.js` | tarefas do cache central | nenhuma | `setInterval` 1 s para cronômetro visual | **Manter.** É timer funcional local, não consulta Firebase. |
| `client-zero-feedback-v4.js` | nenhuma leitura Firebase | nenhuma | polling curto de modal, máximo 60 s | Manter; não pertence ao scheduler de dados. |
| `client-mascot-v3.js` | sem Firestore; apenas assets locais | nenhuma | sem polling Firebase | Fora do Repository/Scheduler. |
| `commercial-access-client.js` | HTTP Worker `/commercial/access-status`, não Firestore | nenhuma | `setInterval` 60 s + focus/online/visibility | **Separado do Firebase Scheduler.** É controle comercial/segurança. |
| `client-auth-session-v1.js` | Firebase Auth + Worker de sessão, não Firestore | Auth/local session | observer de Auth de uso pontual e retries transitórios | Fora do Firebase Repository de dados. |
| `app-monitoring.js` | HTTP Worker de telemetria, não Firestore | logs | `setInterval` 5 s; também faz import dinâmico de `client-action-guard-v1.js` | Não entra no scheduler Firebase. Registrar import escondido para limpeza de ownership. |
| `app-monitoring-extra-v1.js` | nenhuma | logs via telemetria | `setInterval` 500 ms para snapshot visual | Candidato a redução/remoção após fase de testes; não é Firebase. |
| `client-action-guard-v1.js` | nenhuma | nenhuma | retry de instalação 500 ms, máximo 30 vezes | Manter como proteção de UI, mas carregar pelo bootstrap, não pela telemetria. |
| `client-emergency-compensation-20260826.js` | Worker HTTP apenas | backend via Worker | gatilhos/eventos; ativo somente em 26/08/2026 | Compatibilidade histórica hoje inativa; candidato a retirada do runtime após conferência. |

## Consultas periódicas que precisam ser centralizadas

### Ciclo atual principal

A cada 5 minutos o HTML principal consulta no servidor:

- `tarefas` do participante;
- `historico` do participante;
- `recompensas` do grupo;
- `resgates` do participante;
- `conquistas` do participante;
- `conquistas` globais `__ALL__`;
- `configGrupos/<grupo>`.

No início da sessão, o mesmo conjunto passa primeiro pelo cache persistente e depois pelo servidor. Há ainda atualização por retorno de visibilidade, reconexão e evento `rotina-request-sync`.

### Ciclo paralelo do despertador

`family-alarm-client.js` mantém uma segunda rotina própria de 5 minutos para `despertadores`, além de fazer carga cache → servidor na inicialização. Esse ciclo é redundante como infraestrutura e deve ser absorvido pelo scheduler central.

## Leituras diretas fora do ciclo principal

`client-time-guard-v3.js` já tenta o cache central primeiro, mas ainda possui fallbacks diretos ao Firestore para:

- documento de tarefa;
- configuração do grupo;
- lista de tarefas do participante para validar ordem.

Esses fallbacks devem continuar existindo conceitualmente, porém executados pelo `FirebaseRepository`, para que o módulo de regra não conheça `getDoc`, `getDocs`, cache ou servidor.

`client-history-reconciler.js` ainda faz uma migração corretiva de pontuação com três consultas próprias (`tarefas`, `historico`, `execucoes`). É um processo pontual, não um polling, mas também deve ser encapsulado no Repository.

## Gravações diretas que precisam mudar de dono

As seguintes regras devem continuar iguais, mudando apenas o proprietário do I/O:

- início de tarefa: `tarefas` + `execucoes`;
- término: `tarefas` + `historico` + `execucoes`;
- justificativa e edição de justificativa;
- pedido de resgate;
- ativação/retirada/silenciamento de despertador;
- reconciliação offline;
- reparo de histórico/pontuação;
- marcação de retorno antigo de recompensa como visto.

O Repository deve preservar batches e atomicidade já existentes. Uma gravação confirmada no Firebase deverá atualizar/patchar o Store local e reiniciar o contador central, **sem uma releitura geral imediatamente após a gravação**.

## Timers que NÃO devem ser removidos pelo Bloco 2

Centralizar sincronização não significa eliminar timers funcionais. Devem permanecer fora do `SyncScheduler`:

- cronômetro visual de tolerância: 1 s;
- verificação local do despertador: 1 s;
- relógio do overlay do alarme: 1 s enquanto toca;
- repetição do som enquanto o alarme toca;
- virada/limpeza local da agenda de despertadores: 30 s;
- retries curtos de inicialização e timeouts de UX;
- controle comercial HTTP de 60 s, por ser uma proteção independente do Firestore;
- telemetria, embora os ciclos de 5 s e principalmente 500 ms devam ser revistos na limpeza pós-testes por custo de CPU/logs.

## Achados adicionais de arquitetura

1. `app-monitoring.js` ainda carrega `client-action-guard-v1.js` por `import()` dinâmico. Isso é um carregamento escondido fora do bootstrap e deve ser corrigido para preservar a regra de propriedade única estabelecida no Bloco 1.
2. `client-emergency-compensation-20260826.js` continua no bootstrap apesar de só atuar na data histórica de 26/08/2026. É candidato a remoção após confirmar que a compensação não precisa mais permanecer disponível.
3. Há diferença de metadado entre o bootstrap (`BUILD='20260908.2'`) e o Service Worker atual (`20260908.3`, SW 82). Isso não altera a auditoria de Firebase, mas deve ser normalizado na próxima publicação funcional.
4. Existem funções/imports legados de Firestore em módulos que já foram substituídos por fluxos novos. A migração deve remover código morto em vez de apenas deixá-lo sem uso.

## Arquitetura de destino aprovada para implementação

### ParticipantStore

Única fotografia dos dados ativos do participante em memória. Recebe cache inicial, patches de gravação e reconciliações do servidor. Expõe snapshots/eventos para os módulos de UI e regra.

### FirebaseRepository

Único módulo autorizado a conhecer Firestore para dados operacionais. Centraliza queries, cache vs. servidor, batches, patches e tratamento de falha. Auth e endpoints HTTP do Worker continuam separados.

### SyncScheduler

Único proprietário da sincronização periódica Firebase. Um contador de 5 minutos, stale-aware. Ações que já falaram com o servidor reiniciam o contador. Não cria reread amplo após cada write.

O sync automático deve trabalhar com um conjunto **quente** de dados. `historico` completo não deve ser relido a cada 5 minutos; histórico deverá ter estratégia própria de TTL/consulta direcionada ou ser atualizado por patches das ações e por sincronização quando realmente necessário.

## Ordem recomendada para a implementação do Bloco 2

1. Extrair o snapshot/cache central do `index-CLIENTE-v6.html` para `ParticipantStore` sem alterar comportamento.
2. Criar `FirebaseRepository` reproduzindo exatamente as queries atuais e o fluxo cache → servidor.
3. Criar `SyncScheduler` único e migrar o ciclo principal de 5 minutos.
4. Incorporar `despertadores` ao Store/Repository e remover o segundo polling de 5 minutos do módulo de alarmes.
5. Migrar I/O do `client-time-guard-v3.js` para Repository mantendo integralmente as regras temporais e de pontuação.
6. Migrar writes de integridade offline, session integrity e history reconciler.
7. Separar o histórico pesado do hot sync periódico.
8. Limpar imports mortos, carregamento escondido do action guard e compatibilidades históricas comprovadamente obsoletas.
9. Só então executar auditoria de consumo e teste funcional completo.

## Critério de sucesso do Bloco 2

- apenas um scheduler de sincronização Firebase;
- nenhum módulo de UI faz query Firestore direta;
- regras de tarefa/tempo/pontos não mudam;
- despertador e push permanecem com o comportamento aprovado;
- offline continua preservando primeira conclusão;
- writes confirmados patcham o Store e reiniciam o relógio de 5 min sem reread completo;
- histórico completo deixa de ser consulta automática a cada 5 min;
- cache-first continua permitindo abertura rápida;
- nenhuma nova leitura Firebase é criada como efeito colateral da refatoração.

## Estado da Sprint 2.1

**Bloco 1: APROVADO.**  
**Bloco 2A / Etapa 1 — Auditoria de Firebase e timers: CONCLUÍDA.**  
**Próximo passo:** iniciar a implementação do `FirebaseRepository` + `ParticipantStore`, começando pela extração da infraestrutura já existente no HTML, sem mudança funcional.