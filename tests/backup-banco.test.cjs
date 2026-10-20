// Testes isolados: nenhuma conexão ou gravação em Firebase real.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {File}=require('node:buffer'),{webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const clone=structuredClone;
function element(){return {value:'',disabled:false,hidden:true,textContent:'',className:'',style:{},files:[],children:[],setAttribute(){},replaceChildren(){this.children=[];},appendChild(x){this.children.push(x);},append(...xs){this.children.push(...xs);},click(){},addEventListener(){}};}
function harness(db,store=new Map()){
 const elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};let downloaded;
 const ctx={console,crypto:webcrypto,TextEncoder,TextDecoder,Blob,File,Response,CompressionStream,DecompressionStream,Intl,Uint8Array,ArrayBuffer,Date,JSON,Map,Set,Promise,
  setTimeout,clearTimeout,atob,btoa,sessionStorage:{getItem:k=>({j_tid:'test-tenant',j_role:'admin'}[k]||'')},
  document:{readyState:'loading',getElementById:el,createElement:element,addEventListener(){}},URL:{createObjectURL:b=>{downloaded=b;return 'blob:test';},revokeObjectURL(){}},confirm:()=>true};
 ctx.window=ctx;ctx.firebase={firestore:{FieldPath:{documentId:()=> '__name__'},Timestamp:class Timestamp{constructor(s,n){this.seconds=s;this.nanoseconds=n;}},GeoPoint:class GeoPoint{constructor(lat,lng){this.latitude=lat;this.longitude=lng;}},Blob:class FireBlob{},DocumentReference:class DocumentReference{}}};
 let s=fs.readFileSync(path.join(root,'js/backup-banco-v1.js'),'utf8');
 s=s.replace("if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();",`globalThis.API={exportV2,previewV2,restore,preview,encode,decode,encrypt,decrypt,sealV2,openV2,fileLines,readTask,
   getPlan:()=>plan,getSource:()=>source,setDB:x=>db=x,setPaused:()=>pauseRequested=true,runKey,localGet,localCommit,localDiscard,
   useStore:adapter=>{localGet=adapter.get;localCommit=adapter.commit;localDiscard=adapter.discard;},setIDB:x=>checkpointDB=x};`);
 vm.createContext(ctx);vm.runInContext(s,ctx);ctx.API.setDB(db);
 ctx.API.useStore({get:async(s,k)=>clone(store.get(s+':'+k)),commit:async(k,state,frames)=>{for(const f of frames)store.set('blocks:'+state.id+':'+String(f.n).padStart(9,'0'),clone(f));store.set('runs:'+k,clone(state));},discard:async k=>{const state=store.get('runs:'+k);if(state)for(const key of store.keys())if(key.startsWith('blocks:'+state.id+':'))store.delete(key);store.delete('runs:'+k);}});
 el('senhaExportar').value='1234';el('senhaExportar2').value='1234';
 return {ctx,api:ctx.API,el,store,blob:()=>downloaded};
}
function mockDB(documents){
 const docs=new Map(documents),counts={reads:0,writes:0};let failAt=0;
 const snapshot=p=>({id:p.split('/').at(-1),exists:docs.has(p),ref:ref(p),data:()=>clone(docs.get(p))});
 async function read(){counts.reads++;if(failAt&&counts.reads>=failAt){const e=Error('leitura interrompida para teste');e.code='permission-denied';throw e;}}
 const ref=p=>({path:p,id:p.split('/').at(-1),collection:c=>query(p+'/'+c),get:async()=>{await read();return snapshot(p);}});
 function query(p,filters=[],limit=Infinity,cursor=null){return {path:p,doc:id=>ref(p+'/'+id),where:(k,op,v)=>query(p,[...filters,[k,v]],limit,cursor),orderBy:()=>query(p,filters,limit,cursor),limit:n=>query(p,filters,n,cursor),startAfter:id=>query(p,filters,limit,id),get:async()=>{
  await read();const found=[...docs.keys()].filter(k=>k.startsWith(p+'/')&&k.split('/').length===p.split('/').length+1&&(!cursor||k.split('/').at(-1)>cursor)&&filters.every(([field,value])=>docs.get(k)?.[field]===value)).sort().slice(0,limit).map(snapshot);return {docs:found,size:found.length};
 }};}
 return {docs,counts,app:{options:{projectId:'test-project'}},collection:query,doc:ref,set failAt(n){failAt=n;},async runTransaction(fn){const staged=[];const out=await fn({get:async r=>snapshot(r.path),set:(r,v)=>staged.push([r.path,v])});for(const [p,v]of staged){docs.set(p,{...docs.get(p),...v});counts.writes++;}return out;}};
}
function fixtures(){
 const docs=[];for(let n=0;n<121;n++)docs.push(['clientes/c'+String(n).padStart(3,'0'),{tenantId:'test-tenant',nome:'Cliente '+n,observacao:'teste de conteúdo '.repeat(300)}]);
 for(let n=0;n<82;n++)docs.push(['veiculos/v'+String(n).padStart(3,'0'),{tenantId:'test-tenant',placa:'TEST'+n}]);
 for(let n=0;n<12;n++){const p='ordens_servico/os'+String(n).padStart(3,'0');docs.push([p,{tenantId:'test-tenant',desc:'O.S. '+n}]);docs.push([p+'/items/i1',{tenantId:'test-tenant',desc:'Peça'}]);docs.push([p+'/internalNotes/n1',{texto:'Nota interna sem tenant no documento filho'}]);}
 docs.push(['oficinas/test-tenant',{nome:'Oficina de teste'}]);return docs;
}
test('backup V2 retoma em outro contexto sem repetir/perder documentos e autentica inventário completo',async()=>{
 const data=fixtures(),db=mockDB(data),h=harness(db);db.failAt=9;
 await assert.rejects(h.api.exportV2(),/interrompida/);const partial=h.store.get('runs:test-project:test-tenant');assert.ok(partial.count>0);assert.ok(partial.queue.length>0);assert.equal(db.counts.writes,0);
 db.failAt=0;const resumed=harness(db,h.store);await resumed.api.exportV2(true);const done=h.store.get('runs:test-project:test-tenant');assert.equal(done.count,data.length);assert.equal(done.queue.length,0);assert.ok(done.finished);assert.ok(done.blocks>3);assert.ok(resumed.blob().size>0);assert.equal(db.counts.writes,0);
 const file=new File([resumed.blob()],'backup.sosbackup');await resumed.api.previewV2(file,'1234');const plan=resumed.api.getPlan();assert.equal(plan.summary.igual,data.length-13);assert.equal(plan.summary.protegido,13);assert.equal(plan.alteracoes,0);assert.equal(db.counts.writes,0);
 resumed.el('senhaExportar').value='0000';resumed.el('senhaExportar2').value='0000';await assert.rejects(resumed.api.exportV2(true),/Senha incorreta/);
});
test('V2 restaura por ID, preserva protegidos, bloqueia alterações posteriores à prévia e não exclui ausentes',async()=>{
 const db=mockDB(fixtures()),h=harness(db);await h.api.exportV2();const file=new File([h.blob()],'backup.sosbackup');
 db.docs.delete('clientes/c000');db.docs.get('clientes/c001').nome='Atual antes da prévia';db.docs.set('clientes/nao-incluido',{tenantId:'test-tenant',nome:'Fora do arquivo'});
 await h.api.previewV2(file,'1234');const p=h.api.getPlan();assert.equal(p.summary.novo,1);assert.equal(p.summary.atualizar,1);assert.equal(db.counts.writes,0);
 db.docs.get('clientes/c001').nome='Alterado depois da prévia';h.el('confirmar').value='RESTAURAR 2';await h.api.restore();assert.equal(db.docs.get('clientes/c000').nome,'Cliente 0');assert.equal(db.docs.get('clientes/c001').nome,'Alterado depois da prévia');assert.ok(db.docs.has('clientes/nao-incluido'));assert.equal(db.counts.writes,1);assert.match(h.el('resultado').textContent,/PARCIAL/);
});
test('arquivo truncado, adulterado, senha incorreta e bloco duplicado são recusados antes de restaurar',async()=>{
 const db=mockDB(fixtures()),h=harness(db);await h.api.exportV2();const text=await h.blob().text(),lines=text.trim().split('\n');
 await assert.rejects(h.api.previewV2(new File([text],'b.sosbackup'),'9999'),/Senha incorreta/);
 await assert.rejects(h.api.previewV2(new File([lines.slice(0,-1).join('\n')],'b.sosbackup'),'1234'),/Manifesto/);
 const frame=JSON.parse(lines[1]);frame.ciphertext=(frame.ciphertext[0]==='A'?'B':'A')+frame.ciphertext.slice(1);const tampered=[lines[0],JSON.stringify(frame),...lines.slice(2)].join('\n');await assert.rejects(h.api.previewV2(new File([tampered],'b.sosbackup'),'1234'),/integridade/);
 const dup=[lines[0],lines[1],lines[1],...lines.slice(2)].join('\n');await assert.rejects(h.api.previewV2(new File([dup],'b.sosbackup'),'1234'),/Sequência/);assert.equal(db.counts.writes,0);
});
test('V1 continua importável e os tipos Firestore não viram texto',async()=>{
 const db=mockDB([['clientes/c1',{tenantId:'test-tenant',nome:'Mesmo'}]]),h=harness(db),F=h.ctx.firebase.firestore;
 const typed={timestamp:new F.Timestamp(1792490400,123456789),point:new F.GeoPoint(-21.1,-47.8),nan:NaN,infinity:Infinity};const decoded=h.api.decode(h.api.encode(typed));assert.equal(decoded.timestamp.nanoseconds,123456789);assert.equal(decoded.point.latitude,-21.1);assert.ok(Number.isNaN(decoded.nan));assert.equal(decoded.infinity,Infinity);
 const data={format:'SOS_VALENCIO_FIRESTORE',version:1,scope:'TENANT_ONLY',projectId:'test-project',tenantId:'test-tenant',createdAt:'2026-01-01',count:1,documents:[{path:'clientes/c1',data:{tenantId:'test-tenant',nome:'Mesmo'}}]};
 const wrapper=await h.api.encrypt(data,'1234');h.el('arquivo').files=[new File([JSON.stringify(wrapper)],'antigo.sosbackup')];h.el('senhaImportar').value='1234';await h.api.preview();assert.equal(h.api.getPlan().summary.igual,1);assert.equal(db.counts.writes,0);
});

module.exports={harness,mockDB,fixtures};
