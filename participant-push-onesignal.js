(function () {
  'use strict';

  const PUSH_RUNTIME_VERSION = 2;
  const APP_ID = '356292b3-a763-4a89-b0e5-21bf54bf0424';
  const SAFARI_WEB_ID = 'web.onesignal.auto.3a07767d-f8c5-4ebf-965b-cb322da40f9f';
  const BASE_PATH = new URL('./', window.location.href).pathname;
  const WORKER_PATH = `${BASE_PATH.replace(/^\/+/, '')}push/onesignal/OneSignalSDKWorker.js`;
  const WORKER_SCOPE = `${BASE_PATH}push/onesignal/`;

  let participanteAtual = '';
  let participantePendente = '';

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.rotinaParticipantPushRuntimeVersion = PUSH_RUNTIME_VERSION;

  const texto = value => String(value || '').trim();
  const grupoAtual = () => texto(localStorage.getItem('cliente_grupo'));
  const perfilAtual = () => texto(localStorage.getItem('cliente_perfil_id'));
  const externalId = (grupo, perfilId) => `rotina_family__${texto(grupo)}__${texto(perfilId)}`;
  const instalado = () => window.matchMedia?.('(display-mode: standalone)')?.matches === true || navigator.standalone === true;

  function log(evento, detalhes = {}, nivel = 'info') {
    try {
      window.rotinaLog?.(evento, { pushRuntimeVersion: PUSH_RUNTIME_VERSION, ...detalhes }, nivel);
    } catch (_) {}
  }

  async function aplicarIdentidade(OneSignal, grupo, perfilId, forcar = false) {
    const g = texto(grupo);
    const p = texto(perfilId);
    if (!g || !p) return false;
    const id = externalId(g, p);
    if (!forcar && (participanteAtual === id || participantePendente === id)) return true;
    if (participantePendente === id) return true;
    participantePendente = id;
    try {
      await OneSignal.login(id);
      await OneSignal.User.addTags({ grupoId: g, perfilId: p, aplicativo: 'participante' });
      participanteAtual = id;
      return true;
    } catch (error) {
      log('push.onesignal_identidade_erro', { mensagem: texto(error?.message || error).slice(0, 180) }, 'warning');
      return false;
    } finally {
      if (participantePendente === id) participantePendente = '';
    }
  }

  async function garantirAssinatura(OneSignal, motivo = 'runtime') {
    const permissao = typeof Notification !== 'undefined' ? Notification.permission : 'indisponivel';
    const antes = OneSignal.User.PushSubscription.optedIn === true;
    try {
      if (permissao === 'granted' && !antes) {
        await OneSignal.User.PushSubscription.optIn();
      }
      const g = grupoAtual();
      const p = perfilAtual();
      if (g && p) await aplicarIdentidade(OneSignal, g, p, false);
      const estado = {
        optedIn: OneSignal.User.PushSubscription.optedIn === true,
        id: OneSignal.User.PushSubscription.id || '',
        token: OneSignal.User.PushSubscription.token || '',
        externalId: g && p ? externalId(g, p) : '',
        erro: ''
      };
      log('push.onesignal_estado', {
        motivo,
        permissao,
        optedIn: estado.optedIn,
        temSubscriptionId: Boolean(estado.id),
        temToken: Boolean(estado.token),
        identificado: Boolean(estado.externalId),
        instalado: instalado()
      }, estado.optedIn && estado.id ? 'info' : 'warning');
      return estado;
    } catch (error) {
      const mensagem = texto(error?.message || error).slice(0, 180);
      log('push.onesignal_preparo_erro', { motivo, permissao, mensagem }, 'warning');
      return { optedIn: false, id: '', token: '', externalId: '', erro: mensagem };
    }
  }

  window.identificarParticipanteNoPush = function (grupo, perfilId) {
    const g = texto(grupo);
    const p = texto(perfilId);
    if (!g || !p) return;
    window.OneSignalDeferred.push(async OneSignal => {
      await aplicarIdentidade(OneSignal, g, p, false);
    });
  };
  window.identificarClienteNoPush = window.identificarParticipanteNoPush;

  window.ativarPushRotina = function () {
    return new Promise(resolve => {
      let concluido = false;
      const concluir = estado => {
        if (concluido) return;
        concluido = true;
        resolve(estado);
      };
      window.OneSignalDeferred.push(async OneSignal => {
        concluir(await garantirAssinatura(OneSignal, 'ativacao-explicita'));
      });
      setTimeout(() => concluir({ optedIn: false, id: '', token: '', externalId: '', erro: 'tempo-esgotado' }), 8000);
    });
  };

  window.obterStatusPushRotina = function (callback) {
    let concluido = false;
    const concluir = estado => {
      if (concluido) return;
      concluido = true;
      callback?.(estado);
    };
    window.OneSignalDeferred.push(OneSignal => {
      concluir({
        optedIn: OneSignal.User.PushSubscription.optedIn === true,
        id: OneSignal.User.PushSubscription.id || '',
        token: OneSignal.User.PushSubscription.token || '',
        erro: ''
      });
    });
    setTimeout(() => concluir({ optedIn: false, id: '', token: '', erro: 'tempo-esgotado' }), 4000);
  };

  window.desvincularParticipanteDoPush = function () {
    participanteAtual = '';
    participantePendente = '';
    window.OneSignalDeferred.push(async OneSignal => {
      try {
        await OneSignal.logout();
        log('push.onesignal_desvinculado');
      } catch (error) {
        log('push.onesignal_desvinculo_erro', { mensagem: texto(error?.message || error).slice(0, 180) }, 'warning');
      }
    });
  };
  window.desvincularClienteDoPush = window.desvincularParticipanteDoPush;

  window.addEventListener('rotina-client-session-ready', event => {
    window.identificarParticipanteNoPush(event.detail?.grupo, event.detail?.perfilId);
  });

  window.OneSignalDeferred.push(async function (OneSignal) {
    await OneSignal.init({
      appId: APP_ID,
      safari_web_id: SAFARI_WEB_ID,
      serviceWorkerPath: WORKER_PATH,
      serviceWorkerParam: { scope: WORKER_SCOPE },
      autoResubscribe: true,
      welcomeNotification: { disable: true },
      notifyButton: { enable: false },
      notificationClickHandlerMatch: 'origin',
      notificationClickHandlerAction: 'focus'
    });

    const detalhesNotificacao = event => {
      const notification = event?.notification || {};
      const data = notification.additionalData || notification.data || {};
      return {
        tipo: texto(data.tipo || 'push').slice(0, 60),
        momento: texto(data.momento).slice(0, 20),
        paginaVisivel: document.visibilityState === 'visible'
      };
    };

    OneSignal.Notifications.addEventListener('foregroundWillDisplay', event => {
      log('push.onesignal_primeiro_plano', detalhesNotificacao(event));
    });
    OneSignal.Notifications.addEventListener('click', event => {
      log('push.onesignal_clicado', detalhesNotificacao(event));
    });
    OneSignal.Notifications.addEventListener('dismiss', event => {
      log('push.onesignal_dispensado', detalhesNotificacao(event));
    });
    OneSignal.Notifications.addEventListener('permissionChange', permission => {
      log('push.onesignal_permissao_alterada', { permission: permission === true });
    });
    OneSignal.User.PushSubscription.addEventListener('change', async event => {
      const atual = event?.current || {};
      log('push.onesignal_assinatura_alterada', {
        optedIn: atual.optedIn === true,
        temSubscriptionId: Boolean(atual.id),
        temToken: Boolean(atual.token)
      });
      const g = grupoAtual();
      const p = perfilAtual();
      if (g && p && (atual.token || atual.optedIn)) {
        await aplicarIdentidade(OneSignal, g, p, true);
      }
    });

    const g = grupoAtual();
    const p = perfilAtual();
    if (g && p) await aplicarIdentidade(OneSignal, g, p, false);
    const permissao = typeof Notification !== 'undefined' ? Notification.permission : 'indisponivel';
    if (permissao === 'granted') await garantirAssinatura(OneSignal, 'startup-permissao-existente');
    else log('push.onesignal_runtime_pronto', {
      permissao,
      optedIn: OneSignal.User.PushSubscription.optedIn === true,
      temSubscriptionId: Boolean(OneSignal.User.PushSubscription.id),
      temToken: Boolean(OneSignal.User.PushSubscription.token),
      instalado: instalado()
    });
  });
})();
