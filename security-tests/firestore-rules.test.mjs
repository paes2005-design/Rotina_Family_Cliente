import fs from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';

const projectId='sistema-de-metas-diarias';
const rules=fs.readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
const env=await initializeTestEnvironment({projectId,firestore:{rules}});

const roles={
  participante:{uid:'p1',papel:'participante',grupoId:'G1',perfilId:'PF1',ativo:true,permissoes:{}},
  admin:{uid:'a1',papel:'adm_familia',grupoId:'G1',perfilId:'',ativo:true,permissoes:{}},
  convidado:{uid:'g1',papel:'adm_convidado',grupoId:'G1',perfilId:'',ativo:true,permissoes:{tarefasGerenciar:true,recompensasGerenciar:true,resgatesDecidir:true,monitorLer:true,relatoriosLer:true,participantesGerenciar:false}},
  master:{uid:'m1',papel:'master',grupoId:'',perfilId:'',ativo:true,permissoes:{}}
};

await env.withSecurityRulesDisabled(async context=>{
  const db=context.firestore();
  for(const role of Object.values(roles))await setDoc(doc(db,'authRoles',role.uid),role);
  await setDoc(doc(db,'tarefas','t1'),{grupoId:'G1',perfilId:'PF1',perfilNome:'Filho',nome:'Estudar',diaSemana:'Segunda',horaSugeridaInicio:'09:00',horaSugeridaFim:'10:00',tempoLimite:5,pontosMaximos:10,status:'Pendente'});
  await setDoc(doc(db,'tarefas','t2'),{grupoId:'G1',perfilId:'PF2',perfilNome:'Irmã',nome:'Ler',diaSemana:'Segunda',horaSugeridaInicio:'10:00',horaSugeridaFim:'11:00',tempoLimite:5,pontosMaximos:10,status:'Pendente'});
  await setDoc(doc(db,'tarefas','t3'),{grupoId:'G2',perfilId:'PX',perfilNome:'Outro',nome:'Outra',diaSemana:'Segunda',horaSugeridaInicio:'10:00',horaSugeridaFim:'11:00',tempoLimite:5,pontosMaximos:10,status:'Pendente'});
  await setDoc(doc(db,'tarefas','t4'),{grupoId:'G1',perfilId:'PF1',perfilNome:'Filho',nome:'Fluxo real',diaSemana:'Segunda',horaSugeridaInicio:'11:00',horaSugeridaFim:'11:30',tempoLimite:5,pontosMaximos:20,status:'Pendente',tarefaGrupoId:'TG-4'});
  await setDoc(doc(db,'perfis','PF1'),{grupoId:'G1',perfilId:'PF1',nome:'Filho'});
  await setDoc(doc(db,'perfis','PF2'),{grupoId:'G1',perfilId:'PF2',nome:'Irmã'});
  await setDoc(doc(db,'administradores','adm-a1'),{uid:'a1',codigoCliente:'G1',email:'familia@example.com',tipoAcesso:'proprietario'});
  await setDoc(doc(db,'administradores','adm-g1'),{uid:'g1',grupoId:'G1',codigoCliente:'G1',email:'convidado@example.com',tipoAcesso:'convidado'});
  await setDoc(doc(db,'administradores','adm-outro'),{uid:'a2',grupoId:'G1',codigoCliente:'G1',email:'outro@example.com',tipoAcesso:'convidado'});
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

const participantDb=env.authenticatedContext('p1').firestore();
const adminDb=env.authenticatedContext('a1').firestore();
const guestDb=env.authenticatedContext('g1').firestore();
const masterDb=env.authenticatedContext('m1').firestore();

// Participante: apenas o próprio perfil/grupo operacional.
await assertSucceeds(getDoc(doc(participantDb,'tarefas','t1')));
await assertFails(getDoc(doc(participantDb,'tarefas','t2')));
await assertFails(getDoc(doc(participantDb,'tarefas','t3')));
// Firestore rules não são filtros: consulta só por grupo deve falhar; grupo+perfil deve passar.
await assertFails(getDocs(query(collection(participantDb,'tarefas'),where('grupoId','==','G1'))));
await assertSucceeds(getDocs(query(collection(participantDb,'tarefas'),where('grupoId','==','G1'),where('perfilId','==','PF1'))));
await assertSucceeds(updateDoc(doc(participantDb,'tarefas','t1'),{status:'Em andamento',horarioInicio:'09:01'}));
await assertFails(updateDoc(doc(participantDb,'tarefas','t1'),{pontosMaximos:999}));

// Integridade da ocorrência: Pendente -> Em andamento -> final apenas uma vez.
await assertSucceeds(updateDoc(doc(participantDb,'tarefas','t1'),{status:'No Prazo',horarioTermino:'09:50',pontosGanhos:10,percentualAplicado:100,faixaAtraso:'dentro-limites'}));
await assertFails(updateDoc(doc(participantDb,'tarefas','t1'),{status:'Em andamento',horarioInicio:'09:45'}));
await assertFails(updateDoc(doc(participantDb,'tarefas','t1'),{pontosGanhos:0,percentualAplicado:0}));
await assertSucceeds(updateDoc(doc(participantDb,'tarefas','t1'),{justificativaAtraso:'ajuste posterior permitido'}));

await assertSucceeds(setDoc(doc(participantDb,'historico','PF1_t1_2026-08-25'),{grupoId:'G1',perfilId:'PF1',perfilNome:'Filho',tarefaId:'t1',nomeTarefa:'Estudar',data:'2026-08-25',status:'No Prazo',horarioInicio:'09:01',horarioTermino:'09:50',pontosGanhos:10,percentualAplicado:100}));
await assertFails(updateDoc(doc(participantDb,'historico','PF1_t1_2026-08-25'),{status:'Atrasado',horarioTermino:'10:30',pontosGanhos:0,percentualAplicado:0}));
await assertSucceeds(updateDoc(doc(participantDb,'historico','PF1_t1_2026-08-25'),{justificativaAtraso:'texto ajustado depois'}));

await assertSucceeds(setDoc(doc(participantDb,'execucoes','2026-08-25__t1'),{grupoId:'G1',perfilId:'PF1',perfilNome:'Filho',tarefaId:'t1',nomeTarefa:'Estudar',data:'2026-08-25',status:'Em andamento',horarioInicio:'09:01'}));
await assertSucceeds(updateDoc(doc(participantDb,'execucoes','2026-08-25__t1'),{status:'No Prazo',horarioTermino:'09:50',pontosGanhos:10,percentualAplicado:100}));
await assertFails(updateDoc(doc(participantDb,'execucoes','2026-08-25__t1'),{status:'Em andamento',horarioInicio:'10:20'}));
await assertFails(updateDoc(doc(participantDb,'execucoes','2026-08-25__t1'),{pontosGanhos:0,percentualAplicado:0}));
await assertSucceeds(updateDoc(doc(participantDb,'execucoes','2026-08-25__t1'),{justificativaAtraso:'ajuste sem alterar resultado'}));

// Reproduz o lote real do app, inclusive execução legada sem tarefaGrupoId no início.
{
  const inicio=writeBatch(participantDb);
  inicio.update(doc(participantDb,'tarefas','t4'),{status:'Em andamento',horarioInicio:'11:00',inicioExecutadoEm:'2026-08-26T14:00:00.000Z',dataExecucao:'2026-08-26',iniciouComAtraso:false,atrasoInicioMin:0});
  inicio.set(doc(participantDb,'execucoes','2026-08-26__t4'),{grupoId:'G1',perfilId:'PF1',perfilNome:'Filho',tarefaId:'t4',nomeTarefa:'Fluxo real',data:'2026-08-26',status:'Em andamento',horarioInicio:'11:00'},{merge:true});
  await assertSucceeds(inicio.commit());
}
{
  const final=writeBatch(participantDb);
  const resultado={status:'Atrasado (0%)',horarioTermino:'11:40',terminoExecutadoEm:'2026-08-26T14:40:00.000Z',pontosGanhos:0,pontosOriginais:0,percentualAplicado:0,percentualOriginal:0,faixaAtraso:'estourado',justificativaAtraso:'o aplicativo ficou indisponível durante a execução',revisaoStatus:'aguardando'};
  const hist={grupoId:'G1',perfilId:'PF1',perfilNome:'Filho',tarefaId:'t4',tarefaGrupoId:'TG-4',nomeTarefa:'Fluxo real',data:'2026-08-26',...resultado};
  final.update(doc(participantDb,'tarefas','t4'),resultado);
  final.set(doc(participantDb,'historico','PF1_t4_2026-08-26'),hist,{merge:true});
  final.set(doc(participantDb,'execucoes','2026-08-26__t4'),hist,{merge:true});
  await assertSucceeds(final.commit());
}
await assertFails(updateDoc(doc(participantDb,'execucoes','2026-08-26__t4'),{tarefaGrupoId:'OUTRO'}));
await assertSucceeds(getDocs(query(collection(participantDb,'historico'),where('grupoId','==','G1'),where('perfilId','==','PF1'))));

await assertSucceeds(getDoc(doc(participantDb,'configGrupos','G1')));
await assertFails(getDoc(doc(participantDb,'estadoComercial','G1')));
await assertFails(getDoc(doc(participantDb,'appLogs','l1')));
await assertFails(getDoc(doc(participantDb,'appLogsSecure','s1')));
await assertSucceeds(setDoc(doc(participantDb,'resgates','novo'),{grupoId:'G1',perfilId:'PF1',perfilNome:'Filho',recompensaId:'r1',recompensaNome:'Cinema',pontos:20,status:'Pendente',criadoEm:new Date().toISOString()}));
await assertFails(setDoc(doc(participantDb,'resgates','fraude'),{grupoId:'G1',perfilId:'PF1',perfilNome:'Filho',recompensaId:'r1',recompensaNome:'Cinema',pontos:20,status:'Aprovado'}));
await assertSucceeds(updateDoc(doc(participantDb,'resgates','x1'),{pushClientePendente:false,clienteRetornoVistoEm:new Date().toISOString()}));
await assertFails(updateDoc(doc(participantDb,'resgates','x1'),{status:'Recusado'}));

await assertSucceeds(getDoc(doc(adminDb,'tarefas','t2')));
await assertFails(getDoc(doc(adminDb,'tarefas','t3')));
await assertSucceeds(setDoc(doc(adminDb,'perfis','PF3'),{grupoId:'G1',perfilId:'PF3',nome:'Novo'}));
await assertSucceeds(getDoc(doc(adminDb,'estadoComercial','G1')));
await assertFails(getDoc(doc(adminDb,'estadoComercial','G2')));
await assertFails(getDoc(doc(adminDb,'appLogs','l1')));
await assertSucceeds(getDoc(doc(adminDb,'administradores','adm-a1')));
await assertFails(getDoc(doc(adminDb,'administradores','adm-outro')));

await assertSucceeds(updateDoc(doc(guestDb,'tarefas','t2'),{status:'Pendente'}));
await assertFails(setDoc(doc(guestDb,'perfis','PF4'),{grupoId:'G1',perfilId:'PF4',nome:'Convidado não pode'}));
await assertFails(getDoc(doc(guestDb,'estadoComercial','G1')));
await assertFails(getDoc(doc(guestDb,'appLogs','l1')));
await assertSucceeds(getDoc(doc(guestDb,'administradores','adm-g1')));
await assertFails(getDoc(doc(guestDb,'administradores','adm-a1')));
await assertSucceeds(updateDoc(doc(guestDb,'resgates','x1'),{status:'Recusado',decididoEm:new Date().toISOString()}));

await assertSucceeds(getDoc(doc(masterDb,'tarefas','t3')));
await assertSucceeds(getDoc(doc(masterDb,'estadoComercial','G2')));
await assertSucceeds(getDoc(doc(masterDb,'appLogs','l1')));
await assertSucceeds(getDoc(doc(masterDb,'appLogsSecure','s1')));
await assertSucceeds(getDoc(doc(masterDb,'coisaInterna','i1')));

await env.cleanup();
console.log('FIRESTORE ROLE SECURITY + PRODUCTION FLOW CHECKS PASSED');
