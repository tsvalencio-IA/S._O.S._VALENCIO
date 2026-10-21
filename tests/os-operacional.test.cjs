const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const copy=v=>v==null?v:JSON.parse(JSON.stringify(v));
function environment(elements={}){
 const document={readyState:'loading',addEventListener(){},getElementById:id=>elements[id]||null,querySelectorAll:()=>[]};
 const ctx={document,console,TextEncoder,TextDecoder,crypto:require('node:crypto').webcrypto,sessionStorage:{getItem:()=>null},setTimeout:()=>0,setInterval:()=>0,clearInterval(){},location:{pathname:'/equipe.html'},toast(){}};
 ctx.window=ctx;ctx.firebase={firestore:{FieldValue:{arrayUnion:(...values)=>({__union:values})}}};
 vm.createContext(ctx);
 for(const f of ['js/os-utils.js','js/os-operacional.js','js/portal-eventos-publicos.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});
 return ctx;
}
function database(initial){
 const docs=new Map(Object.entries(copy(initial)));let next=0,fail=false,retry=false;
 const ref=p=>({path:p,id:p.split('/').at(-1),get:async()=>snap(p)});
 const snap=p=>({id:p.split('/').at(-1),exists:docs.has(p),data:()=>copy(docs.get(p))});
 const db={docs,collection:p=>({doc:id=>ref(p+'/'+(id||'generated-'+(++next)))}),doc:ref,
  set fail(v){fail=v;},set retry(v){retry=v;},async runTransaction(fn){
   let writes=[];const tx={get:async r=>snap(r.path),update:(r,v)=>writes.push([r.path,v,false]),set:(r,v)=>writes.push([r.path,v,true])};
   let result=await fn(tx);if(retry){writes=[];result=await fn(tx);retry=false;}
   if(fail)throw Error('permission-denied');
   for(const [p,patch,set] of writes){let value=set?{}:copy(docs.get(p)||{});for(const [k,v]of Object.entries(patch)){
    if(v?.__union){const old=value[k]||[];value[k]=[...old,...v.__union.filter(x=>!old.some(y=>JSON.stringify(x)===JSON.stringify(y)))];}else value[k]=copy(v);
   }docs.set(p,value);}return result;
  }};return db;
}
const session={tid:'oficina-test',role:'mecanico',fid:'auxiliar',nome:'Auxiliar de teste'};
const fixture=()=>({id:'os-test',tenantId:session.tid,status:'Em serviço',desc:'Entrada',diagnostico:'',mecId:'principal',mecIds:['principal','auxiliar'],servicos:[{desc:'Alinhamento',valor:0,mecId:'principal'}],pecas:[{desc:'Amortecedor',codigo:'INTERNO-1',qtd:1,venda:0},{desc:'Pastilha',codigo:'INTERNO-2',qtd:1,venda:0}],aprovacao:{itens:[{key:'servico-0'},{key:'peca-0'},{key:'peca-1'}],totalAprovado:0},aprovacaoAtiva:true,execucaoItens:{'peca-0':{status:'pendente',obs:'',mecId:'principal',mecNome:'Principal'},'peca-1':{status:'pendente',obs:''}},timeline:[{tipo:'status_os',statusNovo:'Em serviço',user:'Gestor',dt:'2026-01-01'}]});
function row(key,status,obs='',before='pendente',beforeObs=''){
 return {dataset:{key,statusInicial:before,obsInicial:beforeObs},querySelector:s=>s==='.exec-status'?{value:status}:s==='.exec-obs'?{value:obs}:null};
}
function context(ctx,db,base,rows){return {db,session,base,osId:base.id,rows,kind:'equipe',linked:os=>os.mecIds.includes(session.fid)};}
test('auxiliar registra aplicação sem apagar alteração simultânea em outro item ou responsável',async()=>{
 const c=environment(),base=fixture(),current=copy(base);current.execucaoItens['peca-1']={status:'trocada',obs:'Já aplicada',mecId:'outro'};current.timeline.push({acao:'Evento simultâneo'});
 const db=database({'ordens_servico/os-test':current});await c.OSOperacional.saveExecution(context(c,db,base,[row('peca-0','executado')]));
 const out=db.docs.get('ordens_servico/os-test');assert.equal(out.execucaoItens['peca-0'].status,'executado');assert.equal(out.execucaoItens['peca-0'].mecId,'principal');assert.equal(out.execucaoItens['peca-0'].atualizadoPorId,'auxiliar');assert.equal(out.execucaoItens['peca-1'].status,'trocada');assert.equal(out.timeline.length,3);
 const e=out.timeline.at(-1);assert.equal(e.itemDescricao,'Amortecedor');assert.equal(e.statusAnterior,'pendente');assert.equal(e.statusNovo,'executado');assert.equal(e.interno,true);assert.equal(e.visivelCliente,false);
});
test('edições de status e observação no mesmo item se combinam quando são independentes',async()=>{
 const c=environment(),base=fixture(),current=copy(base);current.execucaoItens['peca-0'].obs='Observação simultânea';const db=database({'ordens_servico/os-test':current});
 await c.OSOperacional.saveExecution(context(c,db,base,[row('peca-0','executado')]));assert.equal(db.docs.get('ordens_servico/os-test').execucaoItens['peca-0'].obs,'Observação simultânea');
});
test('conflito no mesmo status preserva banco e produz proposta persistente para JARVIS',async()=>{
 const c=environment(),base=fixture(),current=copy(base);current.execucaoItens['peca-0'].status='trocada';const db=database({'ordens_servico/os-test':current});
 await assert.rejects(c.OSOperacional.saveExecution(context(c,db,base,[row('peca-0','executado')])),/simultâneas/);
 assert.equal(db.docs.get('ordens_servico/os-test').execucaoItens['peca-0'].status,'trocada');const notices=[...db.docs.entries()].filter(([p])=>p.startsWith('chat_equipe/'));assert.equal(notices.length,1);assert.equal(notices[0][1].conflitos[0].proposta.status,'executado');
});
test('item removido ou troca de identidade do índice exige conferência antes de registrar execução',async()=>{
 for(const [key,change] of [['peca-1',os=>os.pecas.pop()],['peca-0',os=>os.pecas.reverse()]]){
  const c=environment(),base=fixture(),current=copy(base);change(current);const db=database({'ordens_servico/os-test':current});await assert.rejects(c.OSOperacional.saveExecution(context(c,db,base,[row(key,'executado')])),/simultâneas/);assert.equal(db.docs.get('ordens_servico/os-test').execucaoItens[key].status,'pendente');
 }
});
test('repetição de callback da transação não duplica auditoria e falha não confirma UI',async()=>{
 const c=environment(),base=fixture(),db=database({'ordens_servico/os-test':base});db.retry=true;await c.OSOperacional.saveExecution(context(c,db,base,[row('peca-0','executado')]));assert.equal(db.docs.get('ordens_servico/os-test').timeline.length,2);
 const dbFail=database({'ordens_servico/os-test':base});dbFail.fail=true;let confirmed=false;await assert.rejects(c.OSOperacional.saveExecution({...context(c,dbFail,base,[row('peca-0','executado')]),confirm:()=>confirmed=true}),/permission/);assert.equal(confirmed,false);assert.equal(dbFail.docs.get('ordens_servico/os-test').execucaoItens['peca-0'].status,'pendente');
});
test('salvar ficha preserva execução, status e eventos alheios e mantém operações financeiras atômicas',async()=>{
 const c=environment(),base=fixture(),current=copy(base);current.status='Pronto';current.execucaoItens['peca-0'].status='executado';current.timeline.push({acao:'Execução simultânea'});const db=database({'ordens_servico/os-test':current,'financeiro/f1':{tenantId:session.tid,status:'Pendente'}});
 const batch=c.OSOperacional.batch(db,db.doc('ordens_servico/os-test'),base,{session:{...session,role:'admin'}});batch.update(db.doc('financeiro/f1'),{status:'Pago'});batch.update(db.doc('ordens_servico/os-test'),{status:base.status,diagnostico:'Confirmado',execucaoItens:base.execucaoItens,timeline:[...base.timeline,{acao:'Diagnóstico confirmado'}]});await batch.commit();
 const out=db.docs.get('ordens_servico/os-test');assert.equal(out.status,'Pronto');assert.equal(out.diagnostico,'Confirmado');assert.equal(out.execucaoItens['peca-0'].status,'executado');assert.equal(out.timeline.length,3);assert.equal(db.docs.get('financeiro/f1').status,'Pago');
});
test('conflito da ficha impede também o commit financeiro',async()=>{
 const c=environment(),base=fixture(),current=copy(base);current.diagnostico='Diagnóstico do gestor';const db=database({'ordens_servico/os-test':current,'financeiro/f1':{status:'Pendente'}});const batch=c.OSOperacional.batch(db,db.doc('ordens_servico/os-test'),base,{session:{...session,role:'admin'}});batch.update(db.doc('financeiro/f1'),{status:'Pago'});batch.update(db.doc('ordens_servico/os-test'),{diagnostico:'Outro diagnóstico',timeline:base.timeline});await assert.rejects(batch.commit(),/simultâneas/);assert.equal(db.docs.get('financeiro/f1').status,'Pendente');
});
test('sincronização atualiza campo intocado, conserva rascunho e captura baseline imutável',()=>{
 const elements={osId:{value:'os-test'},osDesc:{value:'Entrada'},osDiag:{value:''},osKm:{value:''},osPrisma:{value:''},chkObs:{value:''},tlData:{value:'[]'}};const c=environment(elements),base=fixture();c.OSOperacional.open({os:base,session,kind:'equipe'});elements.osDiag.value='Rascunho local';c.OSOperacional.sync({...base,desc:'Novo relato',diagnostico:'Diagnóstico remoto'});assert.equal(elements.osDesc.value,'Novo relato');assert.equal(elements.osDiag.value,'Rascunho local');const snap=c.OSOperacional.base(base.id);snap.desc='Modificado fora';assert.equal(c.OSOperacional.base(base.id).desc,'Novo relato');
});
test('cliente vê exclusivamente eventos permitidos, sem texto, motivo, códigos ou observações internas',()=>{
 const c=environment(),events=[{tipo:'status_os',statusNovo:'Andamento',interno:true,visivelCliente:true,user:'Gestor',acao:'CÓDIGO-SEGREDO',motivo:'CUSTO-SEGREDO'},
 {tipo:'peca_adicionada',visivelCliente:true,acao:'Adicionou peça CLIENTE STATUS CÓDIGO'},{tipo:'execucao_item_os',visivelCliente:true,acao:'Status executado'},
 {acao:'Atualizou orçamento e adicionou peça INTERNO-1'},{acao:'Status: Aprovado -> Em serviço. Motivo: CÓDIGO-SEGREDO',user:'Gestor'},
 {tipo:'orcamento_enviado',user:'Fulano'},{tipo:'status_os',statusNovo:'Pronto. CÓDIGO-SEGREDO'}, {tipo:'observacao_equipe',acao:'status aprovado',visivelCliente:true}];
 const shown=c.PortalEventosPublicos.list(events);assert.equal(shown.length,3);const text=JSON.stringify(shown);assert.doesNotMatch(text,/SEGREDO|adicionou|executado|INTERNO/);assert.match(text,/Orçamento enviado por Fulano/);
});
test('gestor aplica proposta, deixa motivo e registra resolução no mesmo commit',async()=>{
 const elements={osId:{value:'os-test'}},c=environment(elements),base=fixture(),current=copy(base);current.execucaoItens['peca-0'].status='trocada';
 const db=database({'ordens_servico/os-test':current});await assert.rejects(c.OSOperacional.saveExecution(context(c,db,base,[row('peca-0','executado')])),/simultâneas/);
 const [noticePath]=[...db.docs.keys()].filter(p=>p.startsWith('chat_equipe/'));
 const gestor={...session,role:'admin',fid:'gestor',nome:'Gestor de teste'};c.OSOperacional.open({db,os:current,session:gestor,kind:'equipe'});const answers=['P','Conferido presencialmente'];c.prompt=()=>answers.shift();await c.OSOperacional.resolve(noticePath.split('/')[1]);
 const out=db.docs.get('ordens_servico/os-test');assert.equal(out.execucaoItens['peca-0'].status,'executado');assert.equal(out.execucaoItens['peca-0'].atualizadoPorId,'gestor');assert.equal(db.docs.get(noticePath).estado,'resolvido');assert.equal(out.timeline.at(-1).motivo,'Conferido presencialmente');assert.equal(out.timeline.at(-1).user,'Gestor de teste');
});
test('gestor precisa conferir novamente se o campo mudar durante a decisão',async()=>{
 const c=environment({osId:{value:'os-test'}}),base=fixture(),current=copy(base);current.execucaoItens['peca-0'].status='trocada';const db=database({'ordens_servico/os-test':current});await assert.rejects(c.OSOperacional.saveExecution(context(c,db,base,[row('peca-0','executado')])),/simultâneas/);const [noticePath]=[...db.docs.keys()].filter(p=>p.startsWith('chat_equipe/'));
 c.OSOperacional.open({db,os:current,session:{...session,role:'admin'},kind:'equipe'});let calls=0;c.prompt=()=>{if(calls++===0)return 'P';db.docs.get('ordens_servico/os-test').execucaoItens['peca-0'].obs='Alterado durante a decisão';return 'Conferido';};await assert.rejects(c.OSOperacional.resolve(noticePath.split('/')[1]),/mudou durante/);assert.equal(db.docs.get(noticePath).estado,'pendente');assert.equal(db.docs.get('ordens_servico/os-test').execucaoItens['peca-0'].status,'trocada');
});
test('controle existente de responsável mantém a atribuição editável ao gestor',async()=>{
 const c=environment(),base=fixture(),db=database({'ordens_servico/os-test':base});const r=row('servico-0','pendente');r.dataset.mecId='principal';const old=r.querySelector;r.querySelector=s=>s==='.exec-mec'?{value:'auxiliar',disabled:false}:old(s);
 await c.OSOperacional.saveExecution({...context(c,db,base,[r]),session:{...session,role:'admin'},resolveName:id=>id==='auxiliar'?'Auxiliar':'Principal'});const out=db.docs.get('ordens_servico/os-test');assert.equal(out.execucaoItens['servico-0'].mecId,'auxiliar');assert.equal(out.execucaoItens['servico-0'].mecNome,'Auxiliar');assert.equal(out.timeline.at(-1).responsavelNovoId,'auxiliar');
});
test('HTML e scripts alterados compilam e CSS/media queries permanecem idênticos à base',()=>{
 const cp=require('node:child_process');for(const f of ['equipe.html','jarvis.html','cliente.html','clienteOficial.html','backup-banco.html']){
  const source=fs.readFileSync(path.join(root,f),'utf8');for(const [i,m]of [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].entries())if(m[1].trim())new vm.Script(m[1],{filename:f+':'+i});
  const baseline=cp.execFileSync('git',['show','151178af:'+f],{cwd:root,encoding:'utf8'});const styles=s=>[...s.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(x=>x[1]);assert.deepEqual(styles(source),styles(baseline),f+' CSS');
 }
 for(const f of ['js/os-operacional.js','js/portal-eventos-publicos.js','js/os.js','js/backup-banco-v1.js','js/equipe-usabilidade-v262.js','js/hardening-operacional-20260515.js','js/jarvis-firestore-profissional-v2612.js'])new vm.Script(fs.readFileSync(path.join(root,f),'utf8'),{filename:f});
});
module.exports={environment,database,fixture,row,context};
