# Agendador OneSignal sem Firebase Blaze

Este Cloudflare Worker reconcilia a coleção `despertadores` do Firestore com mensagens agendadas no OneSignal. O navegador apenas grava o alarme. O Worker cria `send_after`, cancela mensagens retiradas ou alteradas e desativa alarmes antigos na virada da semana.

## Segredos obrigatórios

Nunca coloque estes valores no repositório ou no navegador:

- `ONESIGNAL_REST_API_KEY`: chave REST do aplicativo OneSignal.
- `GOOGLE_SERVICE_ACCOUNT_JSON`: JSON completo de uma conta de serviço Google com acesso ao Firestore e ao Firebase Authentication usado pelo ADM Master.
- `MASTER_ADMIN_EMAILS`: lista privada, separada por vírgulas, dos e-mails autorizados como ADM Master.
- `APP_LOG_ENCRYPTION_KEY`: segredo longo e aleatório usado para criptografar os logs do aplicativo.

Cadastre-os pelo painel do Cloudflare Worker em **Settings > Variables and Secrets** como `Secret`, ou pelo terminal:

```sh
npx wrangler secret put ONESIGNAL_REST_API_KEY
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
npx wrangler secret put MASTER_ADMIN_EMAILS
npx wrangler secret put APP_LOG_ENCRYPTION_KEY
```

## Permissões da conta de serviço Google

A conta armazenada em `GOOGLE_SERVICE_ACCOUNT_JSON` é usada pelo Worker tanto para o Firestore quanto para as operações administrativas do Firebase Authentication. Ela precisa ter, no projeto `sistema-de-metas-diarias`, no mínimo:

- `Cloud Datastore User` para leitura e gravação no Firestore;
- `Firebase Authentication Admin` (`roles/firebaseauth.admin`) para listar usuários, editar e-mail, desativar/ativar, excluir login e enviar redefinição de senha.

Sem `roles/firebaseauth.admin`, a aba ADM Master consegue validar a sessão e o Worker continua saudável, mas a listagem/alteração de usuários falha com `INSUFFICIENT_PERMISSION`.

## Publicação

1. Crie uma conta gratuita Cloudflare.
2. Crie uma conta de serviço no Google Cloud para o projeto `sistema-de-metas-diarias` e atribua os papéis `Cloud Datastore User` e `Firebase Authentication Admin`.
3. Gere a chave JSON dessa conta de serviço e salve o JSON completo em `GOOGLE_SERVICE_ACCOUNT_JSON` no Cloudflare.
4. No diretório `onesignal-scheduler`, execute `npm install` e `npx wrangler login`.
5. Cadastre os segredos acima sem colá-los em mensagens, arquivos ou commits.
6. Execute `npm test`, `npm run check` e `npx wrangler deploy`.
7. No OneSignal, confirme que a chave usada pertence ao App ID configurado em `wrangler.jsonc`.

O gatilho roda a cada minuto. Alterações pendentes são processadas imediatamente; uma varredura completa ocorre a cada cinco minutos e à meia-noite no fuso `America/Bahia`. O OneSignal recebe o horário final em UTC e entrega a notificação mesmo com a página fechada ou a tela apagada.

O mesmo Worker envia notificações de solicitações de recompensa ao ADM e de aprovação ou recusa ao Cliente. O direcionamento usa tags de grupo, perfil e aplicativo, permitindo que o mesmo navegador esteja inscrito no Cliente e no ADM sem trocar a identidade da assinatura.

## Monitoramento e logs

- `GET /monitoramento` apresenta o estado sanitizado do Worker, os últimos 30 ciclos e as versões ativas.
- Cada mensagem de alarme é consultada novamente no OneSignal após o envio. O Firestore registra quantas entregas chegaram ao serviço push, quantas foram confirmadas pelos aparelhos e quantas falharam.
- Cliente e ADM enviam ações, sincronização, conectividade e erros JavaScript para `POST /app-log`, sem senhas, PINs, e-mails, justificativas ou textos digitados.
- O Worker sanitiza novamente os eventos e persiste somente conteúdo AES-GCM na coleção `appLogsSecure`. Logs legados são migrados para o formato criptografado e removidos da coleção antiga durante a varredura completa.
- `GET /admin-master/logs` exige um ID token Firebase válido e um e-mail presente em `MASTER_ADMIN_EMAILS`. A mesma proteção é aplicada às rotas de gerenciamento de usuários.
- Os logs do aplicativo expiram em sete dias e o Worker remove registros vencidos a cada hora.
- Os logs estruturados do Cloudflare continuam disponíveis em **Worker > Observability > Logs**.

Os logs estruturados do Worker ficam habilitados no Cloudflare para auditoria das execuções, sem registrar códigos de família, perfis ou chaves secretas.

## Segurança e repetição

- A chave REST do OneSignal e a chave da conta de serviço ficam criptografadas como Secrets no Cloudflare.
- A autoridade Master é definida somente no Secret do Cloudflare, não por campos públicos ou editáveis no Firestore.
- Cada ocorrência usa uma chave de idempotência estável, impedindo mensagens duplicadas durante retentativas.
- Alterar ou retirar um alarme cancela os IDs ainda agendados.
- Alarmes de uma semana anterior são desativados pelo próprio Worker, sem depender da abertura do aplicativo.
