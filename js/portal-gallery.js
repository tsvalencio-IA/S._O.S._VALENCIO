/* S.O.S. Valêncio — carrossel de evidências na própria página do portal.
 * Exibe apenas mídias já obtidas pela O.S. autorizada; nenhuma gravação. */
(function (W, D) {
  'use strict';
  if (W.sosPortalGallery) return;
  const collections = new Map();
  let selected = [], index = 0, isOpen = false, modal, mediaArea, countArea, captionArea;
  let stage, scale = 1, panX = 0, panY = 0, savedBodyOverflow = '';
  let pointers = new Map(), dragStart = null, lastDistance = 0, pinched = false, lastTapTime = 0;
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
  function installStyles() {
    if (D.getElementById('sos-portal-gallery-css')) return;
    const style = D.createElement('style');
    style.id = 'sos-portal-gallery-css';
    style.textContent = '.sos-portal-evidences{margin:15px 0}.sos-portal-evidence-label{font-size:.75rem;letter-spacing:.7px;opacity:.8;margin-bottom:9px}.sos-portal-thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(85px,1fr));gap:9px}.sos-portal-thumb{height:100px;min-width:0;cursor:pointer;padding:0;border:1px solid #407397;border-radius:9px;background:#0a1a31;overflow:hidden}.sos-portal-thumb img{width:100%;height:100%;object-fit:cover}.sos-portal-video-thumb{display:flex;height:100%;align-items:center;justify-content:center;flex-direction:column;color:#fff;font-size:30px}.sos-portal-video-thumb small{font-size:10px;margin-top:5px}.sos-portal-gallery{position:fixed;z-index:2147483640;inset:0;background:rgba(2,9,23,.98);color:white;display:flex;flex-direction:column;align-items:stretch;overscroll-behavior:contain}.sos-portal-gallery[hidden]{display:none!important}.sos-portal-gallery-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:calc(env(safe-area-inset-top,0px) + 8px) 12px 8px}.sos-portal-gallery-btn{font-size:16px;border:1px solid #537aa2;background:#112d50;color:white;border-radius:8px;padding:9px 13px;min-height:42px;cursor:pointer}.sos-portal-gallery-stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;position:relative;overflow:auto;touch-action:pan-y}.sos-portal-gallery-media{width:100%;height:100%;display:flex;align-items:center;justify-content:center}.sos-portal-gallery-media img,.sos-portal-gallery-media video{max-width:100%;max-height:100%;object-fit:contain}.sos-portal-gallery-media.zoomed img{max-width:none;max-height:none;width:auto;height:auto;transform:scale(1.7);transform-origin:center;cursor:zoom-out}.sos-portal-gallery-caption{text-align:center;padding:10px;font-size:13px;max-height:85px;overflow:auto}.sos-portal-gallery-bottom{display:flex;justify-content:center;gap:10px;padding:9px 10px calc(env(safe-area-inset-bottom,0px) + 9px)}.sos-portal-gallery-bottom button{min-width:80px}.sos-portal-gallery-btn:focus-visible{outline:2px solid #e8c46d}';
    style.textContent += ".sos-portal-evidences,.sos-portal-thumbs{min-width:0;max-width:100%}.sos-portal-thumb{display:block;width:100%;box-sizing:border-box}.sos-portal-thumb img{display:block;width:100%!important;height:100%!important;max-width:100%!important;max-height:100%!important;object-fit:cover}.sos-portal-gallery{width:100vw;height:100vh;height:100dvh;overflow:hidden;box-sizing:border-box}.sos-portal-gallery-stage{min-width:0;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none}.sos-portal-gallery-media{min-width:0;min-height:0;overflow:hidden}.sos-portal-gallery-media img,.sos-portal-gallery-media video{display:block;width:auto;height:auto;max-width:100%!important;max-height:100%!important;object-fit:contain;flex-shrink:1}.sos-portal-gallery-media.zoomed img{width:auto;height:auto;max-width:100%!important;max-height:100%!important;transform:none;transform-origin:center}.sos-portal-gallery-media img{touch-action:none;will-change:transform}.sos-portal-gallery-bottom{flex-wrap:wrap;gap:6px}";
    (D.head || D.documentElement).appendChild(style);
  }
  installStyles();

  const photo = () => !!selected[index] && !selected[index].video;
  const image = () => mediaArea?.querySelector('img');
  function drawZoom() {
    if (!mediaArea) return;
    const im = image();
    if (!im || scale <= 1) { panX = 0; panY = 0; }
    else {
      const maxX = Math.max(0, (im.offsetWidth * scale - stage.clientWidth) / 2);
      const maxY = Math.max(0, (im.offsetHeight * scale - stage.clientHeight) / 2);
      panX = Math.max(-maxX, Math.min(maxX, panX));
      panY = Math.max(-maxY, Math.min(maxY, panY));
    }
    if (im) im.style.transform = 'translate3d(' + panX + 'px,' + panY + 'px,0) scale(' + scale + ')';
    mediaArea.classList.toggle('zoomed', scale > 1);
    const label = modal.querySelector('[data-gallery-action="fullscreen"]');
    if(label) label.textContent=scale>1?'⊟ Reduzir':'⛶ Ampliar';
    const indicator=modal.querySelector('[data-gallery-scale]');
    if(indicator)indicator.textContent=Math.round(scale*100)+'%';
    for(const action of ['zoom-in','zoom-out','reset']){
      const b=modal.querySelector('[data-gallery-action="'+action+'"]');
      if(b)b.disabled=!photo();
    }
  }
  function zoomTo(value,x,y) {
    if (!photo()) return;
    const old = scale, next = Math.max(1, Math.min(5, value));
    if(stage && x!=null && y!=null){
      const r=stage.getBoundingClientRect();
      const dx=x-r.left-r.width/2, dy=y-r.top-r.height/2;
      panX+=(dx-panX)*(1-next/old);
      panY+=(dy-panY)*(1-next/old);
    }
    scale=next;
    if(scale===1){panX=0;panY=0;}
    drawZoom();
  }
  function resetZoom(){scale=1;panX=0;panY=0;drawZoom();}

  function ensure() {
    if (modal) return;
    installStyles();
    modal = D.createElement('div'); modal.hidden = true; modal.className = 'sos-portal-gallery';
    modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true'); modal.setAttribute('aria-label','Galeria de evidências da OS');
    modal.innerHTML = '<div class="sos-portal-gallery-bar"><button type="button" class="sos-portal-gallery-btn" data-gallery-action="close">✕ Fechar</button><span data-gallery-count></span><button type="button" class="sos-portal-gallery-btn" data-gallery-action="fullscreen">⛶ Ampliar</button></div><div class="sos-portal-gallery-stage" data-gallery-stage><div class="sos-portal-gallery-media" data-gallery-media></div></div><div class="sos-portal-gallery-caption" data-gallery-caption></div><div class="sos-portal-gallery-bottom"><button type="button" class="sos-portal-gallery-btn" data-gallery-action="prev">❮ Anterior</button><button type="button" class="sos-portal-gallery-btn" data-gallery-action="zoom-out">−</button><button type="button" class="sos-portal-gallery-btn" data-gallery-action="reset">Ajustar</button><span data-gallery-scale style="align-self:center;font-size:12px">100%</span><button type="button" class="sos-portal-gallery-btn" data-gallery-action="zoom-in">＋</button><button type="button" class="sos-portal-gallery-btn" data-gallery-action="next">Próximo ❯</button></div>';
    D.body.appendChild(modal);
    mediaArea=modal.querySelector('[data-gallery-media]'); countArea=modal.querySelector('[data-gallery-count]'); captionArea=modal.querySelector('[data-gallery-caption]');
    stage=modal.querySelector('[data-gallery-stage]');
    modal.addEventListener('click', e => {
      const a=e.target.closest('[data-gallery-action]')?.dataset.galleryAction;
      if (!a) return;
      e.preventDefault();
      if(a==='close')close();else if(a==='prev')step(-1);else if(a==='next')step(1);
      else if(a==='fullscreen'){if(photo())zoomTo(scale>1?1:2.5);else mediaArea.querySelector('video')?.requestFullscreen?.().catch(()=>{});}
      else if(a==='zoom-in')zoomTo(scale+.75);else if(a==='zoom-out')zoomTo(scale-.75);else if(a==='reset')resetZoom();
    });

    stage.addEventListener('pointerdown',e=>{
      if(!photo()||e.button>0)return;
      pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(pointers.size===1){dragStart={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY};pinched=false;}
      else if(pointers.size===2){const [a,b]=[...pointers.values()];lastDistance=Math.hypot(a.x-b.x,a.y-b.y);pinched=true;}
      if(e.pointerType!=='mouse')try{stage.setPointerCapture(e.pointerId)}catch(_){}
    });
    stage.addEventListener('pointermove',e=>{
      if(!pointers.has(e.pointerId)||!photo())return;
      pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(pointers.size>=2){
        const [a,b]=[...pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);
        if(lastDistance>0&&distance>0)zoomTo(scale*distance/lastDistance,(a.x+b.x)/2,(a.y+b.y)/2);
        lastDistance=distance;pinched=true;
      }else if(scale>1&&dragStart&&!pinched){
        panX+=e.clientX-dragStart.lastX;panY+=e.clientY-dragStart.lastY;drawZoom();
      }
      if(dragStart){dragStart.lastX=e.clientX;dragStart.lastY=e.clientY;}
    });
    function endPointer(e){
      if(!pointers.has(e.pointerId))return;
      pointers.delete(e.pointerId);
      if(pointers.size===0){
        if(!pinched&&dragStart&&e.type==='pointerup'&&scale===1){
          const dx=e.clientX-dragStart.x,dy=e.clientY-dragStart.y;
          if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.3)step(dx<0?1:-1);
          else if(e.pointerType==='touch'&&Math.abs(dx)<12&&Math.abs(dy)<12){
            const now=Date.now();
            if(now-lastTapTime<310){zoomTo(2.5,e.clientX,e.clientY);lastTapTime=0;}
            else lastTapTime=now;
          }
        }
        dragStart=null;pinched=false;lastDistance=0;
      }else if(pointers.size===1){
        const [p]=pointers.values();dragStart={x:p.x,y:p.y,lastX:p.x,lastY:p.y};lastDistance=0;
      }
    }
    stage.addEventListener('pointerup',endPointer);
    stage.addEventListener('pointercancel',endPointer);
    W.addEventListener('resize',()=>{if(isOpen)drawZoom();});
  }
  function show() {
    const m=selected[index];if(!m)return;
    mediaArea.querySelector('video')?.pause?.();
    mediaArea.replaceChildren();
    const el=D.createElement(m.video?'video':'img');el.src=m.url;
    if(m.video){el.controls=true;el.playsInline=true;el.preload='metadata';}
    else{
      el.alt='Foto '+(index+1)+' de '+selected.length;el.draggable=false;
      el.addEventListener('load',drawZoom,{once:true});
      el.addEventListener('dblclick',e=>{e.preventDefault();if(!e.sourceCapabilities?.firesTouchEvents)zoomTo(scale>1?1:2.5,e.clientX,e.clientY);});
    }
    mediaArea.appendChild(el);countArea.textContent=(index+1)+' / '+selected.length;captionArea.textContent=m.caption||'';
    resetZoom();pointers.clear();dragStart=null;pinched=false;lastDistance=0;
  }
  function openGallery(key,i) {
    const list=collections.get(key); if(!list?.length)return;
    ensure();selected=list;index=Math.max(0,Math.min(list.length-1,Number(i)||0));
    if(!isOpen)savedBodyOverflow=D.body.style.overflow;isOpen=true;
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
  function hide() {if(!isOpen)return;isOpen=false;mediaArea?.querySelector('video')?.pause?.();if(mediaArea)mediaArea.replaceChildren();if(modal)modal.hidden=true;D.body.style.overflow=savedBodyOverflow;pointers.clear();}
  function close() {const wasState=history.state?.sosGallery;hide();if(wasState)history.back();}
  D.addEventListener('click',e=>{const el=e.target.closest('[data-sos-gallery]');if(!el)return;e.preventDefault();openGallery(el.dataset.sosGallery,el.dataset.sosIndex);});
  W.addEventListener('popstate',()=>{if(isOpen)hide();});
  D.addEventListener('keydown',e=>{if(!isOpen)return;if(e.key==='Escape'){e.preventDefault();close();}else if(e.key==='ArrowLeft'){e.preventDefault();step(-1);}else if(e.key==='ArrowRight'){e.preventDefault();step(1);}});
  W.sosPortalGallery={render,normalize,openSingle,close,isOpen:()=>isOpen};
})(window,document);
