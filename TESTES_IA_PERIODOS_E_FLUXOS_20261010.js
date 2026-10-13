'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function executar(pergunta,os,perfil='admin',resumo=null,clientes=[],equipeExtra=[]){
  const J={tid:'TESTE_SEM_FIREBASE',role:perfil,equipe:[{id:'m1',nome:'Murilo',comissao:10},{id:'m2',nome:'Joao',comissao:10},...equipeExtra],
    os,clientes,veiculos:[],financeiro:[],notasFiscaisEntrada:[],fornecedores:[],estoque:[]};
  const W={J,location:{pathname:'/jarvis.html'}};
  if(resumo) W.thiaComissoesResumoV26=()=>resumo;
  const env={window:W,document:{addEventListener:()=>{},getElementById:()=>null},location:W.location,console,
    sessionStorage:{getItem:()=>null},setTimeout:()=>{},clearTimeout:()=>{},navigator:{}};
  vm.createContext(env);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'js/ia.js'),'utf8'),env,{filename:'js/ia.js',timeout:7000});
  return W.thiaResponderLocal(pergunta,{perfil,J});
}
const antiga={id:'old',numero:'100',placa:'AAA1111',status:'Entregue',createdAt:'2026-09-24T09:00:00',
  finalizadoEm:'2026-09-30T17:00:00',mecId:'m1',
  servicos:[{desc:'Revisar freios',mecId:'m1',lancadoEm:'2026-09-24T09:00:00',valor:150}]};
const nova={id:'new',numero:'101',placa:'BBB2222',status:'Andamento',createdAt:'2026-09-29T09:00:00',
  mecId:'m1',servicos:[{desc:'Troca de correia',mecId:'m1',lancadoEm:'2026-09-29T09:00:00',valor:120}]};
const antigaEditada={id:'edited',numero:'102',placa:'CCC3333',status:'Andamento',createdAt:'2026-09-24T09:00:00',
  updatedAt:'2026-09-30T12:00:00',mecId:'m1',
  servicos:[{desc:'Revisar oleo',mecId:'m1',lancadoEm:'2026-09-24T09:00:00',valor:220}]};
const pergunta='atendimentos do mecanico Murilo 28/09 ate 02/10/2026';
const resposta=executar(pergunta,[antiga,nova,antigaEditada]);
assert.match(resposta,/AAA1111/,'OS antiga finalizada na semana');
assert.match(resposta,/BBB2222/,'servico lancado na semana');
assert.doesNotMatch(resposta,/CCC3333/,'edicao generica nao conta');
assert.doesNotMatch(resposta,/Valor cobrado do cliente/,'relatorio de atendimento sem poluicao');
assert.match(resposta,/\(2 O\.S\.\)/,'duas OS no resumo compacto');
assert.match(resposta,/recebe \(50%\)/,'cliente comum recebe metade da parte atribuida');
assert.doesNotMatch(executar(pergunta,[{...antiga,finalizadoEm:'2026-09-26T17:00:00'}]),/AAA1111/);
assert.doesNotMatch(executar(pergunta,[{...antiga,status:'Cancelado'}]),/AAA1111/);
assert.doesNotMatch(executar(pergunta,[{...antiga,mecId:'m2',servicos:[{...antiga.servicos[0],mecId:'m2'}]}]),/AAA1111/);
assert.doesNotMatch(executar('servicos lancados pelo mecanico Murilo 28/09 ate 02/10/2026',[antiga]),/AAA1111/);
const ts={seconds:Math.floor(new Date('2026-09-30T15:00:00-03:00').getTime()/1000),nanoseconds:0};
assert.match(executar(pergunta,[{...antiga,finalizadoEm:ts}]),/AAA1111/,'timestamp Firestore');
assert.doesNotMatch(executar(pergunta,[antiga],'mecanico'),/Valor cobrado do cliente/,'sigilo financeiro');
for(const f of ['js/cilia.js','js/cilia-api.js','js/tabela-tempa.js','js/exportar-pmsp.js'])
  assert.ok(fs.statSync(path.join(__dirname,f)).size>100, 'arquivo critico presente: '+f);
const relatorio=executar(pergunta,[antiga,nova],'admin',{linhas:[
  {osId:'old',servicoKey:'servico-0',base:150,previsto:75,pago:5,falta:70,aguardandoExecucao:false,semPercentual:false},
  {osId:'new',servicoKey:'servico-0',base:120,previsto:60,pago:0,falta:60,aguardandoExecucao:true,semPercentual:false},
  {osId:'outra-os',servicoKey:'servico-0',base:1000,previsto:500,pago:500,falta:0,aguardandoExecucao:false,semPercentual:false}
]});
assert.match(relatorio,/Total a receber:[\s\S]*135,00/,'50% do rateio das OS do periodo');
assert.match(relatorio,/Pago:[\s\S]*5,00/,'pagamentos efetivamente registrados');
assert.match(relatorio,/Falta:[\s\S]*130,00/,'saldo parcial');
assert.doesNotMatch(relatorio,/1\.000,00/,'nao somar outra OS');
assert.doesNotMatch(relatorio,/Valor cobrado do cliente/,'compacto nao detalha orcamento');
assert.doesNotMatch(executar(pergunta,[antiga],'mecanico',{linhas:[]}),/Pago:|Falta:/,'ocultar pagamentos do mecanico');

const viatura={
  id:'of1', numero:'JFUQ4R', clienteId:'pms', placa:'EPX9844',
  veiculo:'GOL', kmEntrada:95757, status:'Orcamento',
  createdAt:'2026-06-29', mecId:'m2',
  comissaoOficialOS:{ativa:true,atualizadoEm:'2026-10-13',rateios:[{mecId:'th',mecNome:'THALIS',valor:700}]},
  servicos:[{desc:'PINTAR CAPUZ',valor:518.89,mecId:'m2',lancadoEm:'2026-10-01',tipoExecucao:'interna'}]
};
const oficialCliente=[{id:'pms',nome:'52 BPM POLICIA MILITAR',tipoCliente:'governo'}];
const quadro=[{id:'th',nome:'THALIS',comissao:50}];
const perguntaThalis='atendimento mecanico THALIS 28/09 ate 10/10/2026';
const respostaThalis=executar(perguntaThalis,[viatura],'admin',null,oficialCliente,quadro);
assert.match(respostaThalis,/EPX9844/,'placa e OS da viatura');
assert.match(respostaThalis,/700,00/,'valor fixo integral, sem percentual');
assert.match(respostaThalis,/VIATURA OFICIAL/,'classificacao explicita');
assert.doesNotMatch(respostaThalis,/PINTAR CAPUZ|518,89/,'nao mostrar orcamento na consulta do mecanico');
assert.doesNotMatch(executar('atendimento mecanico JOAO 28/09 ate 10/10/2026',[viatura],'admin',null,oficialCliente),/EPX9844/,'mecanico relacionado apenas como teste nao recebe viatura');
const semCombinado={...viatura,id:'sem',placa:'ABC9999',comissaoOficialOS:{ativa:false,rateios:[]}};
assert.doesNotMatch(executar(perguntaThalis,[semCombinado],'admin',null,oficialCliente,quadro),/ABC9999/,'sem acordo nao presume comissao');
const terceirizada={
  id:'t1',numero:'999',placa:'TER1234',status:'Entregue',
  createdAt:'2026-10-01',finalizadoEm:'2026-10-04',mecId:'m1',
  servicos:[{desc:'RETIFICA CABECOTE',valor:2000,mecId:'m1',lancadoEm:'2026-10-02',tipoExecucao:'terceirizada'}]
};
assert.doesNotMatch(executar('atendimento mecanico Murilo 01/10 ate 10/10/2026',[terceirizada]),/TER1234/,'terceirizado nao vira atendimento financeiro');
console.log('OK: periodos, regra 50%, valor combinado integral, terceirizacao, sigilo e modulos criticos');
