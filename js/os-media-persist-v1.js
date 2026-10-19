/* S.O.S. VALÊNCIO — persistência independente de fotos/vídeos na OS.
 * Usada somente nos botões ENVIAR FILA de JARVIS e EQUIPE.
 * Nunca salva formulário, muda status, substitui orçamento nem exclui anexos.
 */
(function(W){
'use strict';
const urlOf=m=>typeof m==='string'?m:(m?.url||m?.secure_url||'');
function uniq(lista){
 const map=new Map();
 for(const m of (Array.isArray(lista)?lista:[])){
  const url=String(urlOf(m)||'').trim();
  if(!url)continue;
  if(!map.has(url))map.set(url,m);
 }
 return [...map.values()];
}
const dataAgora=()=>new Date().toISOString();
async function garantirOS({db,tid,id,clienteId,veiculoId,campos,ator}){
 if(id)return {id,criada:false};
 if(!tid||!clienteId||!veiculoId)throw Error('Selecione cliente e veículo para criar/vincular a O.S. antes de enviar arquivos.');
 const ref=db.collection('ordens_servico').doc();
 const now=dataAgora();
 const dados={
  tenantId:tid,
  clienteId,veiculoId,
  tipoVeiculo:campos?.tipoVeiculo||'carro',
  status:'Aguardando',
  data:campos?.data||now.slice(0,10),
  km:campos?.km||'',
  media:[],
  ...(campos?.mecId?{mecId:String(campos.mecId),mecNome:String(campos.mecNome||ator||''),mecIds:[String(campos.mecId)]}:{}),
  timeline:[{
   dt:now,user:ator||'Equipe',tipo:'os_criada_para_evidencias',
   acao:'O.S. registrada automaticamente ao enviar fotos/vídeos. Demais dados podem ser salvos depois.'
  }],
  createdAt:now,updatedAt:now
 };
 await ref.set(dados);
 return {id:ref.id,criada:true,rascunho:{id:ref.id,...dados}};
}
async function gravar({db,tid,osId,itens,ator}){
 if(!db||!tid||!osId)throw Error('O.S. não identificada para salvar os anexos.');
 const novos=uniq(itens);
 if(novos.some(item=>!/^https:\/\//i.test(String(urlOf(item)))))throw Error('O upload não retornou uma URL HTTPS válida.');
 if(!novos.length)return {salvos:0,media:[],eventos:0};
 const ref=db.collection('ordens_servico').doc(osId);
 return db.runTransaction(async tx=>{
  const snap=await tx.get(ref);
  if(!snap.exists)throw Error('O.S. não existe no Firestore. Os arquivos continuam na fila.');
  const os=snap.data()||{};
  if(String(os.tenantId||'')!==String(tid))throw Error('O.S. de outra oficina. Gravação bloqueada.');
  const media=Array.isArray(os.media)?os.media:Array.isArray(os.fotos)?os.fotos:[];
  const urls=new Set(media.map(urlOf).filter(Boolean));
  const agora=dataAgora();
  const adicionados=[];
  for(const item of novos){
   const url=urlOf(item);
   if(urls.has(url))continue;
   urls.add(url);
   adicionados.push({
    ...(typeof item==='string'?{url:item,type:'image'}:item),
    importedAt:item?.importedAt||agora,
    importedPor:item?.importedPor||ator||'Equipe'
   });
  }
  if(!adicionados.length)return {salvos:0,media,eventos:0};
  const eventos=adicionados.map(m=>{
   const video=String(m.type||'').toLowerCase().startsWith('video');
   return {
    dt:agora,user:ator||'Equipe',tipo:'evidencia_adicionada',
    acao:'Anexou '+(video?'vídeo':'imagem')+': '+String(m.name||urlOf(m).split('/').pop().split('?')[0]||'arquivo')+
      '. Enviado: '+String(m.uploadedAt||'não registrado')+'. Gravado na O.S.: '+agora,
    midiaUrl:urlOf(m),midiaTipo:video?'video':'imagem',enviadoEm:m.uploadedAt||null,importadoEm:agora
   };
  });
  // Não altera status/updatedAt/preço/cliente/outros campos; evita invalidar edições simultâneas.
  tx.update(ref,{
   media:[...media,...adicionados],
   timeline:W.firebase.firestore.FieldValue.arrayUnion(...eventos)
  });
  return {salvos:adicionados.length,media:[...media,...adicionados],eventos:eventos.length};
 });
}
W.sosMediaOsPersist=Object.freeze({garantirOS,gravar,uniq,urlOf});
})(window);
