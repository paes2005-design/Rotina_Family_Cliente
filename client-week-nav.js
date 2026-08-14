import { getApps } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const DIAS = [
  { dia: 'Segunda', rotulo: 'Seg' },
  { dia: 'Terça', rotulo: 'Ter' },
  { dia: 'Quarta', rotulo: 'Qua' },
  { dia: 'Quinta', rotulo: 'Qui' },
  { dia: 'Sexta', rotulo: 'Sex' },
  { dia: 'Sábado', rotulo: 'Sáb' },
  { dia: 'Domingo', rotulo: 'Dom' }
];
const NOMES = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const EXIBICAO = {
  Domingo: 'Domingo',
  Segunda: 'Segunda-feira',
  Terça: 'Terça-feira',
  Quarta: 'Quarta-feira',
  Quinta: 'Quinta-feira',
  Sexta: 'Sexta-feira',
  Sábado: 'Sábado'
};

let diaSelecionado = NOMES[new Date().getDay()];
let tarefasSemana = [];
let htmlHoje = '';
let escrevendoTabela = false;
let unsubscribeSemana = null;
let chaveSessao = '';

const hojeTexto = () => NOMES[new Date().getDay()];
const escapar = (texto) => String(texto ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const horaComSegundos = (valor, fim=false) => {
  const s = String(valor || '').trim();
  if(/^\d{1,2}:\d{2}:\d{2}$/.test(s)) return s;
  if(/^\d{1,2}:\d{2}$/.test(s)) return `${s}:${fim ? '59' : '00'}`;
  return s;
};

function limparMarcaAntiga(){
  document.title = 'Rotina Family';
  const tituloLogin = document.querySelector('#telaAuth h2');
  if(tituloLogin && /metas/i.test(tituloLogin.textContent || '')) tituloLogin.textContent = 'Rotina Family';
  const botaoLogin = document.querySelector('#telaAuth button[onclick="conectarCliente()"]');
  if(botaoLogin && /meu espaço/i.test(botaoLogin.textContent || '')) botaoLogin.textContent = 'Entrar';
  document.querySelectorAll('h1,h2,h3,.titulo,.title').forEach(el => {
    const t = (el.textContent || '').trim().toLowerCase();
    if(t === 'meu espaço de metas' || t === 'meu espaco de metas') el.textContent = 'Rotina Family';
  });
}

function garantirNavegacao(){
  const tabela = document.querySelector('#telaApp table');
  if(!tabela) return null;
  let wrap = document.getElementById('semanaNavWrap');
  if(!wrap){
    wrap = document.createElement('div');
    wrap.id = 'semanaNavWrap';
    wrap.className = 'week-tabs-wrap';
    wrap.innerHTML = '<div class="week-tabs" id="semanaNav" role="tablist" aria-label="Dias da semana"></div><div class="week-cache-status" id="semanaCacheStatus">☁️ Preparando semana para uso offline...</div>';
    tabela.insertAdjacentElement('afterend', wrap);
  }
  renderizarAbas();
  return wrap;
}

function renderizarAbas(){
  const nav = document.getElementById('semanaNav');
  if(!nav) return;
  const hoje = hojeTexto();
  nav.innerHTML = DIAS.map(({dia,rotulo}) => {
    const selected = dia === diaSelecionado ? ' is-selected' : '';
    const today = dia === hoje ? ' is-today' : '';
    return `<button type="button" role="tab" class="week-tab${selected}${today}" aria-selected="${dia===diaSelecionado}" data-dia="${escapar(dia)}">${rotulo}</button>`;
  }).join('');
  nav.querySelectorAll('.week-tab').forEach(btn => btn.addEventListener('click', () => selecionarDia(btn.dataset.dia)));
}

function atualizarSubtitulo(){
  const el = document.getElementById('txtDiaSemana');
  if(!el) return;
  el.textContent = diaSelecionado === hojeTexto()
    ? 'Acompanhe suas janelas de prazos diários!'
    : `Consultando ${EXIBICAO[diaSelecionado] || diaSelecionado}`;
}

function escreverTabela(html){
  const tbody = document.getElementById('tabelaCorpo');
  if(!tbody) return;
  escrevendoTabela = true;
  tbody.innerHTML = html;
  queueMicrotask(() => { escrevendoTabela = false; });
}

function renderizarDiaConsulta(){
  if(diaSelecionado === hojeTexto()) return;
  const lista = tarefasSemana
    .filter(t => t.diaSemana === diaSelecionado)
    .sort((a,b) => (a.horaSugeridaInicio || '').localeCompare(b.horaSugeridaInicio || ''));
  if(!lista.length){
    escreverTabela(`<tr><td colspan="4" style="text-align:center">Nenhuma tarefa cadastrada para ${escapar(EXIBICAO[diaSelecionado] || diaSelecionado)}.</td></tr>`);
    return;
  }
  const html = lista.map(dados => {
    const status = dados.status || 'Pendente';
    let cls = 'status-pendente';
    if(status === 'Em andamento') cls = 'status-andamento';
    else if(status.includes('Prazo')) cls = 'status-prazo';
    else if(status.includes('Atrasado')) cls = 'status-atrasado';
    let horario = `<div class="horario-container"><span class="horario-sugerido">⏰ ${escapar(horaComSegundos(dados.horaSugeridaInicio,false))} - ${escapar(horaComSegundos(dados.horaSugeridaFim,true))}</span>`;
    if(dados.horarioInicio) horario += `<span class="horario-real">▶️ ${escapar(dados.horarioInicio)}${dados.horarioTermino ? ` / ⏹️ ${escapar(dados.horarioTermino)}` : ''}</span>`;
    horario += '</div>';
    const alerta = dados.iniciouAposLimiteFinal
      ? '<br><span style="color:#d90429;font-weight:bold;font-size:.85rem">🔴 Início após o limite final</span>'
      : dados.iniciouComAtraso
        ? '<br><span style="color:#d97706;font-weight:bold;font-size:.85rem">⚠️ Iniciado com atraso</span>'
        : '';
    return `<tr><td>${horario}</td><td><strong data-task-icon="${escapar(dados.icone || '')}">${escapar(dados.nome)}</strong>${alerta}<br><small style="color:gray">${Number(dados.pontosMaximos)||0} pontos (Tolerância: ${Number(dados.tempoLimite)||0} min)</small></td><td><span class="status-badge ${cls}">${escapar(status)}</span></td><td><span class="week-readonly">Consulta</span></td></tr>`;
  }).join('');
  escreverTabela(html);
}

function selecionarDia(dia){
  if(!DIAS.some(d => d.dia === dia)) return;
  const hoje = hojeTexto();
  if(diaSelecionado === hoje){
    const tbody = document.getElementById('tabelaCorpo');
    if(tbody && !escrevendoTabela) htmlHoje = tbody.innerHTML;
  }
  diaSelecionado = dia;
  renderizarAbas();
  atualizarSubtitulo();
  if(diaSelecionado === hoje){
    if(htmlHoje) escreverTabela(htmlHoje);
  } else {
    renderizarDiaConsulta();
  }
}

function observarTabelaHoje(){
  const tbody = document.getElementById('tabelaCorpo');
  if(!tbody || tbody.dataset.weekObserved === '1') return;
  tbody.dataset.weekObserved = '1';
  if(diaSelecionado === hojeTexto()) htmlHoje = tbody.innerHTML;
  new MutationObserver(() => {
    if(escrevendoTabela) return;
    if(diaSelecionado === hojeTexto()) htmlHoje = tbody.innerHTML;
    else queueMicrotask(renderizarDiaConsulta);
  }).observe(tbody,{childList:true,subtree:false});
}

function atualizarBadgeCache(snapshot){
  const badge = document.getElementById('semanaCacheStatus');
  if(!badge) return;
  badge.textContent = snapshot?.metadata?.fromCache
    ? '☁️ Semana disponível offline'
    : '☁️ Semana atualizada e em cache';
}

function conectarCacheSemanal(){
  const grupo = (localStorage.getItem('cliente_grupo') || '').trim();
  const perfilId = (localStorage.getItem('cliente_perfil_id') || '').trim();
  const nome = (localStorage.getItem('cliente_nome') || '').trim();
  const novaChave = `${grupo}|${perfilId}|${nome}`;
  if(!grupo){
    if(unsubscribeSemana){ unsubscribeSemana(); unsubscribeSemana = null; }
    chaveSessao = '';
    return;
  }
  if(novaChave === chaveSessao && unsubscribeSemana) return;
  const app = getApps()[0];
  if(!app) return;
  if(unsubscribeSemana) unsubscribeSemana();
  chaveSessao = novaChave;
  const db = getFirestore(app);
  unsubscribeSemana = onSnapshot(
    query(collection(db,'tarefas'),where('grupoId','==',grupo)),
    { includeMetadataChanges: true },
    snapshot => {
      tarefasSemana = snapshot.docs
        .map(d => ({id:d.id,...d.data()}))
        .filter(t => t.perfilId ? t.perfilId === perfilId : t.perfilNome === nome);
      atualizarBadgeCache(snapshot);
      if(diaSelecionado !== hojeTexto()) renderizarDiaConsulta();
    },
    erro => {
      console.warn('Cache semanal indisponível:', erro);
      const badge = document.getElementById('semanaCacheStatus');
      if(badge) badge.textContent = '⚠️ Semana ainda não disponível offline';
    }
  );
}

function iniciar(){
  limparMarcaAntiga();
  garantirNavegacao();
  observarTabelaHoje();
  atualizarSubtitulo();
  conectarCacheSemanal();
  const app = document.getElementById('telaApp');
  if(app) new MutationObserver(() => {
    limparMarcaAntiga();
    garantirNavegacao();
    observarTabelaHoje();
    conectarCacheSemanal();
  }).observe(app,{attributes:true,attributeFilter:['style']});
  window.addEventListener('storage', conectarCacheSemanal);
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar, {once:true});
else iniciar();
