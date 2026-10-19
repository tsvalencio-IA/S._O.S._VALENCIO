/* S.O.S. VALÊNCIO — BACKUP FIRESTORE V1
 * Escopo independente. Nunca altera coleções no modo exportar/analisar.
 * Restaurar: upsert por ID via transações e merge, sem delete.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const COLLECTIONS=Object.freeze([
 'clientes','veiculos','ordens_servico','estoqueItems','financeiro','funcionarios',
 'fornecedores','agendamentos','mensagens','chat_equipe','lixeira_auditoria',
 'auditLogs','serviceCategories','cotacoes_pecas','cotacoes_publicas',
 'cotacoes_respostas','notificacoes_live','vendas_pecas','nf_itens_vinculos'
]);
const SUBCOLLECTIONS=Object.freeze({
 ordens_servico:['items','financial','internalNotes','publicTimeline','execution'],
 cotacoes_publicas:['respostas']
});
// Consultas compatíveis com as regras sameTenantRead das subcoleções operacionais.
const CHILD_TENANT_FILTER=new Set(['items','publicTimeline','execution','respostas']);
const IMMUTABLE=new Set(['mensagens','lixeira_auditoria','auditLogs','ordens_servico/*/internalNotes',
 'ordens_servico/*/publicTimeline','cotacoes_publicas/*/respostas']);
const PROTECTED=new Set(['oficinas','notificacoes_live']);
const ROOTS=new Set([...COLLECTIONS,'oficinas']);
let lastDownloadURL=null;
const LIMIT=150000, FILE_LIMIT=160*1024*1024, PAGE=200, VERSION=1, KDF_ITERATIONS=310000;
const tenant=String(sessionStorage.getItem('j_tid')||'').trim();
const role=String(sessionStorage.getItem('j_role')||'').toLowerCase();
const actor=String(sessionStorage.getItem('j_actor_type')||'').toLowerCase();
let db=null,busy=false,plan=null,source=null;
const counters=()=>({novo:0,atualizar:0,igual:0,protegido:0});
const setStatus=(s,isErr=false)=>{const e=$('status');e.textContent=s;e.className=isErr?'error':'';};
const sleep=()=>new Promise(resolve=>setTimeout(resolve,0));
const msg=e=>String(e?.message||e||'Erro desconhecido');
const numFmt=n=>new Intl.NumberFormat('pt-BR').format(n);
function progress(p,label){const v=Math.max(0,Math.min(100,Math.round(p)));$('barra').style.width=v+'%';$('andamento').setAttribute('aria-valuenow',String(v));if(label)setStatus(label);}
function access(){
 if(!tenant||tenant==='MASTER_ADMIN'||role!=='admin'||actor==='equipe')
  throw Error('Acesso restrito ao administrador principal da oficina. Faça login no JARVIS como administrador.');
 if(!window.crypto?.subtle||!window.TextEncoder)throw Error('Este recurso exige uma conexão HTTPS e navegador com criptografia WebCrypto.');
 if(!window.initFirebase||!window.firebase?.firestore)throw Error('Firebase não foi carregado corretamente.');
}
function refreshRestoreButton(){
 $('btnRestaurar').disabled=busy||!plan||!plan.alteracoes||$('confirmar').value.trim()!==('RESTAURAR '+plan.alteracoes);
}
function disable(flag){
 busy=flag;
 $('btnExportar').disabled=flag||!db;
 $('btnAnalisar').disabled=flag||!db;
 refreshRestoreButton();
 $('btnCancelar').disabled=flag;
}
function report(data){
 $('resultado').hidden=false;
 $('resultado').textContent=typeof data==='string'?data:JSON.stringify(data,null,2);
}
function toB64(u8){let str='';for(let i=0;i<u8.length;i+=16384)str+=String.fromCharCode(...u8.subarray(i,i+16384));return btoa(str);}
function fromB64(s){if(typeof s!=='string'||s.length>FILE_LIMIT*2)throw Error('Dados criptografados inválidos ou muito grandes.');const bin=atob(s);const out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;}
async function derive(password,salt,iter){
 const raw=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:iter,hash:'SHA-256'},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function encrypt(plain,password){
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const key=await derive(password,salt,KDF_ITERATIONS);
 const content=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(plain)));
 return {format:'SOS_VALENCIO_BACKUP_ENCRYPTED',version:VERSION,alg:'AES-256-GCM',
  kdf:'PBKDF2-SHA256',iterations:KDF_ITERATIONS,salt:toB64(salt),iv:toB64(iv),ciphertext:toB64(new Uint8Array(content))};
}
async function decrypt(wrapper,password){
 if(!wrapper||wrapper.format!=='SOS_VALENCIO_BACKUP_ENCRYPTED'||wrapper.version!==VERSION||
    wrapper.alg!=='AES-256-GCM'||wrapper.kdf!=='PBKDF2-SHA256'||wrapper.iterations!==KDF_ITERATIONS)
  throw Error('Formato ou versão do backup não reconhecido. Nenhum dado foi alterado.');
 try{
  const salt=fromB64(wrapper.salt),iv=fromB64(wrapper.iv);
  if(salt.length!==16||iv.length!==12)throw Error('Parâmetros criptográficos inválidos.');
  const key=await derive(password,salt,wrapper.iterations);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,fromB64(wrapper.ciphertext));
  return JSON.parse(new TextDecoder().decode(plain));
 }catch(e){throw Error('Senha incorreta ou arquivo danificado. Nenhum dado foi alterado.');}
}
function encode(value,depth=0){
 if(depth>70)throw Error('Estrutura Firestore muito profunda para exportar.');
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'){
  if(Number.isFinite(value))return value;
  return {__sosbackup:'number',value:String(value)};
 }
 if(typeof value==='undefined')throw Error('Valor undefined não pode ser exportado.');
 const ff=firebase.firestore;
 if(value instanceof ff.Timestamp)return {__sosbackup:'timestamp',s:value.seconds,n:value.nanoseconds};
 if(value instanceof ff.GeoPoint)return {__sosbackup:'geopoint',lat:value.latitude,lng:value.longitude};
 if(ff.Blob&&value instanceof ff.Blob)return {__sosbackup:'bytes',b64:value.toBase64()};
 if(ff.DocumentReference&&value instanceof ff.DocumentReference)return {__sosbackup:'reference',path:value.path};
 if(value instanceof Date)return {__sosbackup:'timestamp',s:Math.floor(value.getTime()/1000),n:(value.getTime()%1000)*1000000};
 if(Array.isArray(value))return value.map(v=>encode(v,depth+1));
 if(value&&typeof value==='object'){
  const output={};
  for(const key of Object.keys(value)){
   if(['__proto__','prototype','constructor','__sosbackup'].includes(key))
    throw Error('Campo reservado não suportado: '+key);
   output[key]=encode(value[key],depth+1);
  }
  return output;
 }
 throw Error('Tipo Firestore não suportado: '+typeof value);
}
function decode(value,depth=0){
 if(depth>70)throw Error('Estrutura de backup excessivamente profunda.');
 if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number')return value;
 if(Array.isArray(value))return value.map(x=>decode(x,depth+1));
 if(!value||typeof value!=='object')throw Error('Tipo inválido no backup.');
 const kind=value.__sosbackup;
 if(kind){
  if(kind==='timestamp'){
   if(!Number.isInteger(value.s)||!Number.isInteger(value.n)||value.n<0||value.n>=1e9)throw Error('Timestamp inválido.');
   return new firebase.firestore.Timestamp(value.s,value.n);
  }
  if(kind==='geopoint'){
   if(!Number.isFinite(value.lat)||!Number.isFinite(value.lng))throw Error('Coordenadas inválidas.');
   return new firebase.firestore.GeoPoint(value.lat,value.lng);
  }
  if(kind==='bytes')return firebase.firestore.Blob.fromBase64String(value.b64);
  if(kind==='reference'){
   if(!validReference(value.path))throw Error('Referência Firestore inválida: '+value.path);
   return db.doc(value.path);
  }
  if(kind==='number'){
   if(value.value==='NaN')return NaN;
   if(value.value==='Infinity')return Infinity;
   if(value.value==='-Infinity')return -Infinity;
  }
  throw Error('Tipo especial desconhecido: '+kind);
 }
 const result={};
 for(const key of Object.keys(value)){
  if(['__proto__','constructor','prototype','__sosbackup'].includes(key))throw Error('Chave reservada no backup.');
  result[key]=decode(value[key],depth+1);
 }
 return result;
}
function stable(value){
 if(Array.isArray(value))return value.map(stable);
 if(value&&typeof value==='object'){
  const o={};for(const k of Object.keys(value).sort())o[k]=stable(value[k]);return o;
 }
 return value;
}
const fingerprint=encoded=>JSON.stringify(stable(encoded));
function validReference(path){
 if(typeof path!=='string'||path.length>950||path.includes('//'))return false;
 const pieces=path.split('/');
 return pieces.length>=2&&pieces.length%2===0&&!pieces.some(x=>!x||x==='.'||x==='..'||/[?#\\]/.test(x));
}
function validPath(path){
 if(typeof path!=='string'||path.length>950||path.includes('//'))return false;
 const p=path.split('/');
 if((p.length!==2&&p.length!==4)||p.some(x=>!x||x==='.'||x==='..'||/[?#\\]/.test(x)))return false;
 if(!ROOTS.has(p[0]))return false;
 if(p[0]==='oficinas')return p.length===2&&p[1]===tenant;
 if(p.length===2)return true;
 return !!(SUBCOLLECTIONS[p[0]]||[]).includes(p[2]);
}
function isImmutable(path){
 const p=path.split('/');
 return IMMUTABLE.has(p[0])||IMMUTABLE.has(p[0]+'/*/'+p[2]);
}
function isProtected(path){return PROTECTED.has(path.split('/')[0]);}
function ensureTenant(path,value){
 if(!validPath(path))throw Error('Caminho de documento fora do escopo permitido: '+path);
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Documento inválido: '+path);
 const t=value.tenantId;
 if(path.startsWith('oficinas/'))return;
 if(t!==undefined&&t!==null&&t!==tenant)throw Error('Documento pertence a outra oficina: '+path);
 if(path.split('/').length===2&&t!==tenant)throw Error('Documento sem tenantId correto: '+path);
}
function canPrepare(backup){
 if(!backup||backup.format!=='SOS_VALENCIO_FIRESTORE'||backup.version!==VERSION||
    backup.scope!=='TENANT_ONLY'||!Array.isArray(backup.documents)||!backup.projectId)
  throw Error('Arquivo de dados inválido ou incompatível.');
 if(backup.tenantId!==tenant)throw Error('Backup pertence a outra oficina. Restauração bloqueada.');
 if(backup.projectId!==db.app.options.projectId)throw Error('Backup pertence a outro projeto Firebase. Restauração bloqueada.');
 if(backup.documents.length>LIMIT)throw Error('Limite de segurança de documentos excedido.');
 const unique=new Set();
 for(const d of backup.documents){
  if(!d||typeof d.path!=='string'||unique.has(d.path))throw Error('Caminho duplicado ou inválido no backup.');
  unique.add(d.path);
  const decoded=decode(d.data);
  ensureTenant(d.path,decoded);
 }
 if(backup.count!==backup.documents.length)throw Error('Contagem de documentos do backup não confere.');
}
async function eachPage(query,callback){
 let cursor=null;
 while(true){
  let q=query.orderBy(firebase.firestore.FieldPath.documentId()).limit(PAGE);
  if(cursor)q=q.startAfter(cursor);
  const snap=await q.get({source:'server'});
  for(const d of snap.docs)await callback(d);
  if(snap.size<PAGE)break;
  cursor=snap.docs[snap.docs.length-1];
  await sleep();
 }
}
async function exportDB(){
 const password=$('senhaExportar').value,password2=$('senhaExportar2').value;
 if(password.length<12||password!==password2)throw Error('Informe uma senha de no mínimo 12 caracteres e confirme exatamente igual.');
 const docs=[],counts={},rootCollections=[...COLLECTIONS,'oficinas'];
 const addDoc=(snapshot)=>{
  if(!snapshot.exists)return;
  const value=snapshot.data();
  ensureTenant(snapshot.ref.path,value);
  if(docs.length>=LIMIT)throw Error('Limite de '+LIMIT+' registros alcançado. Não foi gerado backup incompleto.');
  docs.push({path:snapshot.ref.path,data:encode(value)});
  const group=snapshot.ref.path.split('/').filter((_,i)=>i%2===0).join('/');
  counts[group]=(counts[group]||0)+1;
 };
 for(let i=0;i<rootCollections.length;i++){
  const coll=rootCollections[i];
  progress(i/rootCollections.length*80,'Exportando '+coll+' ('+(i+1)+'/'+rootCollections.length+') • '+numFmt(docs.length)+' documentos');
  if(coll==='oficinas'){
   const doc=await db.collection('oficinas').doc(tenant).get({source:'server'});addDoc(doc);
   continue;
  }
  await eachPage(db.collection(coll).where('tenantId','==',tenant),async d=>{
   addDoc(d);
   const childNames=SUBCOLLECTIONS[coll]||[];
   for(const child of childNames){
    const children=d.ref.collection(child);
    const scoped=CHILD_TENANT_FILTER.has(child)?children.where('tenantId','==',tenant):children;
    await eachPage(scoped,async nested=>addDoc(nested));
   }
  });
 }
 if(!docs.length)throw Error('Nenhum documento foi encontrado. Exportação cancelada.');
 const backup={format:'SOS_VALENCIO_FIRESTORE',version:VERSION,scope:'TENANT_ONLY',
  projectId:db.app.options.projectId,tenantId:tenant,createdAt:new Date().toISOString(),
  count:docs.length,inventory:[...COLLECTIONS,'oficinas'],subcollections:SUBCOLLECTIONS,counts,documents:docs};
 progress(85,'Criptografando '+numFmt(docs.length)+' documentos…');
 const encrypted=await encrypt(backup,password);
 progress(96,'Preparando download seguro…');
 const blob=new Blob([JSON.stringify(encrypted)],{type:'application/json'});
 if(blob.size>FILE_LIMIT)throw Error('Backup gerado acima de 160 MB. Não é seguro criar um arquivo que o importador atual não consegue abrir.');
 if(lastDownloadURL)URL.revokeObjectURL(lastDownloadURL);
 const url=URL.createObjectURL(blob);lastDownloadURL=url;
 const holder=$('downloadHolder');holder.replaceChildren();
 const a=document.createElement('a');
 a.download='SOS_VALENCIO_BACKUP_'+new Date().toISOString().replace(/[:.]/g,'-')+'.sosbackup';
 a.href=url;a.textContent='⬇ BAIXAR BACKUP GERADO';
 a.style.cssText='display:block;margin-top:14px;padding:13px;text-align:center;background:#17566f;border:1px solid #28c69e;color:white;border-radius:10px;font-weight:800;text-decoration:none';
 holder.appendChild(a);
 a.click();
 $('senhaExportar').value='';$('senhaExportar2').value='';
 progress(100,'Backup criptografado preparado para download: '+numFmt(docs.length)+' documentos • '+numFmt(blob.size)+' bytes.');
 report({resultado:'Arquivo de backup gerado; confirme que o navegador concluiu o download.',oficina:tenant,
  projetoFirebase:backup.projectId,documentos:docs.length,colecoes:counts,
  observacoes:['Backup do Firestore nas coleções identificadas; não inclui arquivos externos/Storage nem contas do Firebase Authentication.',
   'O sistema não pode confirmar automaticamente se o arquivo foi salvo em uma pasta do aparelho.',
   'Guarde a senha e o arquivo em local seguro.']});
}
async function workers(items,limit,fn){
 let n=0,done=0,results=new Array(items.length);
 await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
  while(n<items.length){const at=n++;try{results[at]=await fn(items[at],at);}catch(e){results[at]={error:msg(e),path:items[at]?.path};}done++;
   if(done%Math.max(1,Math.floor(items.length/100))===0)progress(4+(done/items.length)*86,'Conferindo '+numFmt(done)+' / '+numFmt(items.length)+' documentos…');
  }
 }));
 return results;
}
async function preview(){
 plan=null;$('previsao').hidden=true;$('resultado').hidden=true;
 const file=$('arquivo').files?.[0],password=$('senhaImportar').value;
 if(!file)throw Error('Selecione um arquivo de backup.');
 if(file.size<=0||file.size>FILE_LIMIT)throw Error('Arquivo vazio ou acima de 160 MB. Nenhum dado foi alterado.');
 if(!password)throw Error('Informe a senha do arquivo.');
 progress(2,'Abrindo arquivo criptografado…');
 const wrapper=JSON.parse(await file.text());
 const backup=await decrypt(wrapper,password);
 canPrepare(backup);
 source=backup;
 $('senhaImportar').value='';
 progress(4,'Backup autenticado. Conferindo documentos atuais na nuvem…');
 const results=await workers(backup.documents,6,async item=>{
  const value=decode(item.data);ensureTenant(item.path,value);
  if(isProtected(item.path))return {path:item.path,estado:'protegido',razao:'Configuração protegida ou informação temporária — não restaurar automaticamente.'};
  const snap=await db.doc(item.path).get({source:'server'});
  if(snap.exists){
   if(item.path.split('/').length===2&&snap.data()?.tenantId!==tenant)
    throw Error('Documento atual pertence a outra oficina: '+item.path);
   if(isImmutable(item.path))return {path:item.path,estado:'protegido',razao:'Registro imutável pelas regras atuais.'};
   const before=fingerprint(encode(snap.data())),after=fingerprint(item.data);
   return {path:item.path,estado:before===after?'igual':'atualizar',before};
  }
  if(item.path.split('/').length===4){
   const parentPath=item.path.split('/').slice(0,2).join('/');
   const parent=await db.doc(parentPath).get({source:'server'});
   if(!parent.exists||parent.data()?.tenantId!==tenant)throw Error('Documento pai inexistente ou fora da oficina: '+parentPath);
  }
  return {path:item.path,estado:'novo',before:null};
 });
 const failures=results.filter(x=>x.error);
 if(failures.length)throw Error('Prévia abortada: '+failures.length+' registros não puderam ser conferidos. Primeiros erros: '+failures.slice(0,5).map(x=>x.path+' — '+x.error).join(' | '));
 const summary=counters(),byColl=new Map(),writeOps=[];
 results.forEach((r,i)=>{
  summary[r.estado]++;
  const col=r.path.split('/').filter((_,n)=>n%2===0).join('/');
  if(!byColl.has(col))byColl.set(col,counters());
  byColl.get(col)[r.estado]++;
  if(r.estado==='novo'||r.estado==='atualizar')writeOps.push({...r,data:backup.documents[i].data});
 });
 const changes=summary.novo+summary.atualizar;
 plan={writeOps,alteracoes:changes,summary,byColl,previewAt:new Date().toISOString()};
 $('origem').textContent='Oficina: '+tenant+' · Firebase: '+backup.projectId+' · Criado em: '+backup.createdAt+' · '+numFmt(backup.count)+' documentos';
 $('resumo').replaceChildren();
 for(const [key,label] of [['novo','Criar'],['atualizar','Atualizar'],['igual','Sem mudanças'],['protegido','Protegidos']]){
  const box=document.createElement('div');box.className='stat';const strong=document.createElement('strong');
  strong.textContent=numFmt(summary[key]);const sub=document.createElement('span');sub.textContent=label;box.append(strong,sub);$('resumo').appendChild(box);
 }
 $('comparacao').replaceChildren();
 for(const [name,counts] of byColl){
  const tr=document.createElement('tr');[name,counts.novo,counts.atualizar,counts.igual,counts.protegido].forEach(x=>{
   const td=document.createElement('td');td.textContent=String(x);tr.appendChild(td);
  });$('comparacao').appendChild(tr);
 }
 $('avisos').textContent='Não haverá exclusões. Alterações serão feitas com merge dos campos contidos no backup. '+
  summary.protegido+' documento(s) protegido(s) não serão modificados. '+
  'As regras do Firestore ainda podem impedir determinados registros; todos os resultados serão relatados. '+
  'Se dados mudarem depois da prévia, esses registros serão bloqueados para evitar sobrescritas silenciosas.';
 $('fraseConfirmar').textContent='RESTAURAR '+changes;
 $('confirmar').value='';
 $('previsao').hidden=false;
 progress(100,'Prévia pronta. Nenhum documento foi gravado. Confira os totais antes de confirmar.');
 $('btnRestaurar').disabled=true;
 if(!changes){setStatus('Arquivo conferido: não há registros novos ou alterados permitidos. Nenhuma gravação necessária.');}
}
async function restore(){
 if(!plan||!source||!plan.alteracoes)throw Error('Nenhuma restauração pronta para executar.');
 if($('confirmar').value.trim()!==('RESTAURAR '+plan.alteracoes))throw Error('Confirmação não corresponde ao total de documentos.');
 if(source.tenantId!==tenant||source.projectId!==db.app.options.projectId)throw Error('Backup de outra oficina/projeto.');
 const items=plan.writeOps;
 const result={criados:0,atualizados:0,inalterados:plan.summary.igual,protegidos:plan.summary.protegido,conflitos:0,falhas:0,detalhes:[]};
 const processed=await workers(items,3,async item=>{
  try{
   const ref=db.doc(item.path);
   const decoded=decode(item.data);
   ensureTenant(item.path,decoded);
   const outcome=await db.runTransaction(async tx=>{
    const current=await tx.get(ref);
    if(current.exists&&current.data()?.tenantId!==tenant)return 'bloqueado';
    if(item.estado==='novo'&&current.exists)return 'conflito';
    if(item.estado==='atualizar'&&(!current.exists||fingerprint(encode(current.data()))!==item.before))return 'conflito';
    if(isImmutable(item.path)&&current.exists)return 'bloqueado';
    tx.set(ref,decoded,{merge:true});
    return item.estado;
   });
   return {path:item.path,status:outcome};
  }catch(e){return {path:item.path,status:'falha',error:msg(e)};}
 });
 for(const p of processed){
  if(p.error||p.status==='falha'){result.falhas++;result.detalhes.push(p.path+' — '+(p.error||'Falha na escrita'));}
  else if(p.status==='conflito'||p.status==='bloqueado'){result.conflitos++;result.detalhes.push(p.path+' — alterado após a prévia, ou bloqueado');}
  else if(p.status==='novo')result.criados++;
  else if(p.status==='atualizar')result.atualizados++;
 }
 progress(100,'Restauração concluída: '+result.criados+' novos, '+result.atualizados+' atualizados, '+result.falhas+' falhas, '+result.conflitos+' conflitos.');
 report({resultado:result.falhas||result.conflitos?'RESTAURAÇÃO PARCIAL — confira os registros não aplicados':'RESTAURAÇÃO FINALIZADA — sem exclusões',...result,
  aviso:'Nenhum documento ausente do backup foi excluído. Documentos atuais com alteração posterior à prévia foram preservados.'});
 plan=null;source=null;$('previsao').hidden=true;$('confirmar').value='';$('arquivo').value='';
}
async function operation(fn){
 if(busy)return;
 try{disable(true);await fn();}
 catch(e){setStatus(msg(e),true);report('Operação interrompida: '+msg(e));}
 finally{disable(false);}
}
function setup(){
 try{
  access();db=window.initFirebase();
  if(!db||!db.app?.options?.projectId)throw Error('Projeto Firestore não identificado.');
  $('colecoes').textContent=COLLECTIONS.join(' · ')+' · oficinas (configuração protegida). Subcoleções: OS/items, OS/financial, OS/internalNotes, OS/publicTimeline, OS/execution, cotacoes_publicas/respostas.';
  setStatus('Oficina '+tenant+' · projeto '+db.app.options.projectId+' · pronto para exportar ou conferir um backup.');
  disable(false);
 }catch(e){
  setStatus(msg(e),true);
  $('colecoes').textContent='Acesso indisponível.';
  return;
 }
 $('btnExportar').addEventListener('click',()=>operation(exportDB));
 $('btnAnalisar').addEventListener('click',()=>operation(preview));
 $('btnRestaurar').addEventListener('click',()=>operation(restore));
 $('confirmar').addEventListener('input',refreshRestoreButton);
 $('btnCancelar').addEventListener('click',()=>{plan=null;source=null;$('confirmar').value='';$('previsao').hidden=true;disable(false);setStatus('Importação cancelada. Nenhum documento foi alterado.');});
 $('arquivo').addEventListener('change',()=>{plan=null;source=null;$('previsao').hidden=true;disable(false);});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();