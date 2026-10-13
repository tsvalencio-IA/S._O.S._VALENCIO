// S.O.S. VALENCIO — inicialização Windows auditável e isolada da produção.
// Não altera o Firebase, a estrutura das O.S. nem a lógica dos perfis.
'use strict';
const { app, BrowserWindow, shell, dialog } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fileURLToPath } = require('url');

const loginSmoke = process.argv.includes('--sos-smoke-login');
const smoke = loginSmoke || process.argv.includes('--sos-smoke-test');
const useGpu = process.argv.includes('--sos-enable-gpu');
const appRoot = path.resolve(__dirname, '..');
const startupTimeoutMs = loginSmoke ? 65000 : (smoke ? 25000 : 35000);

app.setName('S.O.S. VALENCIO TESTE');
app.setPath('userData', path.join(app.getPath('appData'), 'SOS-VALENCIO-HOMOLOGACAO-PC'));
// Modo conservador evita travamento provocado por alguns drivers gráficos Windows.
// Se necessário, o suporte técnico poderá testar --sos-enable-gpu.
if (process.platform === 'win32' && !useGpu) app.disableHardwareAcceleration();

function diagnostic(eventName, details) {
  // Log técnico curto, sem dados de O.S., credenciais, URLs, ou valores.
  try {
    const file = path.join(app.getPath('userData'), 'diagnostico-inicializacao.log');
    fs.mkdirSync(path.dirname(file), {recursive:true});
    // No smoke, gravar antes de app.exit(): escrita assíncrona perdia a confirmação.
    if (smoke) {
      fs.appendFileSync(file, new Date().toISOString() + '  ' + String(eventName) +
        (details ? ': ' + String(details).slice(0,180) : '') + os.EOL);
      return;
    }
    fs.stat(file, (error, st) => {
      if (!error && st.size > 196608) fs.rename(file, file+'.antigo', ()=>{});
      fs.appendFile(file, new Date().toISOString() + '  ' + String(eventName) +
        (details ? ': ' + String(details).slice(0,180) : '') + os.EOL, ()=>{});
    });
  } catch (_) {}
}
function insideApp(url) {
  try {
    if (!url.startsWith('file:')) return false;
    const target = path.resolve(fileURLToPath(url));
    const relative = path.relative(appRoot, target);
    return relative !== '..' && !relative.startsWith('..'+path.sep) && !path.isAbsolute(relative);
  } catch (_) { return false; }
}
function external(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    // Não abrir links de arquivo nem esquemas desconhecidos através do Windows.
    shell.openExternal(parsed.href).catch(()=>diagnostic('LINK_EXTERNO_FALHOU'));
    return true;
  } catch (_) { return false; }
}

let mainWindow;
function createWindow() {
  let ready = false;
  const win = new BrowserWindow({
    width:1280,height:820,minWidth:850,minHeight:580,
    show: !smoke && false,
    backgroundColor:'#060A14',
    title:'S.O.S. VALENCIO TESTE — Windows',
    autoHideMenuBar:true,
    webPreferences:{
      preload:path.join(__dirname,'preload.js'),
      nodeIntegration:false,contextIsolation:true,webSecurity:true,
      backgroundThrottling:true
    }
  });
  mainWindow = win;
  diagnostic('JANELA_CRIADA');
  if (!smoke) {
    win.once('ready-to-show',()=>{if(!win.isDestroyed()) win.show();});
    setTimeout(()=>{if(!win.isDestroyed() && !win.isVisible()) win.show();},7000).unref();
  }
  win.webContents.setWindowOpenHandler(({url})=>{
    external(url);
    return {action:'deny'};
  });
  win.webContents.on('will-navigate',(event,url)=>{
    if (insideApp(url)) return;
    event.preventDefault();
    external(url);
  });
  win.webContents.on('render-process-gone',(_event,details)=>{
    diagnostic('RENDERER_ENCERRADO',details?.reason||'unknown');
    if(smoke) app.exit(22);
    else if(!win.isDestroyed()) {
      dialog.showMessageBox(win,{type:'warning',title:'S.O.S. VALENCIO — Falha',
        message:'A janela foi interrompida. Feche o aplicativo e informe o suporte.',
        detail:'O relatório técnico está na pasta de dados do aplicativo.'}).catch(()=>{});
    }
  });
  win.webContents.on('unresponsive',()=>{
    diagnostic('JANELA_SEM_RESPOSTA');
    if (smoke) app.exit(23);
    else if(!win.isDestroyed()) win.setTitle('S.O.S. VALENCIO TESTE — Sem resposta');
  });
  win.webContents.on('did-fail-load',(_event,code,_desc,url,isMainFrame)=>{
    if(!isMainFrame) return;
    diagnostic('PAGINA_NAO_CARREGOU',String(code));
    if(smoke) app.exit(24);
  });
  win.on('closed',()=>{if(mainWindow===win) mainWindow=null;});
  const page=path.join(appRoot,'selecionar-perfil.html');
  diagnostic('CARREGANDO_SELECAO');
  const load=win.loadFile(page).then(async()=>{
    ready=true;
    diagnostic('TELA_INICIAL_CARREGADA');
    if (!smoke) return;
    const info=await win.webContents.executeJavaScript(
      "({title:document.title, cards:document.querySelectorAll('.profile-card').length, profiles:Array.from(document.querySelectorAll('.profile-name')).map(el=>el.textContent.trim())})"
    );
    if(info.cards!==5 || !info.title.includes('thIAguinho')) throw new Error('Perfis indisponíveis');
    diagnostic('SMOKE_PERFIS_APROVADO','cinco perfis renderizados');
    if (loginSmoke) {
      // Validar a segunda tela do aplicativo REAL, com Firebase compat carregado,
      // sem autenticar e sem ler/escrever documentos de produção.
      diagnostic('LOGIN_CARREGANDO');
      await win.loadFile(path.join(appRoot,'index.html'));
      const login = await win.webContents.executeJavaScript(`({
        form: !!document.getElementById('loginForm'),
        user: !!document.getElementById('usr'),
        pwd: !!document.getElementById('pwd'),
        functionReady: typeof window.autenticar === 'function',
        firebaseLoaded: !!window.firebase && typeof window.firebase.firestore === 'function' &&
          typeof window.firebase.auth === 'function',
        firebaseApps: window.firebase?.apps?.length || 0,
        page: location.pathname
      })`);
      if (!login.form || !login.user || !login.pwd || !login.functionReady ||
          !login.firebaseLoaded || !login.firebaseApps ||
          !String(login.page).endsWith('/index.html')) {
        throw new Error('Login ou Firebase nao carregou corretamente');
      }
      diagnostic('SMOKE_LOGIN_APROVADO','login e bibliotecas Firebase carregados');
    }
    diagnostic('SMOKE_APROVADO',loginSmoke ? 'cinco perfis e login validados' : 'cinco perfis renderizados');
    app.exit(0);
  }).catch((erro)=>{
    diagnostic('ERRO_ABERTURA_TELA', String(erro?.message || erro || 'erro desconhecido').replace(/[\r\n]+/g,' ').slice(0,120));
    if (smoke) app.exit(25);
    else if(!win.isDestroyed()) {
      win.show();
      dialog.showMessageBox(win,{type:'error',message:'Não foi possível abrir a tela inicial.',detail:'Consulte diagnostico-inicializacao.log na pasta do aplicativo.'}).catch(()=>{});
    }
  });
  if(smoke) setTimeout(()=>{
    if (!ready) diagnostic('SMOKE_TIMEOUT');
    app.exit(ready?26:27);
  },startupTimeoutMs).unref();
  return load;
}
if(!smoke && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  if(!smoke) app.on('second-instance',()=>{
    if(!mainWindow || mainWindow.isDestroyed()) return;
    if(mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(createWindow).catch(()=>{
    diagnostic('ELECTRON_READY_FALHOU');
    app.exit(28);
  });
  app.on('window-all-closed',()=>{if(process.platform!=='darwin') app.quit();});
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
}
