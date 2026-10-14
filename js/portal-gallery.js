/* S.O.S. Valêncio — carrossel de evidências na própria página do portal.
 * Exibe apenas mídias já obtidas pela O.S. autorizada; nenhuma gravação. */
(function (W, D) {
  'use strict';
  if (W.sosPortalGallery) return;
  const collections = new Map();
  let selected = [], index = 0, isOpen = false, modal, mediaArea, countArea, captionArea;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function normalize(os) {
    const list = W.thiaEvidenciasOS && typeof W.thiaEvidenciasOS.coletar === 'function'
      ? W.thiaEvidenciasOS.coletar(os) : [...(Array.isArray(os?.fotos) ? os.fotos : []), ...(Array.isArray(os?.media) ? os.media : [])];
    const found = new Set();
    return list.map(item => {
      const raw = typeof item === 'string' ? { url: item } : (item || {});
      const url = String(raw.url || raw.secure_url || raw.fotoUrl || '').trim();
      if (!/^https:\/\//i.test(url) || found.has(url)) return null;
      found.add(url);
      const kind = String(raw.type || raw.tipo || raw.resource_type || '').toLowerCase();
      return {url, video: /video/.test(kind) || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url),
        caption: String(raw.descricao || raw.legenda || raw.obs || raw.observacao || '').slice(0, 250)};
    }).filter(Boolean);
  }
  function render(os) {
    const list = normalize(os);
    if (!list.length) return '';
    const key = String(os?.id || 'os') + '-' + Math.random().toString(36).slice(2, 8);
    collections.set(key, list);
    return '<div class="sos-portal-evidences"><div class="sos-portal-evidence-label">Evidências — Fotos e vídeos ('+list.length+')</div><div class="sos-portal-thumbs">' + list.map((item,i) =>
      '<button type="button" class="sos-portal-thumb" data-sos-gallery="'+esc(key)+'" data-sos-index="'+i+'" aria-label="Abrir '+(item.video?'vídeo':'foto')+' '+(i+1)+' de '+list.length+'">' +
      (item.video ? '<span class="sos-portal-video-thumb">▶<small>VÍDEO</small></span>' : '<img src="'+esc(item.url)+'" alt="Foto '+(i+1)+'" loading="lazy">') + '</button>').join('') + '</div></div>';
  }
  function ensure() {
    if (modal) return;
    const style = D.createElement('style');
    style.id = 'sos-portal-gallery-css';
    style.textContent = '.sos-portal-evidences{margin:15px 0}.sos-portal-evidence-label{font-size:.75rem;letter-spacing:.7px;opacity:.8;margin-bottom:9px}.sos-portal-thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(85px,1fr));gap:9px}.sos-portal-thumb{height:100px;min-width:0;cursor:pointer;padding:0;border:1px solid #407397;border-radius:9px;background:#0a1a31;overflow:hidden}.sos-portal-thumb img{width:100%;height:100%;object-fit:cover}.sos-portal-video-thumb{display:flex;height:100%;align-items:center;justify-content:center;flex-direction:column;color:#fff;font-size:30px}.sos-portal-video-thumb small{font-size:10px;margin-top:5px}.sos-portal-gallery{position:fixed;z-index:2147483640;inset:0;background:rgba(2,9,23,.98);color:white;display:flex;flex-direction:column;align-items:stretch;overscroll-behavior:contain}.sos-portal-gallery[hidden]{display:none!important}.sos-portal-gallery-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:calc(env(safe-area-inset-top,0px) + 8px) 12px 8px}.sos-portal-gallery-btn{font-size:16px;border:1px solid #537aa2;background:#112d50;color:white;border-radius:8px;padding:9px 13px;min-height:42px;cursor:pointer}.sos-portal-gallery-stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;position:relative;overflow:auto;touch-action:pan-y}.sos-portal-gallery-media{width:100%;height:100%;display:flex;align-items:center;justify-content:center}.sos-portal-gallery-media img,.sos-portal-gallery-media video{max-width:100%;max-height:100%;object-fit:contain}.sos-portal-gallery-media.zoomed img{max-width:none;max-height:none;width:auto;height:auto;transform:scale(1.7);transform-origin:center;cursor:zoom-out}.sos-portal-gallery-caption{text-align:center;padding:10px;font-size:13px;max-height:85px;overflow:auto}.sos-portal-gallery-bottom{display:flex;justify-content:center;gap:10px;padding:9px 10px calc(env(safe-area-inset-bottom,0px) + 9px)}.sos-portal-gallery-bottom button{min-width:80px}.sos-portal-gallery-btn:focus-visible{outline:2px solid #e8c46d}';
    D.head.appendChild(style);
    modal = D.createElement('div'); modal.hidden = true; modal.className = 'sos-portal-gallery';
    modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true'); modal.setAttribute('aria-label','Galeria de evidências da OS');
    modal.innerHTML = '<div class="sos-portal-gallery-bar"><button type="button" class="sos-portal-gallery-btn" data-gallery-action="close">✕ Fechar</button><span data-gallery-count></span><button type="button" class="sos-portal-gallery-btn" data-gallery-action="fullscreen">⛶ Ampliar</button></div><div class="sos-portal-gallery-stage" data-gallery-stage><div class="sos-portal-gallery-media" data-gallery-media></div></div><div class="sos-portal-gallery-caption" data-gallery-caption></div><div class="sos-portal-gallery-bottom"><button type="button" class="sos-portal-gallery-btn" data-gallery-action="prev">❮ Anterior</button><button type="button" class="sos-portal-gallery-btn" data-gallery-action="zoom">＋ Zoom</button><button type="button" class="sos-portal-gallery-btn" data-gallery-action="next">Próximo ❯</button></div>';
    D.body.appendChild(modal);
    mediaArea=modal.querySelector('[data-gallery-media]'); countArea=modal.querySelector('[data-gallery-count]'); captionArea=modal.querySelector('[data-gallery-caption]');
    modal.addEventListener('click', e => {const a=e.target.closest('[data-gallery-action]')?.dataset.galleryAction;if(a==='close') close();if(a==='prev') step(-1);if(a==='next') step(1);if(a==='zoom') mediaArea.classList.toggle('zoomed');if(a==='fullscreen') {if(!D.fullscreenElement)modal.requestFullscreen?.().catch(()=>{});else D.exitFullscreen?.().catch(()=>{});}});
    let touchX=null,touchY=null;
    modal.querySelector('[data-gallery-stage]').addEventListener('touchstart',e=>{if(e.touches.length===1){touchX=e.touches[0].clientX;touchY=e.touches[0].clientY;}},{passive:true});
    modal.querySelector('[data-gallery-stage]').addEventListener('touchend',e=>{if(touchX===null)return;const dx=e.changedTouches[0].clientX-touchX,dy=e.changedTouches[0].clientY-touchY;touchX=null; if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.3)step(dx<0?1:-1);},{passive:true});
  }
  function show() {
    const m=selected[index]; if(!m)return;
    mediaArea.replaceChildren(); mediaArea.classList.remove('zoomed');
    const el=D.createElement(m.video?'video':'img'); el.src=m.url;
    if(m.video){el.controls=true;el.playsInline=true;el.preload='metadata';}
    else {el.alt='Foto '+(index+1)+' de '+selected.length;el.addEventListener('dblclick',()=>mediaArea.classList.toggle('zoomed'));}
    mediaArea.appendChild(el); countArea.textContent=(index+1)+' / '+selected.length;captionArea.textContent=m.caption || '';
  }
  function openGallery(key,i) {
    const list=collections.get(key); if(!list?.length)return;
    ensure();selected=list;index=Math.max(0,Math.min(list.length-1,Number(i)||0));isOpen=true;
    modal.hidden=false;D.body.style.overflow='hidden';show();
    try {history.pushState({sosGallery:true},'',location.href);}catch(_){}
    modal.querySelector('[data-gallery-action="close"]').focus({preventScroll:true});
  }
  function openSingle(url) {
    if(!/^https:\/\//i.test(String(url||'')))return;
    const key='single-'+Math.random().toString(36).slice(2);
    collections.set(key,[{url,video:/\.(mp4|webm)(\?|$)/i.test(url),caption:''}]);openGallery(key,0);
  }
  function step(n) {if(!isOpen||!selected.length)return;index=(index+n+selected.length)%selected.length;show();}
  function hide() {if(!isOpen)return;isOpen=false;if(mediaArea)mediaArea.replaceChildren();if(modal)modal.hidden=true;D.body.style.overflow='';if(D.fullscreenElement)D.exitFullscreen?.().catch(()=>{});}
  function close() {const wasState=history.state?.sosGallery;hide();if(wasState)history.back();}
  D.addEventListener('click',e=>{const el=e.target.closest('[data-sos-gallery]');if(!el)return;e.preventDefault();openGallery(el.dataset.sosGallery,el.dataset.sosIndex);});
  W.addEventListener('popstate',()=>{if(isOpen)hide();});
  D.addEventListener('keydown',e=>{if(!isOpen)return;if(e.key==='Escape'){e.preventDefault();close();}else if(e.key==='ArrowLeft'){e.preventDefault();step(-1);}else if(e.key==='ArrowRight'){e.preventDefault();step(1);}});
  W.sosPortalGallery={render,normalize,openSingle,close,isOpen:()=>isOpen};
})(window,document);
