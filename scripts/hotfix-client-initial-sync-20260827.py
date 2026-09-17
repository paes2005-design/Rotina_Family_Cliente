from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Marcador ausente: {label}')
    return text.replace(old, new, 1)


p = Path('index-CLIENTE-v6.html')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    '            inicializarEscutasFirebase();',
    '            await iniciarEscutasFirebase();',
    'nome da função de inicialização',
)

old_sync = """            sincronizarDadosCliente('cache-inicial',false).finally(()=>sincronizarDadosCliente('servidor-inicial',true));
            sincronizacaoClienteTimer=setInterval(()=>{if(!document.hidden)sincronizarDadosCliente('intervalo-5min',true);},SINCRONIZACAO_CLIENTE_MS);"""
new_sync = """            const cargaInicial=sincronizarDadosCliente('cache-inicial',false)
                .then(()=>sincronizarDadosCliente('servidor-inicial',true))
                .catch(e=>{window.rotinaLog?.('sync.cliente_inicial_erro',{mensagem:String(e?.message||e)},'warning');return false;});
            sincronizacaoClienteTimer=setInterval(()=>{if(!document.hidden)sincronizarDadosCliente('intervalo-5min',true);},SINCRONIZACAO_CLIENTE_MS);"""
s = replace_once(s, old_sync, new_sync, 'cadeia cache + servidor inicial')

old_end = """                window.addEventListener('rotina-request-sync',e=>sincronizarDadosCliente(e.detail?.motivo||'solicitado',true));
            }
        }

        function horaSugeridaComSegundos"""
new_end = """                window.addEventListener('rotina-request-sync',e=>sincronizarDadosCliente(e.detail?.motivo||'solicitado',true));
            }
            return cargaInicial;
        }

        function horaSugeridaComSegundos"""
s = replace_once(s, old_end, new_end, 'retorno da carga inicial')
p.write_text(s, encoding='utf-8')

p = Path('index.html')
s = p.read_text(encoding='utf-8')
s = replace_once(s, "const BUILD='20260827.3';", "const BUILD='20260827.4';", 'build cliente')
s = replace_once(s, "./client-ui-pro.js?v=48", "./client-ui-pro.js?v=49", 'ui pro')
s = replace_once(s, "navigator.serviceWorker.register('./sw.js?v=75',{updateViaCache:'none'})", "navigator.serviceWorker.register('./sw.js?v=76',{updateViaCache:'none'})", 'service worker loader')
s = s.replace("runtime-build-info.js?v=20260827.3", "runtime-build-info.js?v=20260827.4")
s = s.replace("release:'cliente-cache-first-v2'", "release:'cliente-cache-first-v2-hotfix-sync'")
p.write_text(s, encoding='utf-8')

p = Path('sw.js')
s = p.read_text(encoding='utf-8')
s = replace_once(s, "rotina-family-cliente-v75", "rotina-family-cliente-v76", 'cache name')
s = replace_once(s, "ROTINA_SW_VERSION='75'", "ROTINA_SW_VERSION='76'", 'sw version')
s = replace_once(s, "ROTINA_BUILD_ID='20260827.3'", "ROTINA_BUILD_ID='20260827.4'", 'sw build')
s = s.replace("runtime-build-info.js?v=20260827.3", "runtime-build-info.js?v=20260827.4")
p.write_text(s, encoding='utf-8')

# Gate: entrada lê agora, cache antes do servidor, e só depois usa janela de 5 minutos.
main = Path('index-CLIENTE-v6.html').read_text(encoding='utf-8')
entry = Path('index.html').read_text(encoding='utf-8')
sw = Path('sw.js').read_text(encoding='utf-8')
assert 'inicializarEscutasFirebase();' not in main
assert 'await iniciarEscutasFirebase();' in main
assert "sincronizarDadosCliente('cache-inicial',false)" in main
assert ".then(()=>sincronizarDadosCliente('servidor-inicial',true))" in main
assert 'return cargaInicial;' in main
assert 'SINCRONIZACAO_CLIENTE_MS = 5 * 60 * 1000' in main
assert "BUILD='20260827.4'" in entry
assert "sw.js?v=76" in entry
assert "ROTINA_SW_VERSION='76'" in sw
print('HOTFIX_CLIENT_INITIAL_SYNC=OK')
