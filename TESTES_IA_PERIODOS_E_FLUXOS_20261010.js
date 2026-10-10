'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function executar(pergunta,os,perfil='admin'){
  const J={tid:'TESTE_SEM_FIREBASE',role:perfil,equipe:[{id:'m1',nome:'Murilo',comissao:10},{id:'m2',nome:'Joao',comissao:10}],
    os,clientes:[],veiculos:[],financeiro:[],notasFiscaisEntrada:[],fornecedores:[],estoque:[]};
  const W={J,location:{pathname:'/jarvis.html'}};
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
assert.match(resposta,/Entrada da O\.S\.:<\/strong> 24\/09\/2026/);
assert.match(resposta,/Total de O\.S\.:<\/strong> 2/);
assert.match(resposta,/finalizada no per[ií]odo/);
assert.doesNotMatch(executar(pergunta,[{...antiga,finalizadoEm:'2026-09-26T17:00:00'}]),/AAA1111/);
assert.doesNotMatch(executar(pergunta,[{...antiga,status:'Cancelado'}]),/AAA1111/);
assert.doesNotMatch(executar(pergunta,[{...antiga,mecId:'m2',servicos:[{...antiga.servicos[0],mecId:'m2'}]}]),/AAA1111/);
assert.doesNotMatch(executar('servicos lancados pelo mecanico Murilo 28/09 ate 02/10/2026',[antiga]),/AAA1111/);
const ts={seconds:Math.floor(new Date('2026-09-30T15:00:00-03:00').getTime()/1000),nanoseconds:0};
assert.match(executar(pergunta,[{...antiga,finalizadoEm:ts}]),/AAA1111/,'timestamp Firestore');
assert.doesNotMatch(executar(pergunta,[antiga],'mecanico'),/Valor cobrado do cliente/,'sigilo financeiro');
for(const f of ['js/cilia.js','js/cilia-api.js','js/tabela-tempa.js','js/exportar-pmsp.js'])
  assert.ok(fs.statSync(path.join(__dirname,f)).size>100, 'arquivo critico presente: '+f);
console.log('OK: 12 testes de IA + 4 modulos intactos, sem chamadas Firebase');
