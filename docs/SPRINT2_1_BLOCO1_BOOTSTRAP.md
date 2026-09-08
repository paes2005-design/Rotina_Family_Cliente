# Rotina Family — Sprint 2.1 — Bloco 1

## Bootstrap único e mapa de proprietários

Status: **implementado — aguardando teste funcional**  
Build do Participante: **20260907.2**  
Service Worker esperado: **v79**

## Objetivo

Retirar a composição espalhada entre `index.html`, `client-ui-pro.js` e o Service Worker, sem alterar a regra funcional de tarefas, pontuação, tolerância, offline, recompensas, conquistas ou alarmes.

## O que mudou

1. Criado `client-bootstrap-v1.js` como manifesto central de módulos do runtime.
2. `index.html` deixou de injetar individualmente Auth, Offline, Comercial, Telemetria e patches visuais. Agora injeta somente o bootstrap.
3. O Service Worker deixou de injetar vários scripts de compatibilidade. Em navegação direta ele injeta somente o bootstrap e normaliza as versões do shell.
4. `client-ui-pro.js` deixou de importar módulos funcionais. Ele permanece apenas como camada de decoração/interação da UI.
5. O bootstrap passou a carregar explicitamente Time Guard, integridade de sessão, pontos revisados, início antecipado, tolerância, semana, alarmes, reparo de histórico, mascote, feedback 0%, Auth, Offline, Comercial, Telemetria e auxiliares visuais.
6. `commercial-access-client.js` tinha uma dependência oculta para `client-dog-only.js`, arquivo inexistente no repositório. A importação quebrada foi removida. A integridade de sessão também deixou de ser importada escondida pelo Comercial e agora é carregada somente pelo bootstrap.
7. O build passou para `20260907.2`, cache `rotina-family-participante-v79` e Service Worker `79`.

## Mapa de proprietários do runtime

| Área | Proprietário atual no Bloco 1 |
|---|---|
| Entrada / composição | `client-bootstrap-v1.js` |
| Sessão / autenticação | `client-auth-session-v1.js` |
| Tempo / validação temporal | `client-time-guard-v3.js` |
| Integridade de sessão | `client-session-integrity.js` |
| Pontos revisados / apresentação | `client-reviewed-points.js` |
| Início antecipado / apresentação | `client-early-start-ui.js` |
| Cronômetro de tolerância | `client-tolerance-timer.js` |
| Navegação semanal | `client-week-nav.js` |
| Alarmes | `family-alarm-client.js` |
| Reparos históricos | `client-history-reconciler.js` |
| Integridade offline | `client-offline-execution-integrity-v1.js` |
| Fonte de execução | `client-execution-source-unifier-v1.js` |
| Acesso comercial | `commercial-access-client.js` |
| Mascote / reações | `client-mascot-v3.js` + auxiliares visuais |
| Telemetria | `app-monitoring.js` / `app-monitoring-extra-v1.js` |
| Cache de shell / offline de assets | `sw.js` |
| Decoração da tabela / proteção visual de clique | `client-ui-pro.js` |

## Regra de economia de Firebase neste bloco

O Bloco 1 não adiciona nenhuma consulta Firestore. Ele reorganiza carregamento e propriedade dos módulos. A redução do orçamento de leituras começa no Bloco 2, quando Store, Repository e Sync Scheduler serão consolidados.

A remoção do carregamento duplicado/oculto de `client-session-integrity.js` também evita a possibilidade de efeitos laterais repetidos do mesmo módulo.

## Critérios para considerar o Bloco 1 aprovado

- O Participante abre na build `20260907.2`.
- Service Worker reporta `79`.
- Sessão permanente continua restaurando normalmente.
- `bootstrap.pronto` aparece sem falha crítica.
- Tarefas aparecem e Iniciar/Finalizar continuam funcionando.
- Tolerância e segundos permanecem iguais ao comportamento aprovado.
- Navegação da semana permanece funcional.
- Offline/cache continuam disponíveis.
- Recompensas, conquistas, alarmes e mascotes carregam normalmente.
- Nenhuma nova consulta Firebase foi criada pelo bootstrap.

## Próximo passo

Após o teste do Bloco 1, iniciar **Bloco 2 — Participant Store + Firebase Repository + Sync Scheduler**, com foco em reduzir as consultas periódicas e eliminar timers concorrentes.
