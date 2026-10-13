'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'js/ia.js'),'utf8');
function consultar(pergunta,os,equipe,clientes,linhas,perfil='admin'){
 const J={tid:'TESTE_SEM_FIREBASE',role:perfil,equipe,clientes,os,veiculos:[],financeiro:[]};
 const W={J,location:{pathname:'/jarvis.html'},thiaComissoesResumoV26:id=>({linhas:linhas.filter(x=>x.mecId===id)})};
 const sandbox={window:W,document:{addEventListener(){},getElementById(){return null}},location:W.location,console,sessionStorage:{getItem(){return null}},setTimeout(){},clearTimeout(){},navigator:{}};
 vm.createContext(sandbox);vm.runInContext(source,sandbox,{filename:'js/ia.js',timeout:7000});
 return W.thiaResponderLocal(pergunta,{perfil,J});
}
const equipe=[{id:'t',nome:'Thalis',comissao:50},{id:'m',nome:'Murilo',comissao:50}];
const clientes=[{id:'of',nome:'Polícia Militar',tipoCliente:'governo'},{id:'c',nome:'Cliente comum',tipoCliente:'comum'}];
const viatura={id:'of-os',numero:'JFUQ4R',clienteId:'of',placa:'EPX9844',veiculo:'Gol',kmEntrada:95757,status:'Orcamento',mecId:'m',
 comissaoOficialOS:{ativa:true,rateios:[{mecId:'t',valor:700,atribuidoEm:'2026-09-30'}]},servicos:[{desc:'PINTAR CAPUZ',mecId:'m',valor:518.89}]};
const comum={id:'c-os',numero:'ABC01',clienteId:'c',placa:'ABC1234',veiculo:'Uno',status:'Entregue',finalizadoEm:'2026-10-08',mecId:'m',
 servicos:[{desc:'MOTOR',mecId:'m',valor:1000,rateiosComissao:[{mecId:'m',valorBase:500}]},{desc:'RETIFICA TERCEIRIZADA',mecId:'m',valor:900,tipoExecucao:'terceirizada'}]};
const linhas=[{mecId:'t',osId:'of-os',servicoKey:'oficial-viatura',comissaoOficial:true,base:700,previsto:700,pago:200},
 {mecId:'m',osId:'c-os',servicoKey:'servico-0',base:500,previsto:250,pago:100},
 {mecId:'m',osId:'c-os',servicoKey:'servico-1',base:900,previsto:450,pago:0}];
const perguntaT='atendimento mecanico Thalis 28/09/2026 ate 10/10/2026';
const perguntaM='atendimento mecanico Murilo 01/10/2026 ate 10/10/2026';
const rt=consultar(perguntaT,[viatura,comum],equipe,clientes,linhas);
assert.match(rt,/EPX9844/);assert.match(rt,/VIATURA OFICIAL/);assert.match(rt,/700,00/);assert.match(rt,/500,00/);
assert.doesNotMatch(rt,/PINTAR CAPUZ|518,89|RETIFICA TERCEIRIZADA/);
const rm=consultar(perguntaM,[viatura,comum],equipe,clientes,linhas);
assert.match(rm,/ABC1234/);assert.match(rm,/Parte atribuída/);assert.match(rm,/500,00/);assert.match(rm,/250,00/);assert.match(rm,/150,00/);
assert.doesNotMatch(rm,/EPX9844|RETIFICA TERCEIRIZADA|MOTOR/);
assert.doesNotMatch(consultar(perguntaT,[{...viatura,comissaoOficialOS:{ativa:false,rateios:[]}}],equipe,clientes,linhas),/EPX9844/);
assert.doesNotMatch(consultar(perguntaM,[{...comum,status:'Cancelado'}],equipe,clientes,linhas),/ABC1234/);
assert.doesNotMatch(consultar(perguntaM,[comum],equipe,clientes,linhas,'mecanico'),/250,00|150,00/);
for(const f of ['js/cilia.js','js/cilia-api.js','js/tabela-tempa.js','js/exportar-pmsp.js'])
 assert.ok(fs.statSync(path.join(__dirname,f)).size>100,'arquivo protegido: '+f);
console.log('OK: viatura R$700 integral, comum 50%, terceiro excluido, pagos parciais, sigilo e O.S. cancelada; sem Firebase');