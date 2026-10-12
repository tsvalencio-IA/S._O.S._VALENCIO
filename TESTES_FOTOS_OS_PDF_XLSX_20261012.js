'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read = p => fs.readFileSync(path.join(__dirname,p),'utf8');
const W={};
const ctx={window:W, console};
vm.createContext(ctx);
vm.runInContext(read('js/os-evidencias-export.js'),ctx,{filename:'js/os-evidencias-export.js'});
const galeria = Array.from({length:15},(_,i)=>({
  url:'https://res.cloudinary.com/test/image/upload/foto'+(i+1)+'.jpg',
  type:'image',
  descricao:i===0?'Desmontagem do motor':'',
  uploadedAt:'2026-09-28T10:00:00Z'
}));
const os={
  id:'OS001',
  media:galeria,
  fotos:[galeria[0].url,{url:'https://res.cloudinary.com/test/video/upload/gravacao.mp4',type:'video',descricao:'Vídeo do reparo'}],
  checklistResumo:{
    fotoUrls:['https://res.cloudinary.com/test/image/upload/checklist_geral.jpg'],
    itens:[{item:'Correia',fotoUrls:['https://res.cloudinary.com/test/image/upload/checklist_correia.jpg']}]
  }
};
const mediaAtual=[{...galeria[1],descricao:'Cabeçote desmontado'}];
const todas=W.thiaEvidenciasOS.coletar(os,{mediaAtual});
const fotos=W.thiaEvidenciasOS.fotos(os,{mediaAtual});
assert.equal(fotos.length,17,'15 fotos da OS + 2 do checklist');
assert.equal(todas.length,18,'15 fotos + 2 checklist + 1 vídeo');
assert.equal(fotos[0].descricao,'Desmontagem do motor','primeira legenda');
assert.equal(fotos[1].descricao,'Cabeçote desmontado','legenda atualizada antes de salvar');
assert.equal(fotos.filter(m=>m.url===galeria[0].url).length,1,'sem duplicar URL de galeria legada');
assert.equal(todas.filter(m=>m.type==='video').length,1,'vídeo não conta como foto');
assert.equal(todas.find(m=>m.url.includes('checklist_correia')).descricao,'Correia','origem de item checklist');
assert.equal(fotos.at(-1).origem,'Checklist técnico');
assert.equal(W.thiaEvidenciasOS.coletar({id:'vazio'}).length,0,'OS sem mídia');
assert.equal(W.thiaEvidenciasOS.coletar({media:['javascript:alert(1)','https://exemplo.com/foto.jpg']}).length,1,'URL insegura excluída');
const core=read('js/os.js');
const pdf=core.slice(core.indexOf('window.gerarPDFOS = async function'),core.indexOf('const assinaturaPDF = ',core.indexOf('window.gerarPDFOS = async function')));
assert.ok(pdf.includes('const imagens = media.filter'),'gerador de PDF real usa a galeria completa');
assert.ok(!/\.slice\(\s*0,\s*12\s*\)/.test(pdf),'PDF sem limite de 12 fotos');
assert.ok(pdf.includes('window.thiaEvidenciasOS.coletar'),'PDF reúne fontes');
assert.ok(pdf.includes('const descricao = String(m.descricao'),'legenda nas fotos');
assert.ok(pdf.includes('REGISTRO CRONOLÓGICO DAS EVIDÊNCIAS'),'índice mantido');
assert.ok(core.includes('window.atualizarDescricaoMidiaOS'),'legenda gravável');
assert.ok(core.includes('item.descricao = String(descricao'),'persistência campo descricao');
const excel=read('js/exportar-pmsp.js');
assert.ok(excel.includes("wb.addWorksheet('FOTOS DA OS')"),'aba específica da OS');
assert.ok(excel.includes('wb.addImage({base64:fotoXlsx.base64'),'foto embutida no ExcelJS');
assert.ok(excel.includes("hyperlink:url"),'link original caso imagem falhe');
assert.ok(excel.includes('await inserirFotosDaOSExcelJS(wb, os);'),'exportação agrupada inclui fotos');
assert.ok(excel.includes('inserirComposicaoOS(ws, 18, linhasPecas, linhasServ'),'cálculos e peças preservados');
const jarvis=read('jarvis.html');
assert.ok(jarvis.indexOf('js/os-evidencias-export.js')<jarvis.indexOf('js/os.js'),'helper carrega primeiro');
assert.ok(jarvis.includes('js/os.js?v=26.25.0'),'cache atualizado');
const oficial=read('clienteOficial.html');
assert.ok(oficial.includes('window.thiaEvidenciasOS.fotos(os)'),'portal oficial usa fotos sem duplicidade');
for (const f of ['js/cilia.js','js/cilia-api.js','js/tabela-tempa.js','js/exportar-pmsp.js']) assert.ok(fs.statSync(path.join(__dirname,f)).size>100);
console.log('OK: 22 verificações de legendas, 17 fotos, checklist, PDF sem limite, XLSX com imagens e links.');
