/* S.O.S. VALÊNCIO — Ditado universal nos campos textuais de JARVIS e Equipe. Não salva dados automaticamente. */
(function(W,D){
'use strict';
if(W.__sosAllFieldsVoiceInstalled)return;
W.__sosAllFieldsVoiceInstalled=true;
const allowed=new Set(['text','search','tel','email','url','number','date','time','datetime-local','month']);
let active=null,busy=false,button,notice,oldPadding;
function eligible(node){
  const el=node?.closest?.('input,textarea,[contenteditable="true"]');
  if(!el||el.disabled||el.readOnly||el.closest('[inert]')||el.matches('[type="password"],[type="hidden"],[data-sos-voice="off"]'))return null;
  if(el.isContentEditable)return el;
  if(el.tagName==='TEXTAREA')return el;
  return el.tagName==='INPUT'&&allowed.has((el.getAttribute('type')||'text').toLowerCase())?el:null;
}
function visible(el){
  if(!el?.isConnected||!el.getClientRects().length)return false;
  const r=el.getBoundingClientRect(),s=getComputedStyle(el);
  return s.display!=='none'&&s.visibility!=='hidden'&&r.width>35&&r.height>12;
}
function status(message,isError){
  if(!notice)return;
  notice.textContent=message||'';
  notice.style.display=message?'block':'none';
  notice.style.borderColor=isError?'#d45b5b':'#5c9cde';
  if(message)setTimeout(()=>{if(notice.textContent===message)notice.style.display='none'},4500);
}
function prepare(){
  if(button)return;
  const style=D.createElement('style');
  style.id='sos-voice-every-field-css';
  style.textContent='.sos-field-mic{position:fixed!important;z-index:2147483000!important;display:none;width:34px;height:34px;align-items:center;justify-content:center;padding:0!important;border:1px solid rgba(124,187,239,.8)!important;border-radius:9px!important;background:#102b49!important;color:#fff!important;font-size:18px!important;line-height:1!important;box-shadow:0 2px 9px #0009!important;touch-action:manipulation!important;cursor:pointer!important}.sos-field-mic:focus-visible{outline:2px solid #e9b751}.sos-field-mic[disabled]{opacity:.65}.sos-field-voice-note{position:fixed;z-index:2147483001;max-width:min(90vw,370px);padding:8px 12px;border:1px solid #5c9cde;border-radius:8px;background:#09203c;color:#fff;font:13px system-ui;box-shadow:0 4px 18px #0008;display:none;bottom:calc(env(safe-area-inset-bottom,0px) + 14px);left:12px}';
  D.head.appendChild(style);
  button=D.createElement('button');
  button.type='button';
  button.className='sos-field-mic';
  button.textContent='🎙';
  button.title='Falar para preencher este campo';
  button.setAttribute('aria-label','Ditar neste campo');
  button.addEventListener('pointerdown',e=>e.preventDefault());
  button.addEventListener('mousedown',e=>e.preventDefault());
  button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();start()});
  D.body.appendChild(button);
  notice=D.createElement('div');
  notice.className='sos-field-voice-note';
  notice.setAttribute('role','status');
  notice.setAttribute('aria-live','polite');
  D.body.appendChild(notice);
}
function restorePadding(){
  if(active&&oldPadding!==undefined&&active.isConnected)active.style.paddingRight=oldPadding;
  oldPadding=undefined;
}
function position(){
  if(!button)return;
  if(!active||!visible(active)){button.style.display='none';return}
  const r=active.getBoundingClientRect(),height=Math.min(34,Math.max(26,r.height-4));
  const vh=W.visualViewport?.height||W.innerHeight;
  if(r.bottom<0||r.top>vh){button.style.display='none';return}
  button.style.height=height+'px';
  button.style.width=height+'px';
  button.style.left=Math.max(1,Math.min(W.innerWidth-height-2,r.right-height-4))+'px';
  button.style.top=Math.max(1,r.top+Math.min(4,(r.height-height)/2))+'px';
  button.style.display='flex';
}
function setActive(field){
  if(!field||!visible(field))return;
  prepare();
  if(field!==active){
    restorePadding();
    active=field;
    oldPadding=field.style.paddingRight;
    const p=parseFloat(getComputedStyle(field).paddingRight)||0;
    if(p<38)field.style.paddingRight='40px';
  }
  position();
}
function parseDate(text,type){
  const s=text.trim();let m;
  if(type==='date'&&(m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/))){
    const d=m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
    const dt=new Date(d+'T12:00:00');
    return Number.isFinite(dt.getTime())&&dt.getFullYear()===+m[3]&&dt.getMonth()+1===+m[2]&&dt.getDate()===+m[1]?d:null;
  }
  if(type==='time'&&(m=s.match(/^(\d{1,2})[:h](\d{2})$/i))){
    return +m[1]<24&&+m[2]<60?m[1].padStart(2,'0')+':'+m[2]:null;
  }
  if(type==='month'&&(m=s.match(/^(\d{1,2})[\/\-.](\d{4})$/))){
    return +m[1]>=1&&+m[1]<=12?m[2]+'-'+m[1].padStart(2,'0'):null;
  }
  if(type==='datetime-local'&&(m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\s+(\d{1,2})[:h](\d{2})$/i))){
    const dt=parseDate(m[1]+'/'+m[2]+'/'+m[3],'date'),tm=parseDate(m[4]+':'+m[5],'time');
    return dt&&tm?dt+'T'+tm:null;
  }
  return null;
}
function writeTranscript(field,phrase){
  if(!field?.isConnected||!phrase)return false;
  const type=(field.getAttribute('type')||'text').toLowerCase();
  if(['date','month','time','datetime-local'].includes(type)){
    const iso=parseDate(phrase,type);
    if(!iso){status('Data ou hora não reconhecida no formato esperado. Nada foi alterado.',true);return false}
    field.value=iso;
  }else if(type==='number'){
    const normalized=phrase.replace(/\s/g,'').replace(/,/g,'.');
    if(!/^-?\d+(?:\.\d+)?$/.test(normalized)){status('Dite os algarismos do número. Nada foi alterado.',true);return false}
    field.value=normalized;
  }else if(field.isContentEditable){
    field.focus({preventScroll:true});
    const current=field.textContent||'';
    field.textContent=current+(current&&!/\s$/.test(current)?' ':'')+phrase;
  }else{
    const val=field.value||'',canSelect=typeof field.selectionStart==='number';
    const start=canSelect?field.selectionStart:val.length,end=canSelect?field.selectionEnd:val.length;
    const before=val.slice(0,start),after=val.slice(end),sep=before&&!/\s$/.test(before)?' ':'';
    field.value=before+sep+phrase+after;
    try{field.setSelectionRange(start+sep.length+phrase.length,start+sep.length+phrase.length)}catch(_){}
  }
  field.dispatchEvent(new Event('input',{bubbles:true}));
  return true;
}
async function start(){
  if(!active||busy)return;
  const field=active;
  busy=true;button.disabled=true;button.textContent='⏳';
  try{
    let spoken;
    if(W.sosNativeSpeech?.available()){
      spoken=await W.sosNativeSpeech.listen();
    }else{
      const Recognition=W.SpeechRecognition||W.webkitSpeechRecognition;
      if(!Recognition)throw Error('Ditado indisponível neste navegador. No Android, instale o APK atualizado.');
      spoken=await new Promise((resolve,reject)=>{
        const rec=new Recognition();
        rec.lang='pt-BR';rec.continuous=false;rec.interimResults=false;
        rec.onresult=e=>resolve(e.results[0][0].transcript);
        rec.onerror=e=>reject(Error(e.error||'Falha no reconhecimento'));
        rec.onnomatch=()=>reject(Error('Fala não reconhecida'));
        try{rec.start()}catch(e){reject(e)}
      });
    }
    if(writeTranscript(field,String(spoken||'').trim()))status('Texto inserido. Confira antes de salvar.');
  }catch(e){
    if(!/cancelled|cancelado|canceled|aborted/i.test(String(e?.code||'')+' '+String(e?.message||'')))
      status('Microfone: '+String(e?.message||e),true);
  }finally{
    busy=false;button.disabled=false;button.textContent='🎙';
    if(field.isConnected){active=field;position()}
  }
}
function init(){
  prepare();
  D.addEventListener('focusin',e=>{
    const el=eligible(e.target);
    if(el)setActive(el);
    else if(!busy){restorePadding();active=null;position()}
  },true);
  D.addEventListener('focusout',e=>{
    if(e.target===active&&!busy)setTimeout(()=>{
      if(D.activeElement!==active&&!busy){restorePadding();active=null;position()}
    },180);
  },true);
  D.addEventListener('scroll',position,true);
  W.addEventListener('resize',position);
  W.visualViewport?.addEventListener('resize',position);
  W.visualViewport?.addEventListener('scroll',position);
  D.addEventListener('click',e=>{const f=eligible(e.target);if(f)setActive(f)},true);
  if(eligible(D.activeElement))setActive(eligible(D.activeElement));
  W.sosAllFieldsVoice={version:'1.0.0',eligible,writeTranscript,getActive:()=>active};
}
if(D.readyState==='loading')D.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})(window,document);
