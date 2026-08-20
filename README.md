# Rotina Family — Aplicativo do Cliente

O **Rotina Family Cliente** é a interface utilizada pelos integrantes da família para acompanhar e executar as tarefas definidas pelos responsáveis no **Painel do Administrador**.

## Papel do Cliente

Cada integrante acessa seu espaço utilizando o código da família, seu nome e PIN. A partir daí, visualiza as tarefas do dia, horários planejados, pontuação disponível, sequência de desempenho, conquistas e recompensas.

O Cliente não define as regras da rotina: elas são determinadas pelo Administrador. Isso permite que os responsáveis mantenham o controle das tarefas, horários, pontos e recompensas enquanto o integrante recebe uma experiência simples e motivadora.

## Principais recursos

- Acesso individual por código da família, perfil e PIN.
- Tarefas organizadas por horário e sequência.
- Registro do horário real de início e término.
- Pontuação por cumprimento dentro do prazo.
- Justificativa de atraso por texto ou por fala convertida em texto.
- Consulta e edição das próprias justificativas registradas.
- Pontuação diária, semanal e mensal.
- Sequências e conquistas.
- Catálogo de recompensas.
- Histórico de pedidos de resgate com status pendente, autorizado ou recusado.
- Alarmes por tarefa vinculados à data real da ocorrência, com início, fim ou ambos.
- Celebração visual quando uma recompensa é aprovada.
- Orientação para conversar com os pais quando um pedido é recusado.
- Sincronização em tempo real com o Administrador.
- Suporte PWA e persistência local para uso após uma primeira sincronização online.

## Integração com o Administrador

As tarefas, pontos, perfis e recompensas exibidos no Cliente são definidos pelo Painel do Administrador. Ao concluir uma tarefa, justificar um atraso ou solicitar uma recompensa, o Cliente registra a ação no Firestore. O Administrador recebe essas informações e pode acompanhar o desempenho ou decidir sobre pedidos de recompensa.

## Contrato dos alarmes

A tarefa continua recorrente por dia da semana, usando os valores canônicos `Domingo`, `Segunda`, `Terça`, `Quarta`, `Quinta`, `Sexta` e `Sábado`. O alarme não é recorrente: ele pertence a uma ocorrência real e armazena `dataAgendada`, `semanaInicio`, `inicioEm` e `fimEm`. Na virada de domingo para segunda, os alarmes e silenciamentos da semana anterior expiram; a nova semana começa sem alarmes herdados.

O canal de notificação é exclusivamente o OneSignal Web. Ao autorizar notificações, cada navegador é inscrito e associado ao identificador externo `rotina_family__{grupoId}__{perfilId}`. O Worker dedicado em `push/onesignal/` recebe mensagens mesmo sem uma página aberta. O serviço em `onesignal-scheduler/` roda no Cloudflare Workers Free, lê mudanças pendentes no Firestore e cria ou cancela mensagens com `send_after` no OneSignal. A entrega com a página fechada e a tela apagada deixa de depender do temporizador do navegador. A chave REST do OneSignal e a conta de serviço Google permanecem somente nos Secrets do Cloudflare e nunca no navegador ou no repositório.

O toque local possui ação explícita para parar, também encerra ao dispensar a notificação e tem limite automático de dois minutos. Os snapshots do Firestore passam a substituir o estado antigo do aparelho; somente comandos offline ainda pendentes são sobrepostos até a sincronização.

## Experiência gamificada

O objetivo é transformar responsabilidades familiares em metas claras e recompensadoras. A interface utiliza pontuação, conquistas, sequências e celebrações para tornar o acompanhamento da rotina mais estimulante.

## Tecnologia

- HTML, CSS e JavaScript
- Firebase Firestore
- PWA / Service Worker
- GitHub Pages
- Web Speech API para reconhecimento de fala, quando suportada pelo navegador

## Aplicativo complementar

Este repositório corresponde ao **Aplicativo do Cliente**. Ele funciona em conjunto com o repositório **Rotina_Family_ADM**, utilizado pelos pais ou responsáveis.
