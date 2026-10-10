'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const W={};
const env={window:W,document:{addEventListener:()=>{},getElementById:()=>null},
sessionStorage:{getItem:()=>null},console};
vm.createContext(env);
vm.runInContext(fs.readFileSync(__dirname+'/js/core.js','utf8'),env,{filename:'js/core.js',timeout:5000});
const P=W.PERM;
assert.equal(P.moverStatus('mecanico'),false,'mecanico nao altera status');
assert.equal(P.moverStatus('admin'),true,'admin pode alterar');
assert.equal(P.moverStatus('gestor'),true,'gestor pode alterar');
assert.equal(P.moverStatus('atendente'),true,'atendente pode alterar conforme politica anterior');
assert.equal(P.verFinanceiro('mecanico'),false);
assert.equal(P.verFinanceiro('admin'),true);
assert.equal(P.editarOS('mecanico'),false);
assert.equal(P.adicionarLog('mecanico'),true);
console.log('OK: 8 testes de permissoes na interface. Firestore de producao nao acessado.');
