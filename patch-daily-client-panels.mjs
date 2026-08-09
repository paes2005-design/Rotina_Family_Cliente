import fs from 'fs';
const file='index-CLIENTE-v6.html';
let s=fs.readFileSync(file,'utf8');
const replaceOnce=(from,to,label)=>{
  const n=s.split(from).length-1;
  if(n!==1) throw new Error(`${label}: expected 1 occurrence, found ${n}`);
  s=s.replace(from,to);
};

replaceOnce(
`        function renderizarRecompensasCliente(){
            const el=document.getElementById('recompensasCliente');if(!el)return; const saldo=saldoPontos();
            const catalogo=recompensasCache.map(r=>\`<div style="margin-top:7px">🎁 \${escaparHtml(r.nome)} — \${Number(r.pontos)||0} pts <button class="btn" style="padding:5px 9px" onclick="resgatarRecompensa('\${r.id}')" \${saldo<(Number(r.pontos)||0)?'disabled':''}>Resgatar</button></div>\`).join('')||'<div style="margin-top:7px">Nenhuma recompensa disponível.</div>';
            const hist=[...resgatesCache].sort((a,b)=>(b.criadoEm||'').localeCompare(a.criadoEm||'')).slice(0,8).map(r=>{const ic=r.status==='Aprovado'?'✅':r.status==='Recusado'?'❌':'⏳'; const msg=r.status==='Aprovado'?'Resgate autorizado':r.status==='Recusado'?'Não autorizado':'Aguardando autorização'; return \`<div style="margin-top:8px;padding-top:8px;border-top:1px solid #eee">\${ic} <strong>\${escaparHtml(r.recompensaNome||'Recompensa')}</strong><br><small>\${msg} · \${Number(r.pontos)||0} pts</small></div>\`}).join('');
            el.innerHTML=\`<strong>Saldo disponível: \${saldo} pts</strong><br>\${catalogo}<div style="margin-top:12px"><strong>Meus resgates</strong>\${hist||'<br><small>Nenhum resgate solicitado.</small>'}</div>\`;
        }`,
`        function renderizarRecompensasCliente(){
            const el=document.getElementById('recompensasCliente');if(!el)return; const saldo=saldoPontos();
            const hojeISO=formatarDataISO(new Date());
            const catalogo=recompensasCache.map(r=>\`<div style="margin-top:7px">🎁 \${escaparHtml(r.nome)} — \${Number(r.pontos)||0} pts <button class="btn" style="padding:5px 9px" onclick="resgatarRecompensa('\${r.id}')" \${saldo<(Number(r.pontos)||0)?'disabled':''}>Resgatar</button></div>\`).join('')||'<div style="margin-top:7px">Nenhuma recompensa disponível.</div>';
            const hist=[...resgatesCache].filter(r=>{const d=new Date(r.criadoEm||'');return Number.isFinite(d.getTime())&&formatarDataISO(d)===hojeISO;}).sort((a,b)=>(b.criadoEm||'').localeCompare(a.criadoEm||'')).map(r=>{const ic=r.status==='Aprovado'?'✅':r.status==='Recusado'?'❌':'⏳'; const msg=r.status==='Aprovado'?'Resgate autorizado':r.status==='Recusado'?'Não autorizado':'Aguardando autorização'; return \`<div style="margin-top:8px;padding-top:8px;border-top:1px solid #eee">\${ic} <strong>\${escaparHtml(r.recompensaNome||'Recompensa')}</strong><br><small>\${msg} · \${Number(r.pontos)||0} pts</small></div>\`}).join('');
            el.innerHTML=\`<strong>Saldo disponível: \${saldo} pts</strong><br>\${catalogo}<div style="margin-top:12px"><strong>Meus resgates de hoje</strong>\${hist||'<br><small>Nenhum resgate solicitado hoje.</small>'}</div>\`;
        }`,
'rewards today filter');

replaceOnce(
`        function renderizarJustificativasCliente(){
            const el=document.getElementById('justificativasCliente'); if(!el)return; const lista=cacheHistorico.filter(h=>h.justificativaAtraso).sort((a,b)=>(b.data||'').localeCompare(a.data||'')).slice(0,10); el.innerHTML=lista.map(h=>\`<div style="padding:9px 0;border-bottom:1px solid #eee"><strong>\${escaparHtml(h.nomeTarefa||'Tarefa')}</strong> · \${escaparHtml(h.data||'')}<br><span>\${escaparHtml(h.justificativaAtraso)}</span> <button class="btn" style="padding:4px 8px;margin-left:6px" onclick="editarJustificativa('\${h.id}')">Editar</button></div>\`).join('')||'<small>Nenhuma justificativa registrada.</small>';
        }`,
`        function renderizarJustificativasCliente(){
            const el=document.getElementById('justificativasCliente'); if(!el)return; const hojeISO=formatarDataISO(new Date()); const lista=cacheHistorico.filter(h=>h.justificativaAtraso&&h.data===hojeISO).sort((a,b)=>(b.horarioTermino||b.horarioInicio||'').localeCompare(a.horarioTermino||a.horarioInicio||'')); el.innerHTML=lista.map(h=>\`<div style="padding:9px 0;border-bottom:1px solid #eee"><strong>\${escaparHtml(h.nomeTarefa||'Tarefa')}</strong><br><span>\${escaparHtml(h.justificativaAtraso)}</span> <button class="btn" style="padding:4px 8px;margin-left:6px" onclick="editarJustificativa('\${h.id}')">Editar</button></div>\`).join('')||'<small>Nenhuma justificativa registrada hoje.</small>';
        }`,
'justifications today filter');

fs.writeFileSync(file,s);
console.log('Daily Client panels patch applied.');
// integrated trigger v1
