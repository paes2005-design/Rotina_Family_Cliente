from pathlib import Path

HTML = Path('index-CLIENTE-v6.html')
CSS = Path('client-ui-pro.css')
ENTRY = Path('index.html')
SW = Path('sw.js')
RUNTIME = Path('runtime-build-info.js')
BOOTSTRAP = Path('client-bootstrap-v1.js')

BUILD_OLD = '20260913.1'
BUILD_NEW = '20260913.2'
SW_OLD = '84'
SW_NEW = '85'
RELEASE = 'sprint2.1-participant-observation-icon-v1'


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'Anchor not found: {label}')
    return text.replace(old, new, 1)


html = HTML.read_text(encoding='utf-8')

modal = '''    <div id="modalObservacaoTarefa" class="overlay" role="dialog" aria-modal="true" aria-labelledby="tituloModalObservacaoTarefa">
        <div class="modal-box observacao-tarefa-modal">
            <div class="observacao-tarefa-icone" aria-hidden="true">📝</div>
            <h3 id="tituloModalObservacaoTarefa" style="margin:8px 0 4px;">Observação da tarefa</h3>
            <strong id="tituloObservacaoTarefa" class="observacao-tarefa-titulo"></strong>
            <div id="textoObservacaoTarefa" class="observacao-tarefa-texto"></div>
            <button type="button" class="btn btn-observacao-fechar" onclick="fecharModal('modalObservacaoTarefa')">Fechar</button>
        </div>
    </div>

'''
if 'id="modalObservacaoTarefa"' not in html:
    anchor = '    <div id="modalFeedback" class="overlay">'
    if anchor not in html:
        raise SystemExit('Anchor not found: modalFeedback')
    html = html.replace(anchor, modal + anchor, 1)

helper = '''        function textoObservacaoTarefa(tarefa){
            for(const campo of ['observacao','observacoes','observações','nota','descricao']){
                const valor=String(tarefa?.[campo]||'').trim();
                if(valor)return valor;
            }
            return '';
        }
        window.abrirObservacaoTarefa = id => {
            const tarefa=cacheTarefasHoje.find(t=>t.id===id)||cacheTarefasTodas.find(t=>t.id===id);
            if(!tarefa)return;
            const observacao=textoObservacaoTarefa(tarefa);
            if(!observacao)return;
            const titulo=document.getElementById('tituloObservacaoTarefa');
            const texto=document.getElementById('textoObservacaoTarefa');
            const modal=document.getElementById('modalObservacaoTarefa');
            if(!titulo||!texto||!modal)return;
            titulo.textContent=tarefa.nome||'Tarefa';
            texto.textContent=observacao;
            modal.style.display='flex';
            window.rotinaLog?.('tarefa.observacao_aberta',{tarefaId:String(id||''),temObservacao:true});
        };

'''
if 'window.abrirObservacaoTarefa = id =>' not in html:
    anchor = '        function renderizarTarefasHoje(){'
    if anchor not in html:
        raise SystemExit('Anchor not found: renderizarTarefasHoje')
    html = html.replace(anchor, helper + anchor, 1)

render_anchor = "                tbody.insertAdjacentHTML('beforeend',`<tr data-family-task-id=\"${escaparHtml(dados.id)}\""
if 'const botaoObservacao=observacao?' not in html:
    if render_anchor not in html:
        raise SystemExit('Anchor not found: task row render')
    inject = "                const observacao=textoObservacaoTarefa(dados);\n                const botaoObservacao=observacao?`<button type=\"button\" class=\"btn-observacao-tarefa\" onclick=\"abrirObservacaoTarefa('${dados.id}')\" aria-label=\"Ver observação da tarefa ${escaparHtml(dados.nome)}\" title=\"Ver observação\">📝</button>`:'';\n"
    html = html.replace(render_anchor, inject + render_anchor, 1)

old_name = '<td><strong data-task-icon="${escaparHtml(dados.icone||\'\')}">${escaparHtml(dados.nome)}</strong>${dados.iniciouAposLimiteFinal?'
new_name = '<td><div class="task-name-line"><strong data-task-icon="${escaparHtml(dados.icone||\'\')}">${escaparHtml(dados.nome)}</strong>${botaoObservacao}</div>${dados.iniciouAposLimiteFinal?'
html = replace_once(html, old_name, new_name, 'task name + observation icon')

html = html.replace("navigator.serviceWorker.register('./sw.js?v=30')", f"navigator.serviceWorker.register('./sw.js?v={SW_NEW}',{{updateViaCache:'none'}})")
HTML.write_text(html, encoding='utf-8')

css = CSS.read_text(encoding='utf-8')
css_block = '''

/* Sprint 2.1 — acesso do participante à observação da tarefa */
.task-name-line{display:flex;align-items:center;gap:8px;min-width:0;width:100%}.task-name-line .task-name-wrap{flex:1;min-width:0}.btn-observacao-tarefa{width:32px;height:32px;flex:0 0 32px;border:1px solid color-mix(in srgb,var(--cor-clara) 82%,#fff);border-radius:10px;background:#fff;color:var(--cor-primaria);display:inline-flex;align-items:center;justify-content:center;font-size:17px;cursor:pointer;box-shadow:0 2px 8px rgba(15,23,42,.07);-webkit-tap-highlight-color:transparent}.btn-observacao-tarefa:hover{background:var(--cor-fundo);transform:translateY(-1px)}.btn-observacao-tarefa:focus-visible{outline:3px solid color-mix(in srgb,var(--cor-primaria) 32%,transparent);outline-offset:2px}.observacao-tarefa-modal{text-align:left}.observacao-tarefa-icone{font-size:2.4rem;text-align:center}.observacao-tarefa-titulo{display:block;text-align:center;color:var(--cor-primaria);font-size:1.05rem;margin-bottom:14px}.observacao-tarefa-texto{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--cor-fundo);border:1px solid var(--cor-clara);border-radius:14px;padding:14px;line-height:1.5;color:var(--cor-texto);max-height:46vh;overflow:auto}.btn-observacao-fechar{display:block;margin:16px auto 0;background:var(--cor-primaria);color:#fff;min-width:120px}.observacao-tarefa-modal h3{text-align:center;color:var(--cor-texto)}
@media(max-width:700px){.btn-observacao-tarefa{width:34px;height:34px;flex-basis:34px;font-size:18px}.observacao-tarefa-texto{font-size:.92rem;max-height:52vh}.task-name-line{gap:7px}}
'''
if 'Sprint 2.1 — acesso do participante à observação da tarefa' not in css:
    css += css_block
CSS.write_text(css, encoding='utf-8')

entry = ENTRY.read_text(encoding='utf-8')
entry = entry.replace(f"const BUILD='{BUILD_OLD}'", f"const BUILD='{BUILD_NEW}'")
entry = entry.replace(f"./client-bootstrap-v1.js?v={BUILD_OLD}", f"./client-bootstrap-v1.js?v={BUILD_NEW}")
entry = entry.replace("release:'sprint2.1-history-gap-reconciliation-v1'", f"release:'{RELEASE}'")
entry = entry.replace(f"serviceWorkerExpected:{SW_OLD}", f"serviceWorkerExpected:{SW_NEW}")
entry = entry.replace(f"navigator.serviceWorker.register('./sw.js?v=30')\",\"navigator.serviceWorker.register('./sw.js?v={SW_OLD}',{{updateViaCache:'none'}})\"", f"navigator.serviceWorker.register('./sw.js?v=30')\",\"navigator.serviceWorker.register('./sw.js?v={SW_NEW}',{{updateViaCache:'none'}})\"")
# Source HTML now already carries v85; keep loader compatible with older cached HTML too.
entry = entry.replace(".replace(\"navigator.serviceWorker.register('./sw.js?v=30')\",\"navigator.serviceWorker.register('./sw.js?v=85',{updateViaCache:'none'})\");", ".replace(\"navigator.serviceWorker.register('./sw.js?v=30')\",\"navigator.serviceWorker.register('./sw.js?v=85',{updateViaCache:'none'})\").replace(\"navigator.serviceWorker.register('./sw.js?v=85')\",\"navigator.serviceWorker.register('./sw.js?v=85',{updateViaCache:'none'})\");")
ENTRY.write_text(entry, encoding='utf-8')

sw = SW.read_text(encoding='utf-8')
sw = sw.replace("rotina-family-participante-v84", "rotina-family-participante-v85")
sw = sw.replace("const ROTINA_SW_VERSION='84'", "const ROTINA_SW_VERSION='85'")
sw = sw.replace("const ROTINA_BUILD_ID='20260913.1'", "const ROTINA_BUILD_ID='20260913.2'")
sw = sw.replace("navigator.serviceWorker.register('./sw.js?v=84',{updateViaCache:'none'})", "navigator.serviceWorker.register('./sw.js?v=85',{updateViaCache:'none'})")
SW.write_text(sw, encoding='utf-8')

runtime = RUNTIME.read_text(encoding='utf-8')
runtime = runtime.replace("build:'20260913.1'", "build:'20260913.2'")
runtime = runtime.replace("expectedServiceWorkerVersion:'84'", "expectedServiceWorkerVersion:'85'")
RUNTIME.write_text(runtime, encoding='utf-8')

bootstrap = BOOTSTRAP.read_text(encoding='utf-8')
bootstrap = bootstrap.replace("const BUILD='20260913.1'", "const BUILD='20260913.2'")
bootstrap = bootstrap.replace("runtime-build-info.js?v=20260913.1", "runtime-build-info.js?v=20260913.2")
BOOTSTRAP.write_text(bootstrap, encoding='utf-8')

# Final safety assertions.
html = HTML.read_text(encoding='utf-8')
css = CSS.read_text(encoding='utf-8')
entry = ENTRY.read_text(encoding='utf-8')
sw = SW.read_text(encoding='utf-8')
runtime = RUNTIME.read_text(encoding='utf-8')
bootstrap = BOOTSTRAP.read_text(encoding='utf-8')
assert 'id="modalObservacaoTarefa"' in html
assert 'window.abrirObservacaoTarefa = id =>' in html
assert 'const botaoObservacao=observacao?' in html
assert '${botaoObservacao}</div>' in html
assert 'btn-observacao-tarefa' in css
assert BUILD_NEW in entry and f'serviceWorkerExpected:{SW_NEW}' in entry
assert "ROTINA_SW_VERSION='85'" in sw and "ROTINA_BUILD_ID='20260913.2'" in sw
assert "expectedServiceWorkerVersion:'85'" in runtime and "build:'20260913.2'" in runtime
assert "const BUILD='20260913.2'" in bootstrap and 'runtime-build-info.js?v=20260913.2' in bootstrap
print('PARTICIPANT_OBSERVATION_ICON_MIGRATION=OK')
