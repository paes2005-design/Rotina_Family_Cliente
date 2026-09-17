from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Trecho esperado não encontrado em {path}: {old[:90]!r}')
    if text.count(old) != 1:
        raise SystemExit(f'Trecho ambíguo em {path}: {old[:90]!r} ({text.count(old)} ocorrências)')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


# 1) Telemetria: de agora em diante o aplicativo é PARTICIPANTE.
p = Path('app-monitoring.js')
text = p.read_text(encoding='utf-8')
text = text.replace('window.__rotinaClientMonitoringRuntimeV5', 'window.__rotinaParticipanteMonitoringRuntimeV6')
text = text.replace("const APP_KIND = 'cliente';\nconst MONITOR_VERSION = 5;\nconst LOG_ENDPOINT", "const APP_KIND = 'participante';\nconst LEGACY_APP_KIND = 'cliente';\nconst MONITOR_VERSION = 6;\nconst LOG_ENDPOINT")
text = text.replace("const QUEUE_KEY = `rotinaFamily.monitorQueue.${APP_KIND}`;\nconst SESSION_KEY = `rotinaFamily.monitorSession.${APP_KIND}`;", "const QUEUE_KEY = `rotinaFamily.monitorQueue.${APP_KIND}`;\nconst LEGACY_QUEUE_KEY = `rotinaFamily.monitorQueue.${LEGACY_APP_KIND}`;\nconst SESSION_KEY = `rotinaFamily.monitorSession.${APP_KIND}`;")
old_read = """function readQueue() {\n  try {\n    const value = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');\n    return Array.isArray(value) ? value.slice(-300) : [];\n  } catch (_) { return []; }\n}\n"""
new_read = """function readQueue() {\n  try {\n    const atual = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');\n    const legado = JSON.parse(localStorage.getItem(LEGACY_QUEUE_KEY) || '[]');\n    const a = Array.isArray(atual) ? atual : [];\n    const l = Array.isArray(legado) ? legado : [];\n    const merged = [...l, ...a].slice(-300).map(item => ({ ...item, aplicativo: APP_KIND }));\n    if (l.length) localStorage.removeItem(LEGACY_QUEUE_KEY);\n    return merged;\n  } catch (_) { return []; }\n}\n"""
if old_read not in text:
    raise SystemExit('readQueue antigo não encontrado em app-monitoring.js')
text = text.replace(old_read, new_read, 1)
text = text.replace("const batch = queue.slice(0, amount).map(item => ({ ...item, grupoId:", "const batch = queue.slice(0, amount).map(item => ({ ...item, aplicativo: APP_KIND, grupoId:")
p.write_text(text, encoding='utf-8')

# 2) OneSignal: identidade do participante idempotente, sem login duplicado na mesma abertura.
p = Path('index-CLIENTE-v6.html')
text = p.read_text(encoding='utf-8')
old_identity = """        window.identificarClienteNoPush = function(grupo,perfilId) {\n            const g=String(grupo||'').trim(),p=String(perfilId||'').trim();\n            if(!g||!p)return;\n            window.OneSignalDeferred.push(async function(OneSignal) {\n                await OneSignal.login(`rotina_family__${g}__${p}`);\n                await OneSignal.User.addTags({grupoId:g,perfilId:p,aplicativo:'cliente'});\n            });\n        };\n"""
new_identity = """        let oneSignalParticipanteAtual='';\n        let oneSignalParticipantePendente='';\n        async function aplicarIdentidadeParticipanteNoPush(OneSignal,grupo,perfilId) {\n            const g=String(grupo||'').trim(),p=String(perfilId||'').trim();\n            if(!g||!p)return false;\n            const externalId=`rotina_family__${g}__${p}`;\n            if(oneSignalParticipanteAtual===externalId||oneSignalParticipantePendente===externalId)return true;\n            oneSignalParticipantePendente=externalId;\n            try{\n                await OneSignal.login(externalId);\n                await OneSignal.User.addTags({grupoId:g,perfilId:p,aplicativo:'participante'});\n                oneSignalParticipanteAtual=externalId;\n                return true;\n            }finally{\n                if(oneSignalParticipantePendente===externalId)oneSignalParticipantePendente='';\n            }\n        }\n        window.identificarParticipanteNoPush = function(grupo,perfilId) {\n            const g=String(grupo||'').trim(),p=String(perfilId||'').trim();\n            if(!g||!p)return;\n            window.OneSignalDeferred.push(async function(OneSignal) {\n                await aplicarIdentidadeParticipanteNoPush(OneSignal,g,p);\n            });\n        };\n        // Compatibilidade interna temporária para módulos antigos.\n        window.identificarClienteNoPush = window.identificarParticipanteNoPush;\n"""
if old_identity not in text:
    raise SystemExit('Bloco antigo identificarClienteNoPush não encontrado')
text = text.replace(old_identity, new_identity, 1)
old_logout = """        window.desvincularClienteDoPush = function() {\n            window.OneSignalDeferred.push(async function(OneSignal) { await OneSignal.logout(); });\n        };\n        window.addEventListener('rotina-client-session-ready',e=>window.identificarClienteNoPush(e.detail?.grupo,e.detail?.perfilId));\n"""
new_logout = """        window.desvincularParticipanteDoPush = function() {\n            oneSignalParticipanteAtual='';oneSignalParticipantePendente='';\n            window.OneSignalDeferred.push(async function(OneSignal) { await OneSignal.logout(); });\n        };\n        window.desvincularClienteDoPush = window.desvincularParticipanteDoPush;\n        window.addEventListener('rotina-client-session-ready',e=>window.identificarParticipanteNoPush(e.detail?.grupo,e.detail?.perfilId));\n"""
if old_logout not in text:
    raise SystemExit('Bloco antigo de logout/evento não encontrado')
text = text.replace(old_logout, new_logout, 1)
old_init_identity = """            const g=String(localStorage.getItem('cliente_grupo')||'').trim(),p=String(localStorage.getItem('cliente_perfil_id')||'').trim();\n            if(g&&p){await OneSignal.login(`rotina_family__${g}__${p}`);await OneSignal.User.addTags({grupoId:g,perfilId:p,aplicativo:'cliente'});}\n"""
new_init_identity = """            const g=String(localStorage.getItem('cliente_grupo')||'').trim(),p=String(localStorage.getItem('cliente_perfil_id')||'').trim();\n            if(g&&p)await aplicarIdentidadeParticipanteNoPush(OneSignal,g,p);\n"""
if old_init_identity not in text:
    raise SystemExit('Identificação duplicada pós-init não encontrada')
text = text.replace(old_init_identity, new_init_identity, 1)
p.write_text(text, encoding='utf-8')

# 3) Novo build para expulsar scripts antigos do PWA.
p = Path('index.html')
text = p.read_text(encoding='utf-8')
text = text.replace("const BUILD='20260827.4';", "const BUILD='20260827.5';")
text = text.replace(".replace('./app-monitoring.js?v=2','./app-monitoring.js?v=5')", ".replace('./app-monitoring.js?v=2','./app-monitoring.js?v=6')")
text = text.replace("navigator.serviceWorker.register('./sw.js?v=76',{updateViaCache:'none'})", "navigator.serviceWorker.register('./sw.js?v=77',{updateViaCache:'none'})")
text = text.replace("./runtime-build-info.js?v=20260827.4", "./runtime-build-info.js?v=20260827.5")
text = text.replace("release:'cliente-cache-first-v2-hotfix-sync'", "release:'participante-cache-first-v3-telemetria'")
text = text.replace("serviceWorkerExpected:73", "serviceWorkerExpected:77")
p.write_text(text, encoding='utf-8')

p = Path('sw.js')
text = p.read_text(encoding='utf-8')
text = text.replace("rotina-family-cliente-v76", "rotina-family-participante-v77")
text = text.replace("ROTINA_SW_VERSION='76'", "ROTINA_SW_VERSION='77'")
text = text.replace("ROTINA_BUILD_ID='20260827.4'", "ROTINA_BUILD_ID='20260827.5'")
text = text.replace("./runtime-build-info.js?v=20260827.4", "./runtime-build-info.js?v=20260827.5")
p.write_text(text, encoding='utf-8')

p = Path('runtime-build-info.js')
text = p.read_text(encoding='utf-8')
text = text.replace("app:'CLIENTE'", "app:'PARTICIPANTE'")
text = text.replace("build:'20260827.4'", "build:'20260827.5'")
text = text.replace("expectedServiceWorkerVersion:'75'", "expectedServiceWorkerVersion:'77'")
text = text.replace('Cliente v${INFO.appVersion}', 'Participante v${INFO.appVersion}')
text = text.replace('Rotina Family Cliente\\n', 'Rotina Family Participante\\n')
p.write_text(text, encoding='utf-8')

# Invariantes finais.
monitor = Path('app-monitoring.js').read_text(encoding='utf-8')
main = Path('index-CLIENTE-v6.html').read_text(encoding='utf-8')
entry = Path('index.html').read_text(encoding='utf-8')
sw = Path('sw.js').read_text(encoding='utf-8')
runtime = Path('runtime-build-info.js').read_text(encoding='utf-8')
assert "const APP_KIND = 'participante';" in monitor
assert "const MONITOR_VERSION = 6;" in monitor
assert "aplicativo:'participante'" in main
assert main.count('OneSignal.login(') == 1, f'Esperado 1 OneSignal.login, encontrado {main.count("OneSignal.login(")}'
assert 'aplicarIdentidadeParticipanteNoPush' in main
assert "const BUILD='20260827.5';" in entry
assert "sw.js?v=77" in entry
assert "ROTINA_SW_VERSION='77'" in sw
assert "ROTINA_BUILD_ID='20260827.5'" in sw
assert "app:'PARTICIPANTE'" in runtime
assert "expectedServiceWorkerVersion:'77'" in runtime
print('NORMALIZE_PARTICIPANTE_TELEMETRIA=OK')
