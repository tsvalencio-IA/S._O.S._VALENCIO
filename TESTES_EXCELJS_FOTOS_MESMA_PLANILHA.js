'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ExcelJS = require(process.env.EXCELJS_MODULE || 'exceljs');
(async () => {
  const source = fs.readFileSync(path.join(__dirname,'js/exportar-pmsp.js'),'utf8');
  const start = source.indexOf('  async function inserirFotosDaOSExcelJS(');
  const end = source.indexOf('  async function exportarComposicaoExcelJS(',start);
  assert.ok(start>=0 && end>start);
  const helperCode = source.slice(start,end).trim();
  const evidencias = [
    ...Array.from({length:13},(_,i)=>({url:'https://exemplo.com/foto'+i+'.jpg',type:'image',descricao:'Motor foto '+(i+1),origem:'OS'})),
    {url:'https://exemplo.com/video.mp4',type:'video',descricao:'Test drive'}
  ];
  const dummyPng='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/tAAAAABJRU5ErkJggg==';
  class TestImage {
    set src(v) { this.naturalWidth=480;this.naturalHeight=320; if(this.onload) this.onload(); }
  }
  const context={
    window:{thiaEvidenciasOS:{coletar:()=>evidencias}},
    document:{getElementById:()=>null},
    Image:TestImage,
    console,
    imagemUrlParaDataURLAssinatura:async()=>({base64:dummyPng,extension:'png'})
  };
  const helper=vm.runInNewContext(helperCode+'\ninserirFotosDaOSExcelJS;',context,{timeout:8000});
  const templatePath=path.join(__dirname,'assets/templates/I-30003_PLANILHA_DE_CUSTOS.xlsx');
  const workbook=new ExcelJS.Workbook();
  await workbook.xlsx.load(fs.readFileSync(templatePath));
  const sheet=workbook.worksheets[0];
  const countBefore=workbook.worksheets.length;
  const originalCell=JSON.stringify(sheet.getCell('B1').value);
  const originalColB=sheet.getColumn('B').width;
  const baseRow=Math.max(150,sheet.rowCount+3);
  const result=await helper(workbook,sheet,{id:'OS-123'},baseRow);
  assert.equal(workbook.worksheets.length,countBefore,'NÃO criar outra aba');
  assert.equal(result.total,13);
  assert.equal(result.indisponiveis.length,0);
  assert.equal(sheet.getImages().length,13,'13 fotos incorporadas na primeira planilha');
  assert.equal(JSON.stringify(sheet.getCell('B1').value),originalCell,'não alterar cabeçalho');
  assert.equal(sheet.getColumn('B').width,originalColB,'não alterar colunas PMSP');
  const first=baseRow+2+3;
  assert.match(String(sheet.getCell('E'+first).value),/FOTO 1 \/ 13/);
  assert.match(String(sheet.getCell('E'+first).value),/Motor foto 1/);
  assert.equal(sheet.getCell('E'+(first+6)).value.hyperlink,'https://exemplo.com/foto0.jpg');
  assert.equal(sheet.getCell('E'+(first+9)).value,null,'cartões não se sobrepõem');
  sheet.pageSetup.printArea='A1:H'+result.ultimaLinha;
  const output=await workbook.xlsx.writeBuffer();
  assert.ok(output.length>20000,'Workbook com dados e imagens');
  const reload=new ExcelJS.Workbook();
  await reload.xlsx.load(output);
  assert.equal(reload.worksheets.length,countBefore,'XLSX lido preserva número de abas');
  assert.equal(reload.worksheets[0].getImages().length,13,'XLSX salvo preserva 13 imagens');
  assert.equal(reload.worksheets[0].pageSetup.printArea,'A1:H'+result.ultimaLinha);
  console.log('OK: template PMSP real, 13 fotos e 1 video, mesma aba, links, células e XLSX reimportado.');
})().catch(e=>{console.error(e);process.exit(1);});
