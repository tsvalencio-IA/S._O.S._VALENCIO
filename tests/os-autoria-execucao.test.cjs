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
  const html=c.OSOperacional.executionAuthorHTML(out,key,r);assert.match(html,/Status alterado por: <b>Auxiliar de teste<\/b>/);assert.match(html,/Pendente → Executado/);
 }
 assert.equal(out.execucaoItens['peca-0'].mecId,'principal');
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
