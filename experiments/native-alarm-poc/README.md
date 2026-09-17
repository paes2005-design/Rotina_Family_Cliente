# Rotina Family — Native Alarm POC v2

Status: EXPERIMENTAL / TEST ONLY

Esta versão continua isolada da PWA de produção. Firebase, OneSignal e a aplicação web não dependem deste experimento.

## Objetivo

Validar se um alarme explicitamente agendado pelo usuário inicia o áudio no Android com o app e a PWA fechados e o aparelho bloqueado, sem depender de toque no Push.

## Arquitetura v2

`AlarmManager.setAlarmClock()` → `AlarmReceiver` → `AlarmService` foreground → áudio de alarme.

A `AlarmActivity` é somente interface de alarme/controle. O áudio pertence ao `AlarmService` e não depende da Activity abrir em segundo plano.

## Teste de aceitação

1. Instale/atualize o APK experimental.
2. Autorize notificações e **Alarmes e lembretes** quando solicitado.
3. Toque em **AGENDAR TESTE PARA +2 MINUTOS**.
4. Feche completamente o app experimental e a PWA Rotina Family.
5. Bloqueie o aparelho e não toque no Push.
6. PASS: o áudio inicia sozinho no horário e pode ser parado pela ação **PARAR**.
7. FAIL: o áudio só inicia depois de abrir/tocar no app ou no Push, ou não inicia.

Nenhuma integração com `main` deve ser feita antes deste teste passar.
