# Deploy Master identity fix

Publicação autorizada em 2026-08-20.

Objetivo: promover a correção que separa a autoridade do ADM Master da coleção comercial `administradores`/`grupoId`, mantendo Firebase Authentication + `MASTER_ADMIN_EMAILS` como autoridade.

O deploy do Worker é acionado pelo workflow existente ao alterar `onesignal-scheduler/src/index.js`.
