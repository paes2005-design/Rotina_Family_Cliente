# Agendador OneSignal sem Firebase Blaze

Este Cloudflare Worker reconcilia a coleção `despertadores` do Firestore com mensagens agendadas no OneSignal. O navegador apenas grava o alarme. O Worker cria `send_after`, cancela mensagens retiradas ou alteradas e desativa alarmes antigos na virada da semana.

## Segredos obrigatórios

Nunca coloque estes valores no repositório ou no navegador:

- `ONESIGNAL_REST_API_KEY`: chave REST do aplicativo OneSignal.
- `GOOGLE_SERVICE_ACCOUNT_JSON`: JSON completo de uma conta de serviço Google com acesso somente ao Firestore necessário.

Cadastre-os pelo painel do Cloudflare Worker em **Settings > Variables and Secrets** como `Secret`, ou pelo terminal:

```sh
npx wrangler secret put ONESIGNAL_REST_API_KEY
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
```

## Publicação

1. Crie uma conta gratuita Cloudflare.
2. Crie uma conta de serviço no Google Cloud com o papel mínimo `Cloud Datastore User` no projeto `sistema-de-metas-diarias` e gere uma chave JSON.
3. No diretório `onesignal-scheduler`, execute `npm install` e `npx wrangler login`.
4. Cadastre os dois segredos acima sem colá-los em mensagens, arquivos ou commits.
5. Execute `npm test`, `npm run check` e `npx wrangler deploy`.
6. No OneSignal, confirme que a chave usada pertence ao App ID configurado em `wrangler.jsonc`.

O gatilho roda a cada minuto. Alterações pendentes são processadas imediatamente; uma varredura completa ocorre a cada cinco minutos e à meia-noite no fuso `America/Bahia`. O OneSignal recebe o horário final em UTC e entrega a notificação mesmo com a página fechada ou a tela apagada.

Os logs estruturados do Worker ficam habilitados no Cloudflare para auditoria das execuções, sem registrar códigos de família, perfis ou chaves secretas.

## Segurança e repetição

- A chave REST do OneSignal e a chave da conta de serviço ficam criptografadas como Secrets no Cloudflare.
- Cada ocorrência usa uma chave de idempotência estável, impedindo mensagens duplicadas durante retentativas.
- Alterar ou retirar um alarme cancela os IDs ainda agendados.
- Alarmes de uma semana anterior são desativados pelo próprio Worker, sem depender da abertura do aplicativo.
