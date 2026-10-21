// Regressões da autoria visível por item. Banco e sessão isolados, sem produção.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {environment,database,fixture,row,context}=require('./os-operacional.test.cjs');
const root=path.resolve(__dirname,'..');
test('cada serviço e peça conserva autor, usuário, origem e instante da mudança de status',async()=>{
 const c=environment(),base=fixture(),db=database({'ordens_servico/os-test':base});
 await c.OSOperacional.saveExecution(context(c,db,base,[row('servico-0','executado'),row('peca-0','executado')]));
 const out=db.docs.get('ordens_servico/os-test');
 for(const key of ['servico-0','peca-0']){
  const r=out.execucaoItens[key],e=out.timeline.find(e=>e.itemKey===key);
  assert.equal(r.statusAlteradoPor,'Auxiliar de teste');assert.equal(r.statusAlteradoPorId,'auxiliar');assert.equal(r.statusAlteradoOrigem,'equipe');assert.equal(r.statusAlteradoDe,'pendente');assert.equal(r.statusAlteradoPara,'executado');assert.equal(r.statusAlteradoEm,e.dt);assert.equal(r.atualizadoEm,e.dt);assert.ok(Number.isFinite(Date.parse(r.statusAlteradoEm)));assert.equal(e.usuarioNome,'Auxiliar de teste');assert.match(e.acao,/usuário: Auxiliar de teste/);
  const html=c.OSOperacional.executionAuthorHTML(out,key,r);assert.match(html,/Status alterado por: <b>Auxiliar de teste<\/b>/);assert.match(html,/Pendente → Concluído/);
 }
 assert.equal(out.execucaoItens['peca-0'].mecId,'principal');
});
test('conclusão de peça e serviço independe do status da O.S. e da aprovação financeira',async()=>{
 const variantes=[
  o=>{},
  o=>{o.aprovacao.itens=[{key:'peca-1'}];o.aprovacao.totalAprovado=27;},
  o=>{o.aprovacaoAtiva=false;},
  o=>{o.aprovacao.itens=[];},
  o=>{delete o.aprovacao;delete o.aprovacaoAtiva;delete o.itensAprovados;},
  o=>{o.aprovacao.itens=[{key:'peca-0',desc:'Outra peça do orçamento antigo'}];}
 ];
 for(const statusOS of ['Triagem','Em orçamento','Aprovado','Andamento','Entregue']) for(const preparar of variantes){
  const c=environment(),base=fixture();base.status=statusOS;base.total=145;base.totalAprovado=27;preparar(base);
  const before=structuredClone(base),db=database({'ordens_servico/os-test':base});
  await c.OSOperacional.saveExecution(context(c,db,base,[row('servico-0','concluido'),row('peca-0','concluido')]));
  const out=db.docs.get('ordens_servico/os-test');
  for(const key of ['servico-0','peca-0']){
   const reg=out.execucaoItens[key],ev=out.timeline.find(e=>e.itemKey===key);
   assert.equal(reg.status,'executado');assert.equal(reg.statusAlteradoPor,'Auxiliar de teste');assert.equal(reg.statusAlteradoPorId,'auxiliar');assert.equal(reg.statusAlteradoEm,ev.dt);assert.equal(reg.statusAlteradoOrigem,'equipe');assert.match(ev.acao,/Concluído/);assert.equal(ev.interno,true);assert.equal(ev.visivelCliente,false);
   assert.equal(reg.aprovadoFinanceiramenteNoRegistro,ev.aprovadoFinanceiramente);
  }
  assert.deepEqual(out.aprovacao,before.aprovacao);assert.deepEqual(out.itensAprovados,before.itensAprovados);assert.equal(out.aprovacaoAtiva,before.aprovacaoAtiva);assert.equal(out.total,before.total);assert.equal(out.totalAprovado,before.totalAprovado);assert.equal(out.status,statusOS);assert.deepEqual(out.servicos,before.servicos);assert.deepEqual(out.pecas,before.pecas);assert.deepEqual([...db.docs.keys()],['ordens_servico/os-test']);
  const fresh=environment();assert.equal(fresh.OSOperacional.executionStatusAudit(out,'peca-0').nome,'Auxiliar de teste');
 }
});
test('aprovação retirada durante a edição permite concluir e registra ausência de aprovação sem reativá-la',async()=>{
 const c=environment(),base=fixture(),current=structuredClone(base);current.aprovacaoAtiva=false;const db=database({'ordens_servico/os-test':current});db.retry=true;
 await c.OSOperacional.saveExecution(context(c,db,base,[row('peca-0','executado')]));const out=db.docs.get('ordens_servico/os-test');
 assert.equal(out.execucaoItens['peca-0'].status,'executado');assert.equal(out.aprovacaoAtiva,false);assert.equal(out.timeline.at(-1).aprovadoFinanceiramente,false);assert.equal(out.timeline.filter(e=>e.itemKey==='peca-0').length,1);
});
test('aprovação por item no evento é a real e nunca é criada pela conclusão',async()=>{
 const c=environment(),base=fixture();base.aprovacao.itens=[{key:'servico-0'}];const db=database({'ordens_servico/os-test':base});await c.OSOperacional.saveExecution(context(c,db,base,[row('servico-0','executado'),row('peca-0','executado')]));const out=db.docs.get('ordens_servico/os-test');
 assert.equal(out.timeline.find(e=>e.itemKey==='servico-0').aprovadoFinanceiramente,true);assert.equal(out.timeline.find(e=>e.itemKey==='peca-0').aprovadoFinanceiramente,false);assert.deepEqual(out.aprovacao.itens,[{key:'servico-0'}]);
});
test('falta de aprovação não impede resolver conclusão em conflito pelo gestor',async()=>{
 const c=environment({osId:{value:'os-test'}}),base=fixture();base.aprovacao.itens=[];const current=structuredClone(base);current.execucaoItens['peca-0'].status='trocada';const db=database({'ordens_servico/os-test':current});await assert.rejects(c.OSOperacional.saveExecution(context(c,db,base,[row('peca-0','executado')])),/simultâneas/);
 const notice=[...db.docs.keys()].find(p=>p.startsWith('chat_equipe/'));c.OSOperacional.open({db,os:current,kind:'equipe',session:{tid:'oficina-test',nome:'Gestor de teste',fid:'gestor',role:'admin'}});const respostas=['P','Conclusão conferida'];c.prompt=()=>respostas.shift();await c.OSOperacional.resolve(notice.split('/')[1]);const out=db.docs.get('ordens_servico/os-test');
 assert.equal(out.execucaoItens['peca-0'].status,'executado');assert.equal(out.execucaoItens['peca-0'].statusAlteradoPor,'Gestor de teste');assert.equal(out.aprovacao.itens.length,0);assert.equal(out.timeline.find(e=>e.tipo==='execucao_item_os').aprovadoFinanceiramente,false);
});
test('concluir item sem aprovação continua exigindo usuário e vínculo com a O.S. da mesma oficina',async()=>{
 for(const caso of ['sem-vinculo','outra-oficina','sem-usuario']){
  const c=environment(),base=fixture();delete base.aprovacao;const db=database({'ordens_servico/os-test':base}),ctx=context(c,db,base,[row('peca-0','executado')]);
  if(caso==='sem-vinculo')ctx.linked=()=>false;
  if(caso==='outra-oficina')ctx.session={...ctx.session,tid:'outra-oficina'};
  if(caso==='sem-usuario')ctx.session={...ctx.session,fid:'',nome:''};
  await assert.rejects(c.OSOperacional.saveExecution(ctx),/sessão|Usuário/);assert.equal(db.docs.get('ordens_servico/os-test').execucaoItens['peca-0'].status,'pendente');assert.equal(db.docs.size,1);
 }
});
test('edição posterior de observação não troca o autor do status',async()=>{
 const c=environment(),base=fixture(),db=database({'ordens_servico/os-test':base});await c.OSOperacional.saveExecution(context(c,db,base,[row('peca-0','executado')]));
 const first=db.docs.get('ordens_servico/os-test'),when=first.execucaoItens['peca-0'].statusAlteradoEm;
 await c.OSOperacional.saveExecution({...context(c,db,first,[row('peca-0','executado','Nota do revisor','executado')]),session:{tid:'oficina-test',fid:'revisor',role:'mecanico',nome:'Revisor'}});
 const out=db.docs.get('ordens_servico/os-test'),record=out.execucaoItens['peca-0'];assert.equal(record.atualizadoPor,'Revisor');assert.equal(record.statusAlteradoPor,'Auxiliar de teste');assert.equal(record.statusAlteradoPorId,'auxiliar');assert.equal(record.statusAlteradoEm,when);assert.equal(c.OSOperacional.executionStatusAudit(out,'peca-0').nome,'Auxiliar de teste');
});
test('histórico existente por item identifica o autor sem confundir responsável ou editor da observação',()=>{
 const c=environment(),os=fixture();os.execucaoItens['peca-0']={status:'executado',obs:'Nota',mecNome:'Responsável diferente',atualizadoPor:'Editor da nota',atualizadoEm:'2026-10-20T19:10:00Z'};
 os.timeline.push({tipo:'execucao_item_os',itemKey:'peca-0',statusAnterior:'pendente',statusNovo:'executado',user:'Caio',usuarioId:'caio',dt:'2026-10-20T19:00:00Z'});
 os.timeline.push({tipo:'execucao_item_os',itemKey:'peca-0',statusAnterior:'executado',statusNovo:'executado',user:'Editor da nota',dt:'2026-10-20T19:10:00Z'});
 const before=JSON.stringify(os),audit=c.OSOperacional.executionStatusAudit(os,'peca-0'),html=c.OSOperacional.executionAuthorHTML(os,'peca-0');assert.equal(audit.nome,'Caio');assert.match(html,/Status alterado por: <b>Caio<\/b>/);assert.doesNotMatch(html,/Responsável diferente|Editor da nota/);assert.equal(JSON.stringify(os),before);
});
test('registro antigo genérico não permite inventar quem alterou determinado item',()=>{
 const c=environment(),os=fixture();os.execucaoItens['peca-0']={status:'executado',mecNome:'Responsável',mecId:'principal'};os.timeline.push({user:'Usuário antigo',acao:'Atualizou 3 item(ns) da execução da O.S.',dt:'2026-10-20T19:00:00Z'});
 assert.equal(c.OSOperacional.executionStatusAudit(os,'peca-0'),null);const html=c.OSOperacional.executionAuthorHTML(os,'peca-0');assert.match(html,/Autoria deste status não registrada/);assert.doesNotMatch(html,/Usuário antigo|Responsável|principal/);
});
test('evento de outro item ou outro estado não é usado para atribuir a alteração atual',()=>{
 const c=environment(),os=fixture();os.execucaoItens['peca-0']={status:'executado'};os.timeline.push({tipo:'execucao_item_os',itemKey:'peca-1',statusAnterior:'pendente',statusNovo:'executado',user:'Outro item',dt:'2026-10-20T19:00:00Z'});assert.equal(c.OSOperacional.executionStatusAudit(os,'peca-0'),null);
 os.timeline.push({tipo:'execucao_item_os',itemKey:'peca-0',statusAnterior:'pendente',statusNovo:'executado',user:'Evento antigo',dt:'2026-10-20T19:01:00Z'},{tipo:'execucao_item_os',itemKey:'peca-0',statusAnterior:'executado',statusNovo:'pendente',user:'Reabriu',dt:'2026-10-20T19:02:00Z'});assert.equal(c.OSOperacional.executionStatusAudit(os,'peca-0'),null);
});
test('conta administrativa sem fid registra a identidade de login e mantém UID técnico separado',async()=>{
 const c=environment(),base=fixture(),db=database({'ordens_servico/os-test':base});c.firebase.auth=()=>({currentUser:{uid:'uid-tecnico'}});
 await c.OSOperacional.saveExecution({...context(c,db,base,[row('peca-0','executado')]),kind:'jarvis',session:{tid:'oficina-test',nome:'gestor@example.test',adminEmail:'gestor@example.test',role:'admin'}});
 const r=db.docs.get('ordens_servico/os-test').execucaoItens['peca-0'];assert.equal(r.statusAlteradoPorId,'gestor@example.test');assert.equal(r.statusAlteradoPorAuthId,'uid-tecnico');assert.equal(r.statusAlteradoPor,'gestor@example.test');assert.equal(r.statusAlteradoOrigem,'jarvis');
});
test('resolução do conflito registra o gestor que decidiu, preservando a proposta no histórico',async()=>{
 const c=environment({osId:{value:'os-test'}}),base=fixture(),current=structuredClone(base);current.execucaoItens['peca-0'].status='trocada';const db=database({'ordens_servico/os-test':current});await assert.rejects(c.OSOperacional.saveExecution(context(c,db,base,[row('peca-0','executado')])),/simultâneas/);
 const notice=[...db.docs.keys()].find(p=>p.startsWith('chat_equipe/'));c.OSOperacional.open({db,os:current,kind:'equipe',session:{tid:'oficina-test',nome:'Gestor conferente',fid:'gestor',role:'admin'}});const answers=['P','Conferi a aplicação'];c.prompt=()=>answers.shift();await c.OSOperacional.resolve(notice.split('/')[1]);const out=db.docs.get('ordens_servico/os-test');assert.equal(out.execucaoItens['peca-0'].statusAlteradoPor,'Gestor conferente');assert.equal(out.execucaoItens['peca-0'].statusAlteradoPorId,'gestor');assert.equal(out.timeline.at(-1).propostoPor,'Auxiliar de teste');
});
test('renderizadores ativos do JARVIS e Equipe exibem a autoria por item com nome escapado',()=>{
 const c=environment({'equipe-usabilidade-v262-style':{}}),os=fixture(),record={status:'executado',statusAlteradoPor:'Caio <teste>',statusAlteradoPorId:'caio',statusAlteradoEm:'2026-10-20T19:00:00Z',statusAlteradoDe:'pendente',statusAlteradoPara:'executado'};os.execucaoItens['peca-0']=record;
 let s=fs.readFileSync(path.join(root,'js/hardening-operacional-20260515.js'),'utf8'),at=s.lastIndexOf('})();');s=s.slice(0,at)+'W.__renderItem=itemHTML;\n'+s.slice(at);vm.runInContext(s,c);const it=c.JOS.buildBudgetItems(os).find(i=>i.key==='peca-0');const jarvis=c.__renderItem(it,record,os);assert.match(jarvis,/Status alterado por: <b>Caio &lt;teste&gt;<\/b>/);assert.doesNotMatch(jarvis,/Caio <teste>/);
 c.aplicarMarcadoresAprovacaoEquipe=()=>{};c.salvarExecucaoAprovadosEquipe=async()=>{};c.J={role:'mecanico'};s=fs.readFileSync(path.join(root,'js/equipe-usabilidade-v262.js'),'utf8');at=s.lastIndexOf('})(window, document);');s=s.slice(0,at)+'W.__renderEquipe=itemRowHTML;\n'+s.slice(at);vm.runInContext(s,c);const equipe=c.__renderEquipe(it,record,os,true);assert.match(equipe,/Status alterado por: <b>Caio &lt;teste&gt;<\/b>/);
});

function telaExecucao(tipo){
 const els={'osId':{value:'os-test'},'equipe-usabilidade-v262-style':{}};
 const c=environment(els);
 const parent={style:{},setAttribute(){},insertAdjacentElement(_,box){els[box.id]=box;}};
 for(const id of ['containerServicos','containerPecas','containerServicosOS','containerPecasOS'])els[id]={parentElement:parent,closest:()=>parent};
 c.document.createElement=()=>({style:{},setAttribute(){},querySelector:()=>null,querySelectorAll:()=>[],remove(){delete els[this.id];}});
 c.document.querySelector=()=>null;
 c.J={role:tipo==='equipe'?'mecanico':'admin',clientes:[],os:[]};
 c.aplicarMarcadoresAprovacaoEquipe=()=>{};c.aplicarMarcadoresAprovacaoOS=()=>{};c.salvarExecucaoAprovadosEquipe=async()=>{};
 let source=fs.readFileSync(path.join(root,tipo==='equipe'?'js/equipe-usabilidade-v262.js':'js/hardening-operacional-20260515.js'),'utf8');
 if(tipo==='jarvis'){const at=source.lastIndexOf('})();');source=source.slice(0,at)+'W.__instalarExecucao=overrideAprovacaoOS;\n'+source.slice(at);}
 vm.runInContext(source,c);
 if(tipo==='jarvis')c.__instalarExecucao();
 const render=os=>{c.J.os=[os];c._equipeOSAtual=os;if(tipo==='equipe')c.aplicarMarcadoresAprovacaoEquipe(os);else c.aplicarMarcadoresAprovacaoOS(os);return els[tipo==='equipe'?'resumoAprovacaoEquipe':'resumoAprovacaoOS']?.innerHTML || '';};
 return {c,render};
}
test('Equipe e JARVIS reabrem peças e serviços concluídos sem aprovação com status e autor corretos',async()=>{
 for(const tipo of ['equipe','jarvis'])for(const configuracao of ['sem-aprovacao','parcial','inativa','completa']){
  const base=fixture();base.status='Aprovado';
  if(configuracao==='sem-aprovacao')delete base.aprovacao;
  if(configuracao==='parcial')base.aprovacao.itens=[{key:'peca-1'}];
  if(configuracao==='inativa')base.aprovacaoAtiva=false;
  const tela=telaExecucao(tipo),initial=tela.render(base);
  for(const key of ['servico-0','peca-0'])assert.ok(initial.includes(`data-key="${key}"`),tipo+' '+configuracao+' '+key);
  const db=database({'ordens_servico/os-test':base});
  await tela.c.OSOperacional.saveExecution(context(tela.c,db,base,[row('servico-0','executado'),row('peca-0','executado')]));
  const out=db.docs.get('ordens_servico/os-test'),fresh=telaExecucao(tipo),html=fresh.render(out);
  for(const key of ['servico-0','peca-0']){
   const itemHTML=html.split(`data-key="${key}"`)[1]?.split('data-key="')[0];assert.ok(itemHTML,tipo+' '+key);
   assert.match(itemHTML,/data-status-inicial="executado"/);assert.match(itemHTML,/<option value="executado" selected>Concluído/);assert.match(itemHTML,/Status alterado por: <b>Auxiliar de teste<\/b>/);
  }
  assert.ok(html.includes('2'),tipo+' contador');
 }
});
test('atalho CONCLUIR grava o item sem aprovação e o mostra concluído com autoria após a confirmação',async()=>{
 const base=fixture();base.aprovacao.itens=[];base.status='Aprovado';const tela=telaExecucao('equipe'),db=database({'ordens_servico/os-test':base});
 const select={value:'pendente'},draft={dataset:{key:'peca-0',statusInicial:'pendente',obsInicial:''},querySelector:s=>s==='.exec-status'?select:s==='.exec-obs'?{value:''}:null},button={disabled:false,closest:()=>draft};
 const before=tela.render(base);assert.match(before,/window.concluirItemEquipeV262\(this\)/);
 tela.c.salvarExecucaoAprovadosEquipe=async()=>tela.c.OSOperacional.saveExecution({...context(tela.c,db,base,[draft]),confirm:os=>tela.render(os)});
 await tela.c.concluirItemEquipeV262(button);
 const out=db.docs.get('ordens_servico/os-test');assert.equal(out.execucaoItens['peca-0'].status,'executado');assert.equal(out.execucaoItens['peca-0'].statusAlteradoPorId,'auxiliar');assert.equal(button.disabled,false);assert.equal(draft.dataset.statusInicial,'executado');assert.equal(out.aprovacao.itens.length,0);
 const html=tela.render(out).split('data-key="peca-0"')[1];assert.match(html,/data-status-inicial="executado"/);assert.match(html,/Auxiliar de teste/);
});
test('controles originais da Equipe e JARVIS também permitem conclusão sem aprovação',async()=>{
 for(const tipo of ['equipe','jarvis']){
  const base=fixture();delete base.aprovacao;const tela=telaExecucao(tipo),c=tela.c,db=database({'ordens_servico/os-test':base});
  await c.OSOperacional.saveExecution(context(c,db,base,[row('servico-0','executado'),row('peca-0','executado')]));const out=db.docs.get('ordens_servico/os-test');
  c.J.role='admin';c.dbClientes=[];c.parseBR=c.JOS.parseNumberBR;c.numBR=c.JOS.parseNumberBR;c.escExecEquipe=c.JOS.escapeHtml;c.escOS=c.JOS.escapeHtml;
  c.equipeTemOrcamentoAprovado=o=>o.aprovacaoAtiva!==false&&c.JOS.hasApproval(o);c.osAtribuidaAoUsuarioEquipe=()=>true;c.equipeItensOperacionaisOS=(o,cli)=>c.JOS.buildBudgetItems(o,cli);c.opcoesMecanicoServicoEquipe=()=>'';c.equipeReorganizarItensExecutados=()=>{};
  c.OSU=()=>c.JOS;c.opcoesResponsavelServicoOS=()=>'';
  if(tipo==='equipe'){
   const s=fs.readFileSync(path.join(root,'equipe.html'),'utf8');let at=s.indexOf('function statusOptionsExecEquipe(');vm.runInContext(s.slice(at,s.indexOf('\nasync function salvarExecucaoAprovadosEquipe',at)),c);
   at=s.indexOf('function equipeItemFoiExecutado(');vm.runInContext(s.slice(at,s.indexOf("\ndocument.addEventListener('change'",at)),c);
   at=s.indexOf('function aplicarMarcadoresAprovacaoEquipe(');vm.runInContext(s.slice(at,s.indexOf('\nfunction mecanicosEquipeDaOS',at)),c);
  }else{
   const s=fs.readFileSync(path.join(root,'js/os.js'),'utf8');const at=s.indexOf('function statusOptionsExecOS(');vm.runInContext(s.slice(at,s.indexOf('\nwindow.salvarExecucaoAprovadosOS',at)),c);
   vm.runInContext(s.match(/window\.aplicarMarcadoresAprovacaoOS = function\(os\) \{[\s\S]*?\n\};/)[0],c);
  }
  const html=tela.render(out),selects=html.match(/<select class="j-select exec-status"[^>]*>/g);assert.equal(selects.length,3,tipo);assert.ok(selects.every(s=>!s.includes('disabled')),tipo);
  assert.match(html,/<option value="executado" selected>Concluído/);assert.match(html,/Status alterado por: <b>Auxiliar de teste<\/b>/);
 }
});
