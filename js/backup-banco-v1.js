/* S.O.S. VALÊNCIO — BACKUP FIRESTORE V1 / V2
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
 'cotacoes_respostas','notificacoes_live','vendas_pecas','nf_itens_vinculos',
 'notasFiscaisEntrada','notas_fiscais_entrada','estoque_movimentos',
 'pacotes_boletos','auditoria','checklists','checklistsEntrega','cerebro_respostas'
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
const cargo=String(sessionStorage.getItem('j_cargo')||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const acessoJarvis=String(sessionStorage.getItem('j_cargo_acesso')||'').trim().toLowerCase();
let db=null,busy=false,plan=null,source=null;
const counters=()=>({novo:0,atualizar:0,igual:0,protegido:0});
const setStatus=(s,isErr=false)=>{const e=$('status');e.textContent=s;e.className=isErr?'error':'';};
const sleep=()=>new Promise(resolve=>setTimeout(resolve,0));
const msg=e=>String(e?.message||e||'Erro desconhecido');
const numFmt=n=>new Intl.NumberFormat('pt-BR').format(n);
function progress(p,label){const v=Math.max(0,Math.min(100,Math.round(p)));$('barra').style.width=v+'%';$('andamento').setAttribute('aria-valuenow',String(v));if(label)setStatus(label);}
function access(){
 // O login de funcionário com acesso ao JARVIS usa j_role=admin e j_actor_type=equipe.
 // Somente gerentes/gestores com j_cargo_acesso=jarvis são autorizados aqui,
 // além do administrador principal. Nunca liberar todo perfil "equipe".
 const adminPrincipal=role==='admin'&&actor!=='equipe';
 const gestorJarvis=role==='admin'&&actor==='equipe'&&acessoJarvis==='jarvis'&&
   (cargo==='gestor'||cargo==='gerente');
 if(!tenant||tenant==='MASTER_ADMIN'||!(adminPrincipal||gestorJarvis))
  throw Error('Backup disponível para administrador principal, gerente ou gestor autorizado no JARVIS.');
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
 if($('btnRetomar'))$('btnRetomar').disabled=flag||!db;
 if($('btnPausar'))$('btnPausar').disabled=!flag;
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
 if(!/^[0-9]{4}$/.test(password)||password!==password2)throw Error('Informe exatamente 4 dígitos numéricos e confirme a mesma senha.');
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
 if(file.size<=0||file.size>V2_FILE_LIMIT)throw Error('Arquivo vazio ou acima de 2 GB. Nenhum dado foi alterado.');
 if(!password)throw Error('Informe a senha do arquivo.');
 progress(2,'Abrindo arquivo criptografado…');
 const first=await file.slice(0,4096).text();
 if(/"version"\s*:\s*2(?:,|})/.test(first.split('\n')[0])){await previewV2(file,password);$('senhaImportar').value='';return;}
 if(file.size>FILE_LIMIT)throw Error('Backup V1 acima de 160 MB. Use um backup novo V2.');
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
 const restoreItem=async item=>{
  try{
   const ref=db.doc(item.path);
   const encoded=item.data || (await importBlock(item.block))[item.index].data;
   const decoded=decode(encoded);
   ensureTenant(item.path,decoded);
   const outcome=await db.runTransaction(async tx=>{
    const current=await tx.get(ref);
    if(item.path.split('/').length===4){const parent=await tx.get(db.doc(item.path.split('/').slice(0,2).join('/')));if(!parent.exists||parent.data()?.tenantId!==tenant)return 'bloqueado';}
    if(current.exists && ((item.path.split('/').length===2&&current.data()?.tenantId!==tenant)||(current.data()?.tenantId!=null&&current.data().tenantId!==tenant)))return 'bloqueado';
    if(item.estado==='novo'&&current.exists)return 'conflito';
    if(item.estado==='atualizar'&&(!current.exists||(item.hashBefore?await hashData(encode(current.data())):fingerprint(encode(current.data())))!==item.before))return 'conflito';
    if(isImmutable(item.path)&&current.exists)return 'bloqueado';
    tx.set(ref,decoded,{merge:true});
    return item.estado;
   });
   return {path:item.path,status:outcome};
  }catch(e){return {path:item.path,status:'falha',error:msg(e)};}
 };
 const roots=items.filter(i=>i.path.split('/').length===2),children=items.filter(i=>i.path.split('/').length===4);
 const processed=[...await workers(roots,3,restoreItem),...await workers(children,3,restoreItem)];
 for(const p of processed){
  if(p.error||p.status==='falha'){result.falhas++;result.detalhes.push(p.path+' — '+(p.error||'Falha na escrita'));}
  else if(p.status==='conflito'||p.status==='bloqueado'){result.conflitos++;result.detalhes.push(p.path+' — alterado após a prévia, ou bloqueado');}
  else if(p.status==='novo')result.criados++;
  else if(p.status==='atualizar')result.atualizados++;
 }
 progress(100,'Restauração concluída: '+result.criados+' novos, '+result.atualizados+' atualizados, '+result.falhas+' falhas, '+result.conflitos+' conflitos.');
 report({resultado:result.falhas||result.conflitos?'RESTAURAÇÃO PARCIAL — confira os registros não aplicados':'RESTAURAÇÃO FINALIZADA — sem exclusões',...result,
  aviso:'Nenhum documento ausente do backup foi excluído. Documentos atuais com alteração posterior à prévia foram preservados.'});
 plan=null;source=null;importV2=null;$('previsao').hidden=true;$('confirmar').value='';$('arquivo').value='';
}
async function operation(fn){
 if(busy)return;
 try{disable(true);await fn();}
 catch(e){setStatus(msg(e),true);report('Operação interrompida: '+msg(e));}
 finally{disable(false);}
}
// V2: páginas pequenas, blocos autenticados, checkpoint criptografado e leitura em fluxo.
// Os checkpoints são locais ao navegador. A senha/chave nunca é gravada no IndexedDB.
const V2_PAGE=50,V2_BLOCK=768*1024,V2_FILE_LIMIT=2*1024*1024*1024,V2_DOC_LIMIT=1000000;
let pauseRequested=false,checkpointDB=null,importV2=null;
const runKey=()=>db.app.options.projectId+':'+tenant;
async function localDB(){
 if(checkpointDB)return checkpointDB;
 if(!window.indexedDB)throw Error('O navegador não oferece armazenamento local para retomar o backup.');
 checkpointDB=await new Promise((resolve,reject)=>{
  const r=indexedDB.open('sos-backup-checkpoints-v2',1);
  r.onupgradeneeded=()=>{r.result.createObjectStore('runs');r.result.createObjectStore('blocks');};
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
 });
 return checkpointDB;
}
async function localGet(store,key){const d=await localDB();return new Promise((resolve,reject)=>{const r=d.transaction(store,'readonly').objectStore(store).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function localCommit(key,state,frames){
 const d=await localDB();await new Promise((resolve,reject)=>{
  const tx=d.transaction(['runs','blocks'],'readwrite');
  for(const f of frames)tx.objectStore('blocks').put(f,state.id+':'+String(f.n).padStart(9,'0'));
  tx.objectStore('runs').put(state,key);
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Falha no checkpoint; a página não foi marcada como concluída.'));
 });
}
async function localDiscard(key){
 const state=await localGet('runs',key);if(!state)return;
 const d=await localDB();await new Promise((resolve,reject)=>{
  const tx=d.transaction(['runs','blocks'],'readwrite');tx.objectStore('runs').delete(key);
  const range=IDBKeyRange.bound(state.id+':',state.id+':\uffff');tx.objectStore('blocks').delete(range);
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
 });
}
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
const hashData=encoded=>hash(new TextEncoder().encode(fingerprint(encoded)));
async function transformBytes(bytes,compress){
 const C=compress?window.CompressionStream:window.DecompressionStream;
 if(!C)throw Error('Este navegador não consegue '+(compress?'compactar':'abrir a compactação deste backup')+'.');
 const reader=new Blob([bytes]).stream().pipeThrough(new C('gzip')).getReader(),parts=[];let length=0;
 try{while(true){const r=await reader.read();if(r.done)break;length+=r.value.length;if(length>4*1024*1024)throw Error('Bloco descompactado excede o limite seguro.');parts.push(r.value);}}
 catch(e){await reader.cancel().catch(()=>{});throw e;}
 const out=new Uint8Array(length);let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;
}
const aad=(header,type,n)=>new TextEncoder().encode(JSON.stringify(header)+'|'+type+'|'+n);
async function sealV2(data,key,header,type,n){
 let bytes=new TextEncoder().encode(JSON.stringify(data));
 if(header.compression==='gzip')bytes=await transformBytes(bytes,true);
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(header,type,n)},key,bytes));
 return {type,n,iv:toB64(iv),ciphertext:toB64(cipher),sha256:await hash(cipher)};
}
async function openV2(frame,key,header){
 if(!frame||!['block','manifest'].includes(frame.type)||!Number.isInteger(frame.n)||typeof frame.ciphertext!=='string'||frame.ciphertext.length>6*1024*1024)throw Error('Bloco de backup inválido.');
 const cipher=fromB64(frame.ciphertext),iv=fromB64(frame.iv);
 if(iv.length!==12||await hash(cipher)!==frame.sha256)throw Error('Verificação de integridade falhou no bloco '+frame.n+'.');
 let bytes;
 try{bytes=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad(header,frame.type,frame.n)},key,cipher));}
 catch(e){throw Error('Senha incorreta ou bloco adulterado: '+frame.n+'.');}
 if(header.compression==='gzip')bytes=await transformBytes(bytes,false);
 if(bytes.length>4*1024*1024)throw Error('Bloco acima do tamanho seguro.');
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
async function readServer(target,label){
 for(let attempt=0;attempt<3;attempt++){
  let timer;
  try{return await Promise.race([target.get({source:'server'}),new Promise((_,reject)=>{timer=setTimeout(()=>{const e=Error('A leitura demorou demais em '+label+'. O checkpoint anterior foi preservado para retomar.');e.code='backup-timeout';reject(e);},45000);})]);}
  catch(e){if(!['unavailable','resource-exhausted','aborted'].includes(String(e.code||'').replace('firestore/',''))||attempt===2)throw e;await new Promise(r=>setTimeout(r,500*(attempt+1)));}
  finally{clearTimeout(timer);}
 }
}
function queryTask(path,filterTenant,cursor=null){return {path,filterTenant,cursor};}
async function readTask(task){
 if(task.document){const snap=await readServer(db.doc(task.path),task.path);return {docs:snap.exists?[snap]:[],next:[]};}
 let q=db.collection(task.path);if(task.filterTenant)q=q.where('tenantId','==',tenant);
 q=q.orderBy(firebase.firestore.FieldPath.documentId()).limit(V2_PAGE);if(task.cursor)q=q.startAfter(task.cursor);
 const snap=await readServer(q,task.path),next=[];
 if(snap.size===V2_PAGE)next.push(queryTask(task.path,task.filterTenant,snap.docs.at(-1).id));
 if(task.path.split('/').length===1)for(const d of snap.docs)for(const name of SUBCOLLECTIONS[task.path]||[])next.push(queryTask(d.ref.path+'/'+name,CHILD_TENANT_FILTER.has(name)));
 return {docs:snap.docs,next};
}
async function downloadV2(state,key){
 const manifest=state.manifest;
 if(!manifest||!state.finished)throw Error('Backup ainda incompleto. Use retomar.');
 // Blob recebe os blocos individualmente, sem criar uma string gigante.
 const parts=[JSON.stringify(state.header)+'\n'];
 for(let n=0;n<state.blocks;n++){
  const f=await localGet('blocks',state.id+':'+String(n).padStart(9,'0'));if(!f)throw Error('Checkpoint incompleto: falta bloco '+n+'.');
  const cipher=fromB64(f.ciphertext);if(await hash(cipher)!==f.sha256)throw Error('Bloco local danificado: '+n+'.');
  parts.push(JSON.stringify(f)+'\n');if(n%20===0){progress(96,'Preparando arquivo • bloco '+(n+1)+'/'+state.blocks);await sleep();}
 }
 parts.push(JSON.stringify(manifest)+'\n');
 const blob=new Blob(parts,{type:'application/x-ndjson'});
 if(blob.size>V2_FILE_LIMIT)throw Error('Arquivo excede 2 GB; use uma exportação administrativa no servidor. O checkpoint foi preservado.');
 if(lastDownloadURL)URL.revokeObjectURL(lastDownloadURL);lastDownloadURL=URL.createObjectURL(blob);
 const holder=$('downloadHolder');holder.replaceChildren();const a=document.createElement('a');
 a.download='SOS_VALENCIO_BACKUP_'+state.header.startedAt.replace(/[:.]/g,'-')+'.sosbackup';a.href=lastDownloadURL;a.textContent='⬇ BAIXAR BACKUP GERADO';
 a.style.cssText='display:block;margin-top:14px;padding:13px;text-align:center;background:#17566f;border:1px solid #28c69e;color:white;border-radius:10px;font-weight:800;text-decoration:none';holder.appendChild(a);a.click();
 progress(100,'Backup preparado: '+numFmt(state.count)+' documentos • '+state.blocks+' blocos • '+numFmt(blob.size)+' bytes.');
 report({resultado:'Backup completo do inventário preparado; confirme o download no aparelho.',versao:2,documentos:state.count,blocos:state.blocks,colecoes:state.counts,inicio:state.header.startedAt,fim:state.finished,
  observacoes:['Exportação por páginas durante o intervalo informado; não é uma fotografia atômica do banco.','Não inclui arquivos externos/Storage nem contas Authentication.','Cópia local criptografada mantida para baixar novamente; a senha não é armazenada.']});
}
async function exportV2(resume=false){
 const password=$('senhaExportar').value,password2=$('senhaExportar2').value;
 if(!/^[0-9]{4}$/.test(password)||password!==password2)throw Error('Informe os 4 dígitos e confirme a mesma senha. Para retomar, use a senha do backup iniciado.');
 pauseRequested=false;let state=await localGet('runs',runKey()),key;
 if(resume){
  if(!state)throw Error('Não existe backup local para retomar neste navegador.');
  key=await derive(password,fromB64(state.header.salt),KDF_ITERATIONS);
  const check=await openV2(state.verifier,key,state.header);if(check.runId!==state.id)throw Error('Checkpoint inválido.');
 }else{
  if(state&&!confirm('Existe um backup local '+(state.finished?'concluído':'incompleto')+'. Iniciar outro substitui esse checkpoint. Continuar?'))return;
  if(state)await localDiscard(runKey());
  const salt=crypto.getRandomValues(new Uint8Array(16));key=await derive(password,salt,KDF_ITERATIONS);
  const id=crypto.randomUUID();const header={format:'SOS_VALENCIO_BACKUP_ENCRYPTED',version:2,scope:'TENANT_ONLY',projectId:db.app.options.projectId,tenantId:tenant,
   alg:'AES-256-GCM',kdf:'PBKDF2-SHA256',iterations:KDF_ITERATIONS,salt:toB64(salt),runId:id,startedAt:new Date().toISOString(),compression:window.CompressionStream?'gzip':'none'};
  const queue=[...COLLECTIONS.map(c=>queryTask(c,true)),{path:'oficinas/'+tenant,document:true}].reverse();
  state={id,header,queue,count:0,counts:{},blocks:0,chain:'',reads:0};
  state.verifier=await sealV2({runId:id},key,header,'manifest',-1);await localCommit(runKey(),state,[]);
 }
 if(state.header.projectId!==db.app.options.projectId||state.header.tenantId!==tenant)throw Error('Checkpoint de outra oficina/projeto.');
 $('btnPausar').disabled=false;
 while(state.queue.length){
  if(pauseRequested){setStatus('Backup pausado com '+numFmt(state.count)+' documentos confirmados. Use Retomar neste navegador.');return;}
  const taken=state.queue.slice(-2),rest=state.queue.slice(0,-taken.length);
  progress(Math.min(94,Math.floor(94*state.count/(state.count+state.queue.length*V2_PAGE+1))),
   'Lendo '+taken.map(t=>t.path).join(' · ')+' • '+numFmt(state.count)+' documentos • '+state.blocks+' blocos confirmados');
  const results=await Promise.all(taken.map(readTask));
  const next={...state,queue:rest,counts:{...state.counts},reads:state.reads+taken.length},frames=[];let pending=[],size=2;
  async function flush(){if(!pending.length)return;const frame=await sealV2({documents:pending},key,state.header,'block',next.blocks);frames.push(frame);next.blocks++;next.chain=await hash(new TextEncoder().encode(next.chain+frame.sha256));pending=[];size=2;}
  for(const result of results){
   next.queue.push(...result.next);
   for(const d of result.docs){
    const value=d.data();ensureTenant(d.ref.path,value);const item={path:d.ref.path,data:encode(value)},length=new TextEncoder().encode(JSON.stringify(item)).length;
    if(length>3*1024*1024)throw Error('Documento grande demais para um bloco: '+d.ref.path);
    if(pending.length&&(size+length>V2_BLOCK||pending.length>=50))await flush();pending.push(item);size+=length;
    next.count++;if(next.count>V2_DOC_LIMIT)throw Error('Limite de um milhão de registros atingido. Checkpoint mantido.');
    const group=d.ref.path.split('/').filter((_,i)=>i%2===0).join('/');next.counts[group]=(next.counts[group]||0)+1;
   }
  }
  await flush();await localCommit(runKey(),next,frames);state=next;await sleep();
 }
 if(!state.count)throw Error('Nenhum documento encontrado; backup não concluído.');
 if(!state.finished){
  state={...state,finished:new Date().toISOString()};
  state.manifest=await sealV2({count:state.count,blocks:state.blocks,chain:state.chain,counts:state.counts,inventory:[...COLLECTIONS,'oficinas'],subcollections:SUBCOLLECTIONS,
   startedAt:state.header.startedAt,finishedAt:state.finished},key,state.header,'manifest',state.blocks);
  await localCommit(runKey(),state,[]);
 }
 await downloadV2(state,key);$('senhaExportar').value='';$('senhaExportar2').value='';
}
async function* fileLines(file){
 const reader=file.stream().getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let pending='';
 try{
  while(true){const r=await reader.read();pending+=r.done?decoder.decode():decoder.decode(r.value,{stream:true});
   let at;while((at=pending.indexOf('\n'))>=0){const line=pending.slice(0,at);pending=pending.slice(at+1);if(line.length>8*1024*1024)throw Error('Bloco de arquivo excessivamente grande.');if(line.trim())yield line;}
   if(pending.length>8*1024*1024)throw Error('Linha de backup excessivamente grande.');if(r.done)break;
  }
  if(pending.trim())yield pending;
 }finally{await reader.cancel().catch(()=>{});}
}
function validateHeaderV2(h){
 if(h?.format!=='SOS_VALENCIO_BACKUP_ENCRYPTED'||h.version!==2||h.scope!=='TENANT_ONLY'||h.alg!=='AES-256-GCM'||h.kdf!=='PBKDF2-SHA256'||h.iterations!==KDF_ITERATIONS||!['gzip','none'].includes(h.compression)||typeof h.runId!=='string'||fromB64(h.salt).length!==16)throw Error('Cabeçalho V2 inválido.');
 if(h.tenantId!==tenant||h.projectId!==db.app.options.projectId)throw Error('Backup de outra oficina/projeto.');
}
async function importBlock(n){
 if(!importV2)throw Error('Arquivo V2 não está aberto. Analise novamente.');
 if(importV2.cache.has(n))return importV2.cache.get(n);
 const task=(async()=>{const frame=await localGet('blocks',importV2.id+':'+String(n).padStart(9,'0'));if(!frame)throw Error('Bloco importado ausente.');return (await openV2(frame,importV2.key,importV2.header)).documents;})();
 importV2.cache.set(n,task);while(importV2.cache.size>6)importV2.cache.delete(importV2.cache.keys().next().value);return task;
}
async function previewV2(file,password){
 if(file.size>V2_FILE_LIMIT)throw Error('Arquivo acima de 2 GB. Nenhum dado alterado.');
 await localDiscard('import:'+runKey());
 let header,key,seq=0,count=0,chain='',manifest=null;const paths=new Set(),counts={};
 const id='import-'+crypto.randomUUID();
 for await(const line of fileLines(file)){
  const frame=JSON.parse(line);
  if(!header){header=frame;validateHeaderV2(header);key=await derive(password,fromB64(header.salt),KDF_ITERATIONS);continue;}
  if(manifest)throw Error('Há dados extras após o manifesto.');
  if(frame.n!==seq)throw Error('Sequência incompleta ou duplicada no backup.');
  const payload=await openV2(frame,key,header);
  if(frame.type==='manifest'){manifest=payload;continue;}
  if(!Array.isArray(payload.documents)||!payload.documents.length||payload.documents.length>50)throw Error('Contagem do bloco inválida.');
  for(const item of payload.documents){
   if(!item||paths.has(item.path))throw Error('Documento duplicado no backup.');ensureTenant(item.path,decode(item.data));paths.add(item.path);count++;
   if(count>V2_DOC_LIMIT)throw Error('Limite de registros excedido.');const group=item.path.split('/').filter((_,i)=>i%2===0).join('/');counts[group]=(counts[group]||0)+1;
  }
  chain=await hash(new TextEncoder().encode(chain+frame.sha256));
  await localCommit('import:'+runKey(),{id,blocks:seq+1},[frame]);seq++;
  progress(2,'Autenticando arquivo • '+numFmt(count)+' documentos em '+seq+' blocos');await sleep();
 }
 if(!manifest||manifest.blocks!==seq||manifest.count!==count||manifest.chain!==chain||fingerprint(manifest.counts)!==fingerprint(counts))throw Error('Manifesto, contagem ou integridade não conferem. Nenhum dado alterado.');
 if(fingerprint(manifest.inventory)!==fingerprint([...COLLECTIONS,'oficinas'])||fingerprint(manifest.subcollections)!==fingerprint(SUBCOLLECTIONS))throw Error('Inventário incompatível.');
 importV2={id,header,key,cache:new Map()};
 source={version:2,tenantId:tenant,projectId:header.projectId,createdAt:manifest.startedAt,finishedAt:manifest.finishedAt,count,paths};
 const summary=counters(),byColl=new Map(),writeOps=[];let done=0;
 for(let n=0;n<seq;n++){
  const documents=await importBlock(n);
  const results=await workers(documents,4,async(item,index)=>{
   ensureTenant(item.path,decode(item.data));
   if(isProtected(item.path))return {path:item.path,estado:'protegido'};
   const snap=await readServer(db.doc(item.path),item.path);
   if(snap.exists){
    if(item.path.split('/').length===2&&snap.data()?.tenantId!==tenant)throw Error('Documento de outra oficina.');
    if(isImmutable(item.path))return {path:item.path,estado:'protegido'};
    const before=await hashData(encode(snap.data())),after=await hashData(item.data);
    return {path:item.path,estado:before===after?'igual':'atualizar',before,hashBefore:true,block:n,index};
   }
   if(item.path.split('/').length===4){
    const parentPath=item.path.split('/').slice(0,2).join('/'),parent=await readServer(db.doc(parentPath),parentPath);
    if(parent.exists&&parent.data()?.tenantId!==tenant)throw Error('Documento pai de outra oficina.');
    if(!parent.exists&&!paths.has(parentPath))throw Error('Documento pai ausente da oficina e do backup.');
   }
   return {path:item.path,estado:'novo',before:null,hashBefore:true,block:n,index};
  });
  const failed=results.filter(x=>x.error);if(failed.length)throw Error('Prévia interrompida: '+failed.slice(0,3).map(x=>x.path+' — '+x.error).join(' | '));
  for(const r of results){summary[r.estado]++;const col=r.path.split('/').filter((_,i)=>i%2===0).join('/');if(!byColl.has(col))byColl.set(col,counters());byColl.get(col)[r.estado]++;if(['novo','atualizar'].includes(r.estado))writeOps.push(r);}
  done+=documents.length;progress(4+90*done/count,'Conferindo '+numFmt(done)+' / '+numFmt(count)+' documentos');await sleep();
 }
 plan={writeOps,alteracoes:summary.novo+summary.atualizar,summary,byColl,previewAt:new Date().toISOString()};showPreview();
}
function showPreview(){
 const {summary,byColl,alteracoes:changes}=plan;
 $('origem').textContent='Oficina: '+tenant+' · Firebase: '+source.projectId+' · Criado em: '+source.createdAt+' · '+numFmt(source.count)+' documentos'+(source.finishedAt?' · término: '+source.finishedAt:'');
 $('resumo').replaceChildren();for(const [key,label] of [['novo','Criar'],['atualizar','Atualizar'],['igual','Sem mudanças'],['protegido','Protegidos']]){const box=document.createElement('div');box.className='stat';const strong=document.createElement('strong');strong.textContent=numFmt(summary[key]);const sub=document.createElement('span');sub.textContent=label;box.append(strong,sub);$('resumo').appendChild(box);}
 $('comparacao').replaceChildren();for(const [name,c] of byColl){const tr=document.createElement('tr');for(const x of [name,c.novo,c.atualizar,c.igual,c.protegido]){const td=document.createElement('td');td.textContent=String(x);tr.appendChild(td);}$('comparacao').appendChild(tr);}
 $('avisos').textContent='Não haverá exclusões. '+summary.protegido+' documento(s) protegido(s) serão preservados. Registros alterados depois desta prévia serão bloqueados. Confira a origem e os totais antes de restaurar.';
 $('fraseConfirmar').textContent='RESTAURAR '+changes;$('confirmar').value='';$('previsao').hidden=false;$('btnRestaurar').disabled=true;
 progress(100,'Arquivo autenticado e prévia pronta. Nenhum documento foi gravado.');
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
 $('btnExportar').addEventListener('click',()=>operation(()=>exportV2(false)));
 $('btnRetomar').addEventListener('click',()=>operation(()=>exportV2(true)));
 $('btnPausar').addEventListener('click',()=>{pauseRequested=true;$('btnPausar').disabled=true;setStatus('Pausando após confirmar a página em andamento…');});
 $('btnAnalisar').addEventListener('click',()=>operation(preview));
 $('btnRestaurar').addEventListener('click',()=>operation(restore));
 $('confirmar').addEventListener('input',refreshRestoreButton);
 $('btnCancelar').addEventListener('click',()=>{plan=null;source=null;$('confirmar').value='';$('previsao').hidden=true;disable(false);setStatus('Importação cancelada. Nenhum documento foi alterado.');});
 $('arquivo').addEventListener('change',()=>{plan=null;source=null;importV2=null;$('previsao').hidden=true;disable(false);});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();