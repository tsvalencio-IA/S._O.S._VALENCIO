'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync(__dirname+'/js/exportar-pmsp.js','utf8');
const start=src.indexOf('  async function carregarModeloPMSPExportar(');
const end=src.indexOf('  function textoCelulaExportar(',start);
assert(start>0 && end>start);
const js=src.slice(start,end);
(async()=>{
  let ipcCalls=0, webCalls=0;
  const bytes=[80,75,3,4,...Array.from({length:2000},()=>0)];
  const sandbox={
    TEMPLATE_URL_PADRAO:'assets/templates/I-30003_PLANILHA_DE_CUSTOS.xlsx',
    window:{thiaDesktopAsset:{readTemplate:async path=>{
      ipcCalls++;
      assert.equal(path,'assets/templates/I-30003_PLANILHA_DE_CUSTOS.xlsx');
      return bytes;
    }}},
    fetch:async url=>{webCalls++;return {ok:true,arrayBuffer:async()=>new Uint8Array([1,2]).buffer}},
    Uint8Array,Error,console
  };
  const loader=vm.runInNewContext(js+'\ncarregarModeloPMSPExportar;',sandbox);
  const data=await loader('./assets/templates/I-30003_PLANILHA_DE_CUSTOS.xlsx');
  assert.equal(new Uint8Array(data).length,bytes.length);
  assert.deepEqual([...new Uint8Array(data).slice(0,4)],[80,75,3,4]);
  assert.equal(ipcCalls,1);
  assert.equal(webCalls,0,'Electron não deve tentar fetch(file://) para template local');
  const remote=await loader('https://example.invalid/template.xlsx');
  assert.equal(new Uint8Array(remote).length,2);
  assert.equal(webCalls,1,'Modelo personalizado remoto mantém fluxo existente');
  sandbox.window.thiaDesktopAsset=null;
  const normal=await loader('assets/templates/I-30003_PLANILHA_DE_CUSTOS.xlsx');
  assert.equal(new Uint8Array(normal).length,2);
  assert.equal(webCalls,2,'Web/Android mantêm fetch normal');
  const main=fs.readFileSync(__dirname+'/electron/main.js','utf8');
  const preload=fs.readFileSync(__dirname+'/electron/preload.js','utf8');
  assert.match(main,/ipcMain\.handle\('sos:template-pmsp'/);
  assert.match(main,/event\.sender !== mainWindow\?\.webContents/);
  assert.match(main,/String\(assetPath \|\| ''\) !== modeloPMSP/);
  assert.match(preload,/contextBridge\.exposeInMainWorld\('thiaDesktopAsset'/);
  console.log('OK: template PMSP IPC local sem fetch, template remoto e Web/Android preservados, permissões IPC mínimas');
})().catch(e=>{console.error(e);process.exitCode=1});
