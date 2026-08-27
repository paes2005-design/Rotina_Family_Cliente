import assert from 'node:assert/strict';
import { handleReliableAppLogV2 } from '../src/reliable-app-log-v2.js';

const event={aplicativo:'cliente',evento:'teste',grupoId:'CLI-TESTE',clienteEm:'2026-08-27T05:20:00Z'};

let fallbackCalls=0;
const fallbackApp={fetch:async request=>{fallbackCalls+=1;assert.equal(request.headers.get('origin'),'https://paes2005-design.github.io');assert.equal(request.headers.get('x-transport-test'),null);const body=await request.json();assert.equal(body.events.length,1);return Response.json({accepted:1});}};
const fallbackRequest=new Request('https://worker.example/app-log',{method:'POST',headers:{origin:'https://paes2005-design.github.io','content-type':'application/json','x-transport-test':'nao-copiar'},body:JSON.stringify({events:[event,event]})});
const fallbackResponse=await handleReliableAppLogV2(fallbackRequest,{},null,fallbackApp);
const fallbackResult=await fallbackResponse.json();
assert.equal(fallbackCalls,1);
assert.equal(fallbackResult.accepted,2);
assert.equal(fallbackResult.stored,1);
assert.equal(fallbackResult.duplicates,1);
assert.equal(fallbackResult.dropped,0);
assert.equal(fallbackResult.pipelineVersion,6);
assert.equal(fallbackResult.storage,'firestore-fallback');

let doCalls=0;
const durableStub={fetch:async (_url,options)=>{doCalls+=1;const body=JSON.parse(options.body);assert.equal(body.events.length,1);return Response.json({accepted:1,stored:1,duplicates:0,storeVersion:1});}};
const env={TECHNICAL_STORE:{idFromName:name=>{assert.equal(name,'rotina-family-global-v1');return'id';},get:id=>{assert.equal(id,'id');return durableStub;}}};
const baseApp={fetch:async()=>{throw new Error('Firestore não deve ser chamado quando o Durable Object está disponível.');}};
const doRequest=new Request('https://worker.example/app-log',{method:'POST',headers:{origin:'https://paes2005-design.github.io','content-type':'application/json'},body:JSON.stringify({events:[event,event]})});
const doResponse=await handleReliableAppLogV2(doRequest,env,null,baseApp);
const doResult=await doResponse.json();
assert.equal(doCalls,1);
assert.equal(doResult.accepted,2);
assert.equal(doResult.stored,1);
assert.equal(doResult.duplicates,1);
assert.equal(doResult.dropped,0);
assert.equal(doResult.pipelineVersion,6);
assert.equal(doResult.storage,'cloudflare-do');
console.log('reliable-app-log-v2: OK');
