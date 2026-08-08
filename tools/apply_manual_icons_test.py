from pathlib import Path


def replace_once(text, old, new, label):
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    return text.replace(old,new,1)

html_path=Path('index-CLIENTE-v6.html')
html=html_path.read_text(encoding='utf-8')
old='<td><strong>${escaparHtml(dados.nome)}</strong>'
new='<td><strong data-task-icon="${escaparHtml(dados.icone||\'\')}">${escaparHtml(dados.nome)}</strong>'
html=replace_once(html,old,new,'task row explicit icon data')
html_path.write_text(html,encoding='utf-8')

ui_path=Path('client-ui-pro.js')
ui=ui_path.read_text(encoding='utf-8')
old="""      const icon=document.createElement('span');icon.className='task-icon-cliente';icon.setAttribute('aria-hidden','true');icon.textContent=iconeTarefa(strong.textContent||'');
"""
new="""      const icon=document.createElement('span');icon.className='task-icon-cliente';icon.setAttribute('aria-hidden','true');icon.textContent=(strong.dataset.taskIcon||'').trim()||iconeTarefa(strong.textContent||'');
"""
ui=replace_once(ui,old,new,'Client uses explicit icon before legacy fallback')
ui_path.write_text(ui,encoding='utf-8')
print('Client manual icon test patch applied successfully')
