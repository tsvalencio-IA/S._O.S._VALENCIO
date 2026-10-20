/* Execução e concorrência da O.S. Compartilhado por Equipe e JARVIS.
 * Nenhuma gravação ao renderizar; conflitos são avisos internos persistentes.
 */
(function (W, D) {
  'use strict';
  const U = () => W.JOS || W.JarvisOSUtils;
  const clone = v => Array.isArray(v) ? v.map(clone) : v && typeof v === 'object'
    ? (typeof v.toDate==='function' || typeof v.isEqual==='function' ? v : v instanceof Date ? new Date(v.getTime()) : Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clone(x)]))) : v;
  const stable = v => typeof v?.toJSON==='function' ? stable(v.toJSON()) : Array.isArray(v) ? v.map(stable) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
  const equal = (a, b) => JSON.stringify(stable(a ?? null)) === JSON.stringify(stable(b ?? null));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const byId = id => D.getElementById(id);
  const manager = s => ['admin','oficina_admin','superadmin','gestor','gerente','dono'].includes(String(s?.role || '').toLowerCase());
  const actor = s => {
    let authId='';try{authId=W.firebase?.auth?.()?.currentUser?.uid||'';}catch(_){}
    // O login administrativo pode não ter fid; seu identificador é a conta
    // administrativa/oficina. O UID técnico do Firebase permanece separado.
    const accountId=manager(s)?(s.adminEmail || s.tid || ''):'';
    return {user:String(s.nome || '').trim(),usuarioId:String(s.fid || s.uid || s.userId || s.usuarioId || accountId || authId || ''),usuarioAuthId:authId||null,perfil:s.role || 'equipe'};
  };
  const labels = {pendente:'Pendente',em_execucao:'Em execução',executado:'Executado / aplicado',trocada:'Trocada / aplicada',executado_obs:'Executado com observação',nao_executado:'Não executado',nao_encontrada:'Peça não encontrada',nao_trocada:'Peça não aplicada',cancelado:'Cancelado'};
  const normalize = s => ({executado_com_observacao:'executado_obs',concluido:'executado',finalizado:'executado',feito:'executado',realizado:'executado'}[s] || s || 'pendente');
  const stateOf = e => ({status:normalize(e?.status),obs:String(e?.obs || '')});
  const identity = i => i ? [i.tipo, String(i.desc || '').trim(), String(i.codigo || '').trim(), i.estoqueId || '', Number(i.qtd || 1)] : null;
  const items = os => new Map((U()?.buildBudgetItems(os) || []).map(i => [i.key,i]));
  const approved = os => os?.aprovacaoAtiva !== false && U()?.hasApproval(os) ? U().getApprovedKeys(os) : new Set();
  let active = null, unsub = null, unsubConflicts = null;
  const busy = new Set();
  const fieldLabels = {desc:'Descrição',diagnostico:'Diagnóstico',km:'Quilometragem',prisma:'Prisma',numeroPrisma:'Prisma',chkObs:'Observação da inspeção',status:'Status do veículo',pecas:'Peças',servicos:'Serviços',aprovacao:'Aprovação',itensAprovados:'Itens aprovados',total:'Total',totalAprovado:'Total aprovado',media:'Evidências'};
  function event(s, type, action, extra) {
    return {dt:new Date().toISOString(),...actor(s),tipo:type,interno:true,visivelCliente:false,acao:action,...extra};
  }
  function merge(base, current, proposed, ignored = []) {
    const patch = {}, conflicts = [], skip = new Set(['id','tenantId','updatedAt','timeline','observacoesEquipe',...ignored]);
    for (const [field, value] of Object.entries(proposed)) {
      if (skip.has(field) || equal(value,base[field]) || equal(value,current[field])) continue;
      if (!equal(base[field],current[field])) conflicts.push({campo:field,rotulo:fieldLabels[field] || field,base:clone(base[field] ?? null),atual:clone(current[field] ?? null),proposta:clone(value)});
      else patch[field] = value;
    }
    return {patch,conflicts};
  }
  function notice(tx, ref, ctx, osId, conflicts, kind) {
    const a = actor(ctx.session);
    const value = {tenantId:ctx.session.tid,tipo:'conflito_os',estado:'pendente',osId,origem:ctx.kind || 'jarvis',tipoConflito:kind,
      conflitos:conflicts,de:a.usuarioId || 'admin',para:'admin',sender:'equipe',senderId:a.usuarioId,senderName:a.user,
      autorNome:a.user,autorId:a.usuarioId,lidaAdmin:false,lidaEquipe:true,ts:Date.now(),
      msg:'Conflito na O.S. '+osId.slice(-6)+': '+a.user+' propôs uma alteração em '+conflicts.map(c=>c.rotulo).join(', ')+'. A proposta aguarda conferência no JARVIS.'};
    // Limite conservador do documento: não truncar silenciosamente propostas.
    if (new TextEncoder().encode(JSON.stringify(value)).length > 700000) throw Error('Proposta muito grande para o aviso. O rascunho permanece na ficha; confira os itens com o gestor antes de salvar.');
    tx.set(ref,value);
  }
  function conflictError() {
    const e = Error('Há alterações simultâneas no mesmo campo. A proposta foi enviada ao JARVIS para conferência; o rascunho foi mantido.');
    e.code = 'os-conflict'; return e;
  }
  function executionEvent(session,key,item,before,after,who=actor(session),origin='') {
    return event(session,'execucao_item_os',(item.tipo === 'peca' ? 'Peça ' : 'Serviço ')+item.desc+': '+
      labels[before.status]+' → '+labels[after.status]+(before.obs !== after.obs ? ' | Observação: "'+(before.obs || '(vazia)')+'" → "'+(after.obs || '(vazia)')+'"' : '')+' — usuário: '+who.user,
      {...who,usuarioNome:who.user,origem:origin,itemKey:key,itemTipo:item.tipo,itemDescricao:item.desc,statusAnterior:before.status,statusNovo:after.status,statusAlterado:before.status!==after.status,observacaoAnterior:before.obs,observacaoNova:after.obs,aprovadoFinanceiramente:true});
  }
  function executionRecord(previous,key,item,before,after,who,entry) {
    const changed=before.status!==after.status;
    return {...previous,...after,key,tipo:item.tipo,itemDescricao:item.desc,itemIdentidade:identity(item),
      atualizadoPor:who.user,atualizadoPorId:who.usuarioId,atualizadoPorAuthId:who.usuarioAuthId,
      atualizadoPorTipo:who.perfil,atualizadoEm:entry.dt,updatedAt:entry.dt,
      ...(changed?{statusAlteradoPor:who.user,statusAlteradoPorId:who.usuarioId,statusAlteradoPorAuthId:who.usuarioAuthId,
        statusAlteradoPorPerfil:who.perfil,statusAlteradoEm:entry.dt,statusAlteradoDe:before.status,
        statusAlteradoPara:after.status,statusAlteradoOrigem:entry.origem}:{})};
  }
  function executionDate(value) {
    if(!value)return null;
    const date=typeof value?.toDate==='function'?value.toDate():value?.seconds!=null?new Date(value.seconds*1000):new Date(value);
    return Number.isNaN(date.getTime())?null:date;
  }
  function executionStatusAudit(os,key,record=os?.execucaoItens?.[key] || {}) {
    const current=normalize(record.status);
    const events=(Array.isArray(os?.timeline)?os.timeline:[]).map((e,index)=>({e,index}))
      .filter(({e})=>['execucao_item_os','execucao_item_aprovado'].includes(String(e?.tipo || e?.tipoEvento || '')) &&
        String(e.itemKey || '')===String(key) && e.statusAnterior!=null && e.statusNovo!=null && normalize(e.statusAnterior)!==normalize(e.statusNovo))
      .sort((a,b)=>(executionDate(a.e.dt)?.getTime() || 0)-(executionDate(b.e.dt)?.getTime() || 0) || a.index-b.index);
    const last=events.at(-1)?.e;
    const direct=(record.statusAlteradoPor || record.statusAlteradoPorId) && normalize(record.statusAlteradoPara || record.status)===current
      ? {nome:record.statusAlteradoPor || '',id:record.statusAlteradoPorId || '',dt:record.statusAlteradoEm || '',
        anterior:record.statusAlteradoDe,novo:record.statusAlteradoPara || record.status,origem:record.statusAlteradoOrigem || '',fonte:'registro'}:null;
    const directTime=executionDate(direct?.dt)?.getTime() || 0,lastTime=executionDate(last?.dt)?.getTime() || 0;
    if(direct && (!last || (directTime && directTime>=lastTime)))return direct;
    // Só eventos vinculados ao item e ao seu estado atual podem provar a autoria.
    // Logs genéricos e o mecânico responsável não identificam quem mudou o status.
    if(last && normalize(last.statusNovo)===current && (last.user || last.usuarioNome || last.usuarioId))return {
      nome:last.user || last.usuarioNome || '',id:last.usuarioId || last.userId || '',dt:last.dt || '',
      anterior:last.statusAnterior,novo:last.statusNovo,origem:last.origem || '',fonte:'timeline'};
    return null;
  }
  function executionAuthorHTML(os,key,record=os?.execucaoItens?.[key] || {}) {
    const audit=executionStatusAudit(os,key,record);
    const dateText=value=>{const date=executionDate(value);return date?date.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'data não registrada';};
    const name=(stored,id)=>stored || (W.J?.equipe || []).find(p=>String(p.id)===String(id))?.nome || (id?'Usuário '+id:'usuário não identificado');
    if(audit){
      const from=audit.anterior==null?'estado anterior não registrado':(labels[normalize(audit.anterior)] || audit.anterior);
      return '<br><small class="exec-status-autor" style="color:var(--muted2);">Status alterado por: <b>'+esc(name(audit.nome,audit.id))+'</b> · '+esc(dateText(audit.dt))+
        '<br>'+esc(from)+' → '+esc(labels[normalize(audit.novo)] || audit.novo)+'</small>';
    }
    if(!Object.keys(record).length)return '';
    const lastName=record.atualizadoPor || record.atualizadoPorNome || record.usuario || record.registradoPor || '';
    const lastId=record.atualizadoPorId || record.registradoPorId || '';
    return '<br><small class="exec-status-autor" style="color:var(--muted2);">Autoria deste status não registrada.'+
      (lastName || lastId?'<br>Última atualização registrada: '+esc(name(lastName,lastId))+' · '+esc(dateText(record.atualizadoEm || record.updatedAt || record.registradoEm)):'')+'</small>';
  }
  function validateState(value) {
    if (!Object.hasOwn(labels,value.status)) throw Error('Status de execução desconhecido.');
    if (['executado_obs','nao_executado','nao_encontrada','nao_trocada','cancelado'].includes(value.status) && !value.obs.trim()) throw Error('Informe a observação para a exceção de execução.');
  }
  async function saveExecution(ctx) {
    const {db,session,osId,rows} = ctx;
    if (!osId || !session.tid || !session.nome) throw Error('O.S. ou sessão não identificada.');
    const who=actor(session);
    if(!who.user || !who.usuarioId)throw Error('Usuário não identificado. Entre novamente antes de registrar a execução.');
    if (busy.has(osId)) return;
    const base = ctx.base || active?.base || {};
    const baseItems = items(base), drafts = new Map();
    for (const row of rows) {
      const key = row.dataset.key;
      const proposed = {status:normalize(row.querySelector('.exec-status')?.value),obs:String(row.querySelector('.exec-obs')?.value || '').trim()};
      const before = {status:normalize(row.dataset.statusInicial ?? base.execucaoItens?.[key]?.status),obs:String(row.dataset.obsInicial ?? base.execucaoItens?.[key]?.obs ?? '')};
      const control=row.querySelector('.exec-mec');
      const hasRespControl=manager(session)&&control&&!control.disabled;
      if(hasRespControl){before.mecId=String(row.dataset.mecId || base.execucaoItens?.[key]?.mecId || baseItems.get(key)?.mecId || base.mecId || '');proposed.mecId=String(control.value || '');}
      if (equal(before,proposed)) continue;
      validateState(proposed);
      if (drafts.has(key) && !equal(drafts.get(key).proposed,proposed)) throw Error('Há duas edições diferentes do mesmo item. Confira a ficha.');
      drafts.set(key,{key,before,proposed,hasRespControl,identity:identity(baseItems.get(key))});
    }
    if (!drafts.size) { W.toast?.('Nenhuma alteração nova para salvar.','warn'); return; }
    busy.add(osId);
    try {
      const ref = db.collection('ordens_servico').doc(osId), alert = db.collection('chat_equipe').doc();
      const result = await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw Error('O.S. não encontrada.');
        const current = snap.data();
        if (current.tenantId !== session.tid || (!manager(session) && !ctx.linked?.(current))) throw Error('Usuário sem vínculo autorizado com esta O.S.');
        const keys = approved(current), approvalItems=new Map((current.aprovacao?.itens||[]).filter(i=>i&&typeof i==='object').map(i=>[i.key,i])), currentItems = items(current), exec = {...current.execucaoItens}, events = [], conflicts = [];
        for (const d of drafts.values()) {
          const item = currentItems.get(d.key), before = stateOf(exec[d.key]);
          if(d.hasRespControl)before.mecId=String(exec[d.key]?.mecId || exec[d.key]?.responsavelId || item?.mecId || current.mecId || '');
          const authorization=approvalItems.get(d.key);
          const approvalMatches=!authorization || (!authorization.desc || String(authorization.desc).trim()===String(item?.desc||'').trim()) && (!authorization.codigo || String(authorization.codigo).trim()===String(item?.codigo||'').trim()) && (authorization.qtd==null || Number(authorization.qtd)===Number(item?.qtd));
          if (!keys.has(d.key) || !item || !approvalMatches || !equal(d.identity,identity(item))) {
            conflicts.push({campo:d.key,rotulo:baseItems.get(d.key)?.desc || d.key,base:d.before,atual:before,proposta:d.proposed,identidade:d.identity,motivo:'Item ou autorização alterados. Conferir a ficha.'}); continue;
          }
          const m = merge(d.before,before,d.proposed);
          if (m.conflicts.length) { conflicts.push({campo:d.key,rotulo:item.desc,base:d.before,atual:before,proposta:d.proposed,identidade:d.identity}); continue; }
          const after = {...before,...m.patch};
          if (equal(before,after)) continue;
          validateState(after);
          const resp=d.hasRespControl?{mecId:after.mecId,responsavelId:after.mecId,mecNome:ctx.resolveName?.(after.mecId)||((session.equipe||[]).find(m=>m.id===after.mecId)?.nome)||exec[d.key]?.mecNome||'',responsavelNome:ctx.resolveName?.(after.mecId)||((session.equipe||[]).find(m=>m.id===after.mecId)?.nome)||exec[d.key]?.responsavelNome||''}:{};
          const execution=executionEvent(session,d.key,item,before,after,who,ctx.kind || '');
          exec[d.key] = executionRecord({...exec[d.key],...resp},d.key,item,before,after,who,execution);
          if(d.hasRespControl&&before.mecId!==after.mecId){execution.responsavelAnteriorId=before.mecId;execution.responsavelNovoId=after.mecId;execution.acao+=' | Responsável: '+(ctx.resolveName?.(before.mecId)||before.mecId||'(nenhum)')+' → '+(resp.mecNome||after.mecId||'(nenhum)');}
          events.push(execution);
        }
        if (conflicts.length) { notice(tx,alert,ctx,osId,conflicts,'execucao'); return {conflict:true}; }
        if (events.length) tx.update(ref,{execucaoItens:exec,timeline:firebase.firestore.FieldValue.arrayUnion(...events),updatedAt:new Date().toISOString()});
        return {os:{id:osId,...current,execucaoItens:exec,timeline:[...(current.timeline || []),...events]},events};
      });
      if (result.conflict) throw conflictError();
      // Atualiza o baseline só depois da confirmação da transação.
      for (const row of rows) { const e=stateOf(result.os.execucaoItens?.[row.dataset.key]); row.dataset.statusInicial=e.status; row.dataset.obsInicial=e.obs; }
      if(active?.id===osId)active.executionBase=clone(result.os);
      ctx.confirm?.(result.os);
      sync(result.os);
      W.toast?.('✓ '+result.events.length+' alteração(ões) de execução confirmada(s).','ok');
      return result.os;
    } finally { busy.delete(osId); }
  }
  // Mantém as operações financeiras e a O.S. no mesmo commit, validando a versão
  // lida dentro da transação. O callback nunca dispara mensagens ou efeitos de UI.
  function batch(db,osRef,base,ctx) {
    const ops = [], alert = db.collection('chat_equipe').doc();
    return {
      set:(ref,data,options) => ops.push({method:'set',ref,data,options}),
      update:(ref,data) => ops.push({method:'update',ref,data}),
      async commit() {
        const result = await db.runTransaction(async tx => {
          const snapshot = await tx.get(osRef), current = snapshot.exists ? snapshot.data() : {};
          if (base?.id && !snapshot.exists) throw Error('O.S. removida por outro usuário.');
          if (snapshot.exists && current.tenantId !== ctx.session.tid) throw Error('Oficina não autorizada.');
          const op = ops.find(x=>x.ref.path === osRef.path);
          if (!op) throw Error('Gravação sem O.S.');
          if (!snapshot.exists) { for(const x of ops) x.method==='set' ? tx.set(x.ref,x.data,x.options || {}) : tx.update(x.ref,x.data); return {os:{id:osRef.id,...op.data}}; }
          const ignored = equal(op.data.execucaoItens,base.execucaoItens) ? ['execucaoItens'] : [];
          const m = merge(base,current,op.data,ignored);
          if (m.conflicts.length) { notice(tx,alert,ctx,osRef.id,m.conflicts,'ficha'); return {conflict:true}; }
          if(ctx.prepare)Object.assign(m.patch,ctx.prepare({...current,...m.patch}));
          const merged = {...m.patch,updatedAt:new Date().toISOString()};
          const priorEvents = new Set((base.timeline || []).map(e=>JSON.stringify(e)));
          const additions = (op.data.timeline || []).filter(e=>!priorEvents.has(JSON.stringify(e)));
          if (additions.length) merged.timeline = firebase.firestore.FieldValue.arrayUnion(...additions);
          if (!equal(op.data.observacoesEquipe,base.observacoesEquipe) && Array.isArray(op.data.observacoesEquipe)) {
            const old=new Set((base.observacoesEquipe || []).map(e=>JSON.stringify(e)));
            const added=op.data.observacoesEquipe.filter(e=>!old.has(JSON.stringify(e)));
            if (added.length) merged.observacoesEquipe=firebase.firestore.FieldValue.arrayUnion(...added);
          }
          for(const x of ops) {
            if (x===op) tx.update(osRef,merged);
            else if (x.method==='set') tx.set(x.ref,x.data,x.options || {});
            else tx.update(x.ref,x.data);
          }
          return {os:{id:osRef.id,...current,...m.patch,timeline:[...(current.timeline || []),...additions]}};
        });
        if (result.conflict) throw conflictError();
        const osWrite=ops.find(x=>x.ref.path===osRef.path);
        if(ctx.isSentinel && Object.values(osWrite?.data||{}).some(ctx.isSentinel)){
          try{const confirmed=await osRef.get({source:'server'});if(confirmed.exists)result.os={id:osRef.id,...confirmed.data()};}
          catch(e){W.toast?.('O.S. salva. Aguardando atualização da ficha pela conexão.','warn');}
        }
        ctx.confirm?.(result.os);
        if(active?.id===osRef.id) { active.base=clone(result.os); captureForm(); }
        return result;
      }
    };
  }
  const scalarFields = kind => kind==='equipe'
    ? {osDesc:'desc',osDiag:'diagnostico',osKm:'km',osPrisma:'prisma',chkObs:'chkObs'}
    : {osRelato:'relato',osDescricao:'desc',osDiagnostico:'diagnostico',osKm:'km',osPrisma:'prisma',chkObs:'chkObs',osStatus:'status'};
  function captureForm() {
    if (!active) return;
    active.form = {};
    for (const id of Object.keys(scalarFields(active.kind))) if(byId(id))active.form[id]=byId(id).value;
  }
  function open(ctx) {
    if(unsub)unsub(); unsub=null;
    if(unsubConflicts)unsubConflicts(); unsubConflicts=null;
    active = ctx?.os ? {...ctx,id:ctx.os.id,base:clone(ctx.os),form:{}} : null;
    if (!active) return;
    captureForm();
    if(ctx.kind==='jarvis')unsubConflicts=ctx.db.collection('chat_equipe').where('tenantId','==',ctx.session.tid).where('tipo','==','conflito_os').where('osId','==',ctx.os.id).where('estado','==','pendente').onSnapshot(s=>{
      active?.id===ctx.os.id && (active.conflicts=s.docs.map(d=>({id:d.id,...d.data()})));renderConflicts();
    },e=>W.toast?.('Não foi possível consultar as propostas pendentes: '+e.message,'warn'));
    if (ctx.kind==='jarvis') unsub=ctx.db.collection('ordens_servico').doc(ctx.os.id).onSnapshot(s=>{
      if(s.exists)sync({id:s.id,...s.data()});
    },e=>W.toast?.('A atualização da ficha foi interrompida: '+e.message,'warn'));
  }
  function sync(os) {
    if(!active || active.id!==os.id || String(byId('osId')?.value || '')!==os.id || os.tenantId!==active.session.tid)return;
    const old=active.base;
    for(const [id,field] of Object.entries(scalarFields(active.kind))) {
      const el=byId(id);
      if(el && el.value===active.form[id]) {
        el.value=String(active.displayValue?.(field,os[field]) ?? os[field] ?? ''); active.form[id]=el.value; old[field]=clone(os[field]);
      }
    }
    const selector=active.kind==='equipe' ? '#resumoAprovacaoEquipe .execucao-aprovado-row' : '#resumoAprovacaoOS .execucao-aprovado-row';
    const rows=[...D.querySelectorAll(selector)];
    const dirty=rows.some(r=>(r.querySelector('.exec-mec') && !r.querySelector('.exec-mec').disabled && String(r.querySelector('.exec-mec').value||'')!==String(r.dataset.mecId||'')) || !equal({status:normalize(r.querySelector('.exec-status')?.value),obs:String(r.querySelector('.exec-obs')?.value || '').trim()},
      {status:normalize(r.dataset.statusInicial),obs:r.dataset.obsInicial || ''}));
    if(!dirty && (!equal(os.execucaoItens,old.execucaoItens) || !equal(os.aprovacao,old.aprovacao) || !equal(os.pecas,old.pecas) || !equal(os.servicos,old.servicos))) {
      if(active.kind==='equipe')W.aplicarMarcadoresAprovacaoEquipe?.(os);else W.aplicarMarcadoresAprovacaoOS?.(os);
      old.execucaoItens=clone(os.execucaoItens);
      // A identidade usada para execução vem da lista efetivamente exibida.
      active.executionBase=clone(os);
    }
    const timelineId=active.kind==='equipe'?'tlData':'osTimelineData';
    if(byId(timelineId))byId(timelineId).value=JSON.stringify(os.timeline || []);
    if(active.kind==='equipe')W.renderTimeline?.();else W.renderTimelineOS?.();
    old.timeline=clone(os.timeline || []);
    if(active.kind==='jarvis')W.renderObservacoesEquipeJarvisOS?.(os);
    renderConflicts();
  }
  function receiveConflicts(list) { W._osConflitosPendentes=(list || []).filter(m=>m.tipo==='conflito_os' && m.estado==='pendente'); renderConflicts(); }
  function renderConflicts() {
    if(active?.kind!=='jarvis')return;
    const target=byId('osTimeline'); if(!target)return;
    byId('osConflitosPendentes')?.remove();
    const pending=(active.conflicts || W._osConflitosPendentes || []).filter(m=>m.osId===active.id && m.tenantId===active.session.tid);
    if(!pending.length)return;
    const box=D.createElement('div'); box.id='osConflitosPendentes'; box.className='os-auditoria-detalhe';
    box.innerHTML='<strong>Alterações aguardando conferência do gestor</strong>'+pending.map(m=>
      '<p>'+esc(m.senderName)+' · '+esc(new Date(m.ts).toLocaleString('pt-BR'))+' · '+esc(m.conflitos.map(c=>c.rotulo).join(', '))+
      ' <button type="button" class="btn-outline" data-conflict="'+esc(m.id)+'">CONFERIR</button></p>').join('');
    box.querySelectorAll('[data-conflict]').forEach(b=>b.addEventListener('click',()=>resolve(b.dataset.conflict).catch(e=>W.toast?.(e.message,'err'))));
    target.insertAdjacentElement('beforebegin',box);
  }
  async function resolve(id) {
    const ctx=active;
    if(!ctx || !manager(ctx.session))throw Error('Abra a O.S. no JARVIS com acesso de gestor.');
    const who=actor(ctx.session);
    if(!who.user || !who.usuarioId)throw Error('Usuário não identificado. Entre novamente antes de conferir a execução.');
    const ref=ctx.db.collection('chat_equipe').doc(id), snap=await ref.get({source:'server'}), message=snap.data();
    if(!message || message.tenantId!==ctx.session.tid || message.osId!==ctx.id || message.estado!=='pendente')throw Error('Aviso não está pendente nesta O.S.');
    const osRef=ctx.db.collection('ordens_servico').doc(ctx.id), osSnap=await osRef.get({source:'server'});
    if(!osSnap.exists || osSnap.data().tenantId!==ctx.session.tid)throw Error('O.S. não encontrada nesta oficina.');
    const shown=osSnap.data(), choices=[];
    const printable=v=>v && typeof v==='object' ? (Array.isArray(v)?v.map(x=>x?.desc || x?.nome || String(x)).join('; '):JSON.stringify(v)) : String(v ?? '(vazio)');
    const conflictState=(os,c)=>{const value=stateOf(os.execucaoItens?.[c.campo]);if(Object.hasOwn(c.proposta||{},'mecId'))value.mecId=String(os.execucaoItens?.[c.campo]?.mecId||os.execucaoItens?.[c.campo]?.responsavelId||items(os).get(c.campo)?.mecId||os.mecId||'');return value;};
    for(const c of message.conflitos) {
      const actual=message.tipoConflito==='execucao'?conflictState(shown,c):shown[c.campo];
      const editable=message.tipoConflito==='execucao' || ['desc','diagnostico','km','prisma','numeroPrisma','chkObs'].includes(c.campo);
      const answer=W.prompt(c.rotulo+'\nValor ao abrir: '+printable(c.base)+'\nAtual no banco: '+printable(actual)+'\nProposta de '+message.senderName+': '+printable(c.proposta)+
        '\n\nDigite M para manter o atual'+(editable?', P para aplicar a proposta, ou E para editar.':'. Para alterar este campo, cancele e edite a ficha normalmente; depois confira novamente o aviso.'),'M');
      if(answer==null)return;
      let value=actual, decision=answer.trim().toUpperCase();
      if(decision==='P' && editable)value=c.proposta;
      else if(decision==='E' && editable) {
        if(message.tipoConflito==='execucao') {
          const status=W.prompt('Status: '+Object.keys(labels).join(', '),c.proposta.status);if(status==null)return;
          const obs=W.prompt('Observação interna',c.proposta.obs);if(obs==null)return;
          value={...c.proposta,status:normalize(status.trim()),obs:obs.trim()};
        } else { value=W.prompt(c.rotulo,printable(c.proposta));if(value==null)return; }
      } else if(decision!=='M')throw Error('Escolha inválida. O aviso continua pendente.');
      if(message.tipoConflito==='execucao')validateState(value);
      choices.push({...c,atual:actual,valor:value,decisao:decision});
    }
    const reason=W.prompt('Motivo da decisão do gestor (obrigatório):','');if(reason==null)return;
    if(!reason.trim())throw Error('Informe o motivo da decisão.');
    await ctx.db.runTransaction(async tx=>{
      const [liveOS,liveNotice]=await Promise.all([tx.get(osRef),tx.get(ref)]);
      const current=liveOS.data();
      if(!liveOS.exists || current.tenantId!==ctx.session.tid || liveNotice.data()?.estado!=='pendente' || liveNotice.data()?.tenantId!==ctx.session.tid || !equal(liveNotice.data()?.conflitos,message.conflitos))throw Error('O.S. ou aviso alterados. Confira novamente.');
      const patch={}, events=[], exec={...current.execucaoItens};
      for(const c of choices) {
        const before=message.tipoConflito==='execucao'?conflictState(current,c):current[c.campo];
        if(!equal(before,c.atual))throw Error('O campo mudou durante a conferência. Confira novamente antes de decidir.');
        if(message.tipoConflito==='execucao' && !equal(before,c.valor)) {
          const item=items(current).get(c.campo);
          if(!approved(current).has(c.campo) || !equal(c.identidade,identity(item)))throw Error('Item ou autorização mudaram. Corrija na ficha antes de executar.');
          const responsible=Object.hasOwn(c.valor,'mecId')?{responsavelId:c.valor.mecId,mecNome:(ctx.session.equipe||[]).find(m=>m.id===c.valor.mecId)?.nome||'',responsavelNome:(ctx.session.equipe||[]).find(m=>m.id===c.valor.mecId)?.nome||''}:{};
          const execution=executionEvent(ctx.session,c.campo,item,before,c.valor,who,'jarvis');
          exec[c.campo]=executionRecord({...exec[c.campo],...responsible},c.campo,item,before,c.valor,who,execution);
          patch.execucaoItens=exec; events.push(execution);
        }else if(message.tipoConflito!=='execucao' && !equal(before,c.valor))patch[c.campo]=c.valor;
        events.push(event(ctx.session,'conflito_resolvido','Conferiu '+c.rotulo+': '+printable(before)+' → '+printable(c.valor)+'. Motivo: '+reason.trim(),
          {conflitoId:id,campo:c.campo,valorAnterior:before ?? null,valorNovo:c.valor ?? null,decisao:c.decisao,propostoPor:message.senderName,motivo:reason.trim()}));
      }
      tx.update(osRef,{...patch,timeline:firebase.firestore.FieldValue.arrayUnion(...events),updatedAt:new Date().toISOString()});
      tx.update(ref,{estado:'resolvido',resolvidoPor:ctx.session.nome,resolvidoEm:new Date().toISOString(),motivo:reason.trim(),lidaAdmin:true});
    });
    W.toast?.('Conferência salva e registrada na auditoria.','ok');
  }
  W.OSOperacional={clone,equal,merge,normalize,labels,stateOf,executionStatusAudit,executionAuthorHTML,saveExecution,batch,notice,conflictError,open,sync,receiveConflicts,resolve,
    base:id=>active?.id===id?clone(active.base):null,executionBase:id=>active?.id===id?clone(active.executionBase || active.base):null};
})(window,document);
