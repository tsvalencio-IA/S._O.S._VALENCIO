const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

// Fixtures isoladas: reproduzem os formatos e perguntas informados, sem ler
// nem gravar a base real. Nomes extras nos casos de autoria são dados de teste.
function dados(){
  return {role:'admin',tid:'oficina-teste',oficina:{},clientes:[],veiculos:[],
    equipe:[{id:'kayo',nome:'KAYO'},{id:'thalis',nome:'THALIS'},{id:'terceiro',nome:'SERVIÇO TERCEIRIZADO'},{id:'daniel',nome:'DANIEL'},{id:'murilo',nome:'MURILO'},{id:'givanildo',nome:'GIVANILDO'}],
    os:[
      {id:'legadoKS9VID',placa:'FJJ0H00',data:'2026-06-23',status:'Entregue',servicos:[],pecas:[{codigo:'225004310',desc:'TERMINAL BARRA DIRECAO DIREITO'},{codigo:'35230',desc:'CORREIA AR CONDICIONADO - 3PK796ELAST'},{codigo:'36760',desc:'CORREIA ALTERNADOR - 6PK1200 ELAST'}],itensAprovados:['peca-0','peca-1','peca-2']},
      {id:'legadoAF4XKU',placa:'FJJ0H00',data:'2026-08-03',status:'Entregue',servicos:[],pecas:[{codigo:'032121025CN',desc:'CARCAÇA VALVULA TERMOSTATICA COMPLETA'},{codigo:'041003310',desc:'PALHETA LIMPADOR SLIM ORIGINAL'}]},
      {id:'BzNP0fZkUC',placa:'FJU4J18',data:'2026-10-19',createdAt:'2026-10-19',entregueEm:'2026-10-20',status:'Entregue',
        servicos:[{desc:'RETÍFICA CAMPANA E LONA, E DISCOS DIANTEIROS',mecId:'terceiro'},{desc:'TROCAR AMORTECEDORES DIANTEIROS, BIELETAS, BUCHAS DA BARRA, E FREIO DIANTEIRO',mecId:'kayo',mecNome:'KAYO'},{desc:'ALINHAMENTO, BALANCEAMENTO E RODÍZIO',mecId:'thalis'}],
        pecas:[{codigo:'MB793',desc:'BUCHA BARRA ESTABILIZ'}],itensAprovados:['servico-0','servico-1','servico-2','peca-0'],
        execucaoItens:{'servico-1':{status:'executado',mecId:'kayo',mecNome:'KAYO'},'peca-0':{status:'executado'}}},
      {id:'tF7U67JPBC',placa:'FJU4J18',data:'2026-09-22',entregueEm:'2026-09-24',status:'Entregue',servicos:[{desc:'REVISÃO MECÂNICA PROJETO ÓLEO',rateiosComissao:[{mecId:'daniel'},{mecId:'murilo'}]}]},
      {id:'n3HgSctLqe',placa:'FJU4J18',data:'2026-07-31',entregueEm:'2026-08-03',status:'Entregue',mecId:'givanildo',servicos:[{desc:'REVISÃO MECÂNICA (PROJETO ÓLEO E FILTROS)'}]},
      {id:'TNnK81V6Ry',placa:'FJU4J18',data:'2026-08-03',entregueEm:'2026-08-14',status:'Entregue',mecNome:'MATHEUS',servicos:[{desc:'CONSERTO CAIXA DE DIREÇÃO',mecNome:'SERVIÇO TERCEIRIZADO'},{desc:'MÃO DE OBRA FREIO DIANTEIRO',mecNome:'THIAGO VENTURA VALENCIO'}]}
    ]};
}
function ambiente(J=dados(),pathname='/jarvis.html'){
  const elements={};
  const document={addEventListener(){},getElementById:id=>elements[id] || null,querySelectorAll:()=>[],querySelector:()=>null};
  const storage=new Map();
  const c={J,document,console,Intl,Date,sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},localStorage:{getItem:()=>null},location:{pathname},setTimeout:()=>0,setInterval:()=>0,clearTimeout(){},clearInterval(){},fetch:async()=>({ok:false}),navigator:{},TextEncoder};
  c.window=c;vm.createContext(c);
  for(const f of ['js/os-utils.js','js/os-operacional.js','js/ia.js','js/catalogos-ia.js']) vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),c,{filename:f});
  return {c,elements,ask:q=>c.thiaResponderLocalAsync(q,{perfil:'jarvis'}),sync:q=>c.thiaResponderLocal(q,{perfil:'jarvis'})};
}
const atual=J=>J.os.find(o=>o.id==='BzNP0fZkUC');
test('perguntas originais: verbo não vira peça e correias de acessórios não provam correia dentada',async()=>{
  const a=ambiente();
  for(const q of ['FJJ0H00 TROCOU CORREIA DENTADA ?','Foi trocada a correia dentada do veículo FJJ-0H00?','Substituíram correia dentada na placa fjj0h00?']){
    const r=await a.ask(q);assert.match(r,/Não encontrei correia dentada/);assert.doesNotMatch(r,/Não encontrei trocou|Sim\./);
  }
});
test('terminal legado é localizado, mas entrega e aprovação não comprovam execução',async()=>{
  const r=await ambiente().ask('FOI TROCADO TERMINAL BARRA DIRECAO DO VEÍCULO FJJ0H00 ?');
  assert.match(r,/KS9VID/);assert.match(r,/225004310/);assert.match(r,/sem confirmação individual de execução/);assert.doesNotMatch(r,/Sim\./);
});
test('bucha singular encontra serviço no plural e peça sem contar duas trocas',async()=>{
  const r=await ambiente().ask('FOI TROCADO BUCHA DA BARRA DO VEÍCULO FJU4J18?');
  assert.match(r,/execução confirmada em 1 O.S./);assert.match(r,/BUCHAS DA BARRA/);assert.match(r,/MB793/);assert.doesNotMatch(r,/2 registro|2 troca/);
});
test('quem trocou consulta o item: responsável não vira executor ou usuário do status',async()=>{
  const r=await ambiente().ask('QUEM TROCOU BUCHA DA BARRA DO VEÍCULO FJU4J18');
  assert.match(r,/Responsável\(is\) atribuído\(s\) ao item: KAYO/);assert.match(r,/Executor da troca\/serviço não identificado/);assert.match(r,/Usuário que alterou o status: não identificado/);assert.doesNotMatch(r,/Não encontrei quem|Executor identificado: KAYO/);
});
test('perguntas equivalentes sobre mecânico e atendimento usam os mesmos quatro atendimentos',async()=>{
  for(const q of ['QUAL MECÂNICO FEZ ATENDIMENTO DO VEÍCULO FJU4J18 ?','ATENDIMENTO FJU4J18','Quem atendeu FJU4J18?','Quais mecânicos realizaram serviços no veículo FJU4J18?']){
    const r=await ambiente().ask(q);assert.match(r,/Atendimentos da placa FJU4J18 \(4 O.S.\)/,q);
    for(const nome of ['GIVANILDO','MATHEUS','DANIEL','MURILO','KAYO','THALIS','SERVIÇO TERCEIRIZADO']) assert.ok(r.includes(nome),q+' '+nome);
    assert.ok(r.indexOf('SCTLQE')<r.indexOf('81V6RY') && r.indexOf('81V6RY')<r.indexOf('67JPBC') && r.indexOf('67JPBC')<r.indexOf('0FZKUC'));
  }
});
test('lista de peças mostra todos os 26 registros, incluindo o último, sem promover legado a troca',async()=>{
  const J=dados();J.os[0].pecas=Array.from({length:26},(_,i)=>({desc:'ITEM TESTE '+(i+1)}));J.os[0].itensAprovados=J.os[0].pecas.map((_,i)=>'peca-'+i);
  const r=await ambiente(J).ask('QUAIS PEÇAS FORAM TROCADAS DO VEÍCULO FJJ0H00 ?');
  assert.match(r,/Peças localizadas: 26/);assert.match(r,/ITEM TESTE 26/);assert.doesNotMatch(r,/\+ 6 item|execução confirmada \(/);
});
test('resumo e placa isolada continuam listando as O.S. correspondentes',async()=>{
  const a=ambiente();for(const q of ['RESUMO FJJ0H00','FJJ0H00']){const r=await a.ask(q);assert.match(r,/AF4XKU/);assert.match(r,/KS9VID/);assert.doesNotMatch(r,/0FZKUC/);}
});
test('status negativos, reabertura e cancelamento prevalecem sobre flags e listas antigas',async()=>{
  for(const status of ['nao_executado','nao_trocada','não executado','pendente','em_execucao','cancelado']){
    const J=dados(),o=atual(J);o.execucaoItens['servico-1'].status=status;o.execucaoItens['peca-0'].status=status;o.pecas[0].executado=true;o.pecasTrocadas=[{desc:'BUCHA BARRA ESTABILIZ',codigo:'MB793',executado:true}];
    const r=await ambiente(J).ask('Foi trocada bucha da barra do FJU4J18?');assert.doesNotMatch(r,/Sim\.|execução confirmada em/,status);assert.ok(r.includes(status),status);
  }
});
test('autoria do status e executor explícito são pessoas distintas do responsável',async()=>{
  const J=dados(),o=atual(J);o.execucaoItens['peca-0']={status:'executado',executorNome:'Executor teste',mecNome:'Responsável teste',statusAlteradoPor:'Caio teste',statusAlteradoPorId:'caio',statusAlteradoEm:'2026-10-20T18:00:00Z',statusAlteradoDe:'pendente',statusAlteradoPara:'executado',atualizadoPor:'Editor posterior',atualizadoEm:'2026-10-20T19:00:00Z'};
  const a=ambiente(J);
  for(const q of ['Quem trocou bucha barra do FJU4J18?','Quem alterou o status da bucha da barra do FJU4J18?','Qual usuário registrou bucha barra na placa FJU4J18?']){
    const r=await a.ask(q);assert.match(r,/Executor identificado: Executor teste/);assert.match(r,/atribuído\(s\) ao item: Responsável teste/);assert.match(r,/Status registrado por: Caio teste em/);assert.match(r,/pendente → executado/);assert.doesNotMatch(r,/Status registrado por: Editor posterior|Não encontrei evento de auditoria/);
  }
});
test('timeline por chave resolve autoria antiga; evento genérico e evento de outro item não comprovam autor',async()=>{
  const J=dados(),o=atual(J);o.timeline=[{tipo:'os_editada',user:'Genérico teste',acao:'Editou a O.S.'},{tipo:'execucao_item_os',itemKey:'servico-0',user:'Outro teste',statusAnterior:'pendente',statusNovo:'executado',dt:'2026-10-20T20:00:00Z'},{tipo:'execucao_item_aprovado',itemKey:'peca-0',user:'Autor teste',statusAnterior:'pendente',statusNovo:'executado',dt:'2026-10-20T18:00:00Z'}];
  const r=await ambiente(J).ask('Quem registrou bucha barra do FJU4J18?');assert.match(r,/Status registrado por: Autor teste/);assert.doesNotMatch(r,/Status registrado por: (Genérico|Outro) teste/);
});
test('ID resolve o nome cadastrado sem transformar atualizador de observação em autor do status',async()=>{
  const J=dados(),o=atual(J);o.execucaoItens['peca-0']={status:'executado',statusAlteradoPorId:'murilo',statusAlteradoPara:'executado',atualizadoPor:'Editor teste'};
  const r=await ambiente(J).ask('Quem marcou bucha barra como executada no FJU4J18?');assert.match(r,/Status registrado por: MURILO/);assert.doesNotMatch(r,/Status registrado por: Editor teste/);
});
test('itens com a mesma descrição preservam as duas chaves e suas autorias',async()=>{
  const J=dados(),o=atual(J);o.pecas.push({...o.pecas[0]});o.execucaoItens['peca-0']={status:'executado',statusAlteradoPor:'Autor A',statusAlteradoPara:'executado'};o.execucaoItens['peca-1']={status:'nao_trocada',statusAlteradoPor:'Autor B',statusAlteradoPara:'nao_trocada'};
  const r=await ambiente(J).ask('Quem mudou status bucha barra do FJU4J18?');assert.match(r,/Status registrado por: Autor A/);assert.match(r,/Status registrado por: Autor B/);assert.match(r,/nao_trocada/);
});
test('continuação curta retém peça e placa; nova placa não herda peça anterior',async()=>{
  const a=ambiente();await a.ask('Foi trocada bucha da barra do FJU4J18?');
  for(const q of ['E quem trocou?','Quem registrou essa troca?']){const r=await a.ask(q);assert.match(r,/Autoria de bucha barra — placa FJU4J18/);assert.match(r,/KAYO/);}
  await a.ask('FJJ0H00');const r=await a.ask('Quem atendeu esse veículo?');assert.match(r,/Atendimentos da placa FJJ0H00/);assert.doesNotMatch(r,/bucha|KAYO/);
});
test('pergunta sobre modelo segue a mesma regra: atribuição não prova executor',async()=>{
  const J=dados();atual(J).veiculoSnapshot={modelo:'HILUX'};
  const r=await ambiente(J).ask('Quem trocou bucha da barra da Hilux?');assert.match(r,/FJU4J18/);assert.match(r,/KAYO/);assert.doesNotMatch(r,/Executor identificado.*KAYO/);
});
test('não usa dados de outra placa nem expõe peças reais restritas',async()=>{
  const J=dados();atual(J).pecasReais=[{desc:'PEÇA SIGILOSA TESTE',executado:true}];
  const a=ambiente(J),r=await a.ask('Quem trocou bucha barra da placa FJJ0H00?');assert.match(r,/Não encontrei bucha barra/);assert.doesNotMatch(r,/KAYO|0FZKUC/);
  assert.doesNotMatch(await a.ask('Quais peças foram trocadas no FJU4J18?'),/SIGILOSA/);
});
test('código exato e plural/abreviação comum encontram a peça correta',async()=>{
  const a=ambiente();assert.match(await a.ask('Foi trocado MB793 no FJU4J18?'),/MB793/);
  assert.match(await a.ask('Quem substituiu buchas da barra estabilizadora no FJU4J18?'),/MB793/);
});
test('carga assíncrona traz equipe e O.S. antes de responder quem executou',async()=>{
  const J=dados(),os=J.os,equipe=J.equipe;J.os=[];J.equipe=[];const a=ambiente(J),loads=[];
  a.c.thiaEnsureKeyV2612=async key=>{loads.push(key);if(key==='os')J.os=os;if(key==='equipe')J.equipe=equipe;};
  const r=await a.ask('Qual mecânico trocou bucha barra no FJU4J18?');assert.match(r,/KAYO/);assert.ok(loads.includes('os'));assert.ok(loads.includes('equipe'));assert.ok(!loads.includes('financeiro'));
});
test('caminho real do botão da IA preserva a resposta e os nomes na tela',async()=>{
  const a=ambiente(),messages=[];a.elements.iaInput={value:'QUAL MECÂNICO FEZ ATENDIMENTO DO VEÍCULO FJU4J18 ?'};
  a.c._jiaAddMsg=(tipo,html)=>{const msg={innerHTML:html};messages.push(msg);return msg;};
  const inicio=fs.readFileSync(path.join(root,'jarvis.html'),'utf8');const script=inicio.match(/async function _jiaChamar\(pergunta\) \{[\s\S]*?\n\}/)[0];
  a.c._jiaHist=[];vm.runInContext(script,a.c);await a.c._jiaChamar(a.elements.iaInput.value);
  assert.match(messages.at(-1).innerHTML,/Atendimentos da placa FJU4J18 \(4 O.S.\)/);assert.match(messages.at(-1).innerHTML,/KAYO/);
});
test('consultas de proprietário e compra continuam nos seus roteadores próprios',async()=>{
  const J=dados();atual(J).clienteId='cliente-teste';J.clientes=[{id:'cliente-teste',nome:'Proprietário teste'}];
  const a=ambiente(J);assert.match(await a.ask('Quem é o proprietário do veículo FJU4J18?'),/Proprietário teste/);
  assert.match(await a.ask('De quem foram compradas as peças do veículo FJU4J18?'),/vínculo fiscal comprovado/);
});
test('mecânicos por IDs e atendimentos oficiais não dependem de comissão para identificar vínculo',async()=>{
  const J=dados(),o=atual(J);o.clienteOficial=true;o.mecIds=['murilo'];o.mecanicos=['daniel'];
  const r=await ambiente(J).ask('Qual mecânico atendeu FJU4J18?');
  const ultima=r.slice(r.indexOf('0FZKUC'));for(const nome of ['DANIEL','MURILO','KAYO','THALIS'])assert.ok(ultima.includes(nome),nome);
});
test('nomes e descrições aparecem como texto escapado na resposta',async()=>{
  const J=dados(),o=atual(J);o.execucaoItens['peca-0']={status:'executado',executorNome:'Teste <script>alert(1)</script>',statusAlteradoPor:'Caio <teste>',statusAlteradoPara:'executado'};
  const r=await ambiente(J).ask('Quem trocou bucha barra do FJU4J18?');assert.match(r,/Caio &lt;teste&gt;/);assert.match(r,/&lt;script&gt;/);assert.doesNotMatch(r,/<script>|Caio <teste>/);
});
test('mesmo modelo em duas placas exige escolha e respeita a placa informada',async()=>{
  const J=dados();atual(J).veiculoSnapshot={modelo:'HILUX'};J.os.push({id:'outro-teste',placa:'ABC1234',veiculoSnapshot:{modelo:'HILUX'},servicos:[{desc:'Trocar bucha barra',mecNome:'Outro responsável'}]});
  const a=ambiente(J);assert.match(await a.ask('Quem trocou bucha da barra da Hilux?'),/Qual é a placa/);
  const r=await a.ask('FJU4J18');assert.match(r,/KAYO/);assert.doesNotMatch(r,/Outro responsável/);
});
test('IA reconhece conclusão e autor sem exigir aprovação do item no orçamento',async()=>{
  const J=dados(),o=atual(J);delete o.aprovacao;delete o.itensAprovados;o.aprovacaoAtiva=false;
  o.execucaoItens['peca-0']={status:'executado',statusAlteradoPor:'Autor teste',statusAlteradoPorId:'autor-teste',statusAlteradoPara:'executado',statusAlteradoEm:'2026-10-21T12:00:00Z'};
  const a=ambiente(J),r=await a.ask('Foi trocada bucha barra no FJU4J18?');assert.match(r,/Sim\. Há execução confirmada em 1 O.S./);
  assert.match(await a.ask('Quem registrou bucha barra do FJU4J18?'),/Status registrado por: Autor teste/);
});
