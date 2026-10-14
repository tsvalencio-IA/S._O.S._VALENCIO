/* S.O.S. Valêncio — preferência de acesso e gerenciador de senhas.
 * PIN nunca é salvo pelo portal em localStorage/sessionStorage. */
(function(W,D){
'use strict';
if(W.sosPortalAccess)return;
function key(kind,tenant){return 'sos_portal_remember_v2_'+kind+'_'+(tenant||'');}
function setup({kind,tenant,loginId,pinId,checkboxId}){
  const login=D.getElementById(loginId),pin=D.getElementById(pinId),box=D.getElementById(checkboxId);
  if(!login||!pin||!box)return null;
  const storageKey=key(kind,tenant);
  try{localStorage.removeItem('thiaguinho_portal_cliente_login');localStorage.removeItem('thiaguinho_cliente_oficial_login');}catch(_){}
  try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved?.remember){box.checked=true;if(saved.login&&!login.value)login.value=saved.login;}}catch(_){}
  const urlLogin=new URLSearchParams(location.search).get('login')||new URLSearchParams(location.search).get('placa')||'';
  if(urlLogin)login.value=urlLogin;
  box.addEventListener('change',()=>{if(!box.checked){try{localStorage.removeItem(storageKey)}catch(_){}}});
  return {
    async success(){
      try{if(box.checked)localStorage.setItem(storageKey,JSON.stringify({login:login.value.trim(),remember:true}));else localStorage.removeItem(storageKey);}catch(_){}
      if(!box.checked)return;
      if(typeof W.PasswordCredential==='function'&&navigator.credentials?.store){
        try{await navigator.credentials.store(new W.PasswordCredential({id:login.value.trim(),password:pin.value,name:'S.O.S. Valêncio'}));}catch(_){}
      }
    },
    clear(){try{localStorage.removeItem(storageKey)}catch(_){}},
    async fillFromManager(){
      if(!box.checked||!navigator.credentials?.get)return false;
      try{const credential=await navigator.credentials.get({password:true,mediation:'optional'});
        if(credential?.type==='password'&&credential.id===login.value&&credential.password){pin.value=credential.password;return true;}
      }catch(_){}return false;
    }
  };
}
W.sosPortalAccess={setup};
})(window,document);
