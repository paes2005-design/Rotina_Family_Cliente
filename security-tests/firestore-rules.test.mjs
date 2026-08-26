import fs from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const projectId = 'sistema-de-metas-diarias';
const rules = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const env = await initializeTestEnvironment({ projectId, firestore: { rules } });

const roles = {
  participante: { uid:'p1', papel:'participante', grupoId:'G1', perfilId:'PF1', ativo:true, permissoes:{} },
  admin: { uid:'a1', papel:'adm_familia', grupoId:'G1', perfilId:'', ativo:true, permissoes:{} },
  convidado: { uid:'g1', papel:'adm_convidado', grupoId:'G1', perfilId:'', ativo:true, permissoes:{ tarefasGerenciar:true, recompensasGerenciar:true, resgatesDecidir:true, monitorLer:true, relatoriosLer:true, participantesGerenciar:false } },
  master: { uid:'m1', papel:'master', grupoId:'', perfilId:'', ativo:true, permissoes:{} }
};

await env.withSecurityRulesDisabled(async context => {
  const db = context.firestore();
  for (const role of Object.values(roles)) await setDoc(doc(db,'authRoles',role.uid),role);
  await setDoc(doc(db,'tarefas','t1'),{grupoId:'G1',perfilId:'PF1',perfilNome:'Filho',nome:'Estudar',diaSemana:'Segunda',horaSugeridaInicio:'09:00',horaSugeridaFim:'10:00',tempoLimite:5,pontosMaximos:10,status:'Pendente'});
  await setDoc(doc(db,'tarefas','t2'),{grupoId:'G1',perfilId:'PF2',perfilNome:'Irmã',nome:'Ler',diaSemana:'Segunda',horaSugeridaInicio:'10:00',horaSugeridaFim:'11:00',tempoLimite:5,pontosMaximos:10,status:'Pendente'});
  await setDoc(doc(db,'tarefas','t3'),{grupoId:'G2',perfilId:'PX',perfilNome:'Outro',nome:'Outra',diaSemana:'Segunda',horaSugeridaInicio:'10:00',horaSugeridaFim:'11:00',tempoLimite:5,pontosMaximos:10,status:'Pendente'});
  await setDoc(doc(db,'perfis','PF1'),{grupoId:'G1',perfilId:'PF1',nome:'Filho'});
  await setDoc(doc(db,'perfis','PF2'),{grupoId:'G1',perfilId:'PF2',nome:'Irmã'});
  await setDoc(doc(db,'configGrupos','G1'),{grupoId:'G1',regraTolerancia:{versao:4}});
  await setDoc(doc(db,'configGrupos','G2'),{grupoId:'G2',regraTolerancia:{versao:4}});
  await setDoc(doc(db,'estadoComercial','G1'),{grupoId:'G1',grupoBloqueado:false,trialAtivo:true});
  await setDoc(doc(db,'estadoComercial','G2'),{grupoId:'G2',grupoBloqueado:true});
  await setDoc(doc(db,'recompensas','r1'),{grupoId:'G1',nome:'Cinema',pontos:20,ativa:true});
  await setDoc(doc(db,'resgates','x1'),{grupoId:'G1',perfilId:'PF1',perfilNome:'Filho',recompensaId:'r1',recompensaNome:'Cinema',pontos:20,status:'Aprovado',pushClientePendente:true});
  await setDoc(doc(db,'appLogs','l1'),{grupoId:'G1',evento:'teste'});
  await setDoc(doc(db,'appLogsSecure','s1'),{grupoId:'G1',evento:'seguro'});
  await setDoc(doc(db,'coisaInterna','i1'),{segredo:true});
});

const participantDb = env.authenticatedContext('p1').firestore();
const adminDb = env.authenticatedContext('a1').firestore();
const guestDb = env.authenticatedContext('g1').firestore();
const masterDb = env.authenticatedContext('m1').firestore();

// Participante: apenas o próprio perfil/grupo operacional.
await assertSucceeds(getDoc(doc(participantDb,'tarefas','t1')));
await assertFails(getDoc(doc(participantDb,'tarefas','t2')));
await assertFails(getDoc(doc(participantDb,'tarefas','t3')));
await assertSucceeds(updateDoc(doc(participantDb,'tarefas','t1'),{status:'Em andamento',horarioInicio:'09:01'}));
await assertFails(updateDoc(doc(participantDb,'tarefas','t1'),{pontosMaximos:999}));
await assertSucceeds(getDoc(doc(participantDb,'configGrupos','G1')));
await assertFails(getDoc(doc(participantDb,'estadoComercial','G1')));
await assertFails(getDoc(doc(participantDb,'appLogs','l1')));
await assertFails(getDoc(doc(participantDb,'appLogsSecure','s1')));
await assertSucceeds(setDoc(doc(participantDb,'resgates','novo'),{grupoId:'G1',perfilId:'PF1',perfilNome:'Filho',recompensaId:'r1',recompensaNome:'Cinema',pontos:20,status:'Pendente',criadoEm:new Date().toISOString()}));
await assertFails(setDoc(doc(participantDb,'resgates','fraude'),{grupoId:'G1',perfilId:'PF1',perfilNome:'Filho',recompensaId:'r1',recompensaNome:'Cinema',pontos:20,status:'Aprovado'}));
await assertSucceeds(updateDoc(doc(participantDb,'resgates','x1'),{pushClientePendente:false,clienteRetornoVistoEm:new Date().toISOString()}));
await assertFails(updateDoc(doc(participantDb,'resgates','x1'),{status:'Recusado'}));

// ADM da Família: próprio grupo, inclusive leitura comercial, mas sem logs.
await assertSucceeds(getDoc(doc(adminDb,'tarefas','t2')));
await assertFails(getDoc(doc(adminDb,'tarefas','t3')));
await assertSucceeds(setDoc(doc(adminDb,'perfis','PF3'),{grupoId:'G1',perfilId:'PF3',nome:'Novo'}));
await assertSucceeds(getDoc(doc(adminDb,'estadoComercial','G1')));
await assertFails(getDoc(doc(adminDb,'estadoComercial','G2')));
await assertFails(getDoc(doc(adminDb,'appLogs','l1')));

// ADM Convidado: operação permitida, sem gestão de participantes/comercial/logs.
await assertSucceeds(updateDoc(doc(guestDb,'tarefas','t2'),{status:'Pendente'}));
await assertFails(setDoc(doc(guestDb,'perfis','PF4'),{grupoId:'G1',perfilId:'PF4',nome:'Convidado não pode'}));
await assertFails(getDoc(doc(guestDb,'estadoComercial','G1')));
await assertFails(getDoc(doc(guestDb,'appLogs','l1')));
await assertSucceeds(updateDoc(doc(guestDb,'resgates','x1'),{status:'Recusado',decididoEm:new Date().toISOString()}));

// Master: visão global e acesso exclusivo aos logs.
await assertSucceeds(getDoc(doc(masterDb,'tarefas','t3')));
await assertSucceeds(getDoc(doc(masterDb,'estadoComercial','G2')));
await assertSucceeds(getDoc(doc(masterDb,'appLogs','l1')));
await assertSucceeds(getDoc(doc(masterDb,'appLogsSecure','s1')));
await assertSucceeds(getDoc(doc(masterDb,'coisaInterna','i1')));

await env.cleanup();
console.log('FIRESTORE ROLE SECURITY CHECKS PASSED');
