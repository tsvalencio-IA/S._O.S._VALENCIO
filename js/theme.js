/**
 * thIAguinho ERP — Toggle de tema claro/escuro
 *
 * Funciona via atributo data-theme no <html>.
 * Cada HTML sobrescreve suas próprias variáveis em [data-theme="light"].
 *
 * Persiste a escolha em localStorage.
 * Auto-injeta um botão fixo no canto superior direito.
 *
 * Powered by thIAguinho Soluções Digitais
 */
(function() {
  'use strict';
  const KEY = 'thiaguinho_theme';

  function get() {
    try {
      const v = localStorage.getItem(KEY);
      if (v === 'light' || v === 'dark') return v;
    } catch(e) {}
    return 'dark';
  }

  function apply(t) {
    document.documentElement.setAttribute('data-theme', t);
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
    meta.content = t === 'light' ? '#F6F8FB' : '#101722';
  }

  function set(t) {
    if (t !== 'light' && t !== 'dark') return;
    apply(t);
    try { localStorage.setItem(KEY, t); } catch(e) {}
    atualizarBtn();
  }

  function toggle() { set(get() === 'dark' ? 'light' : 'dark'); }

  // Aplica IMEDIATAMENTE (antes do DOMContentLoaded) para evitar flash
  apply(get());

  function atualizarBtn() {
    document.querySelectorAll('.thi-theme-btn').forEach(btn => {
      btn.innerHTML = get() === 'dark' ? '☀️' : '🌙';
      btn.title = get() === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro';
    });
  }

  function injetarBotao() {
    if (document.querySelector('.thi-theme-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'thi-theme-btn';
    btn.type = 'button';
    btn.style.cssText = 'position:fixed;top:14px;right:14px;z-index:99999;width:42px;height:42px;border-radius:50%;border:1px solid rgba(127,127,127,0.3);background:rgba(127,127,127,0.15);backdrop-filter:blur(8px);color:inherit;cursor:pointer;font-size:1.1rem;display:flex;align-items:center;justify-content:center;transition:transform 0.2s,background 0.2s;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
    btn.onmouseover = () => { btn.style.transform = 'scale(1.08)'; };
    btn.onmouseout = () => { btn.style.transform = 'scale(1)'; };
    btn.onclick = toggle;
    document.body.appendChild(btn);
    atualizarBtn();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injetarBotao);
  } else {
    injetarBotao();
  }


  // Identidade visual S.O.S. Valêncio: aplica o mesmo CSS ao APK e
  // às três telas web aprovadas; não altera lógica, eventos nem permissões.
  try {
    const p = new URLSearchParams(window.location.search);
    const path = String(window.location.pathname || '').split('/').pop().toLowerCase();
    const paginasWebAprovadas = ['selecionar-perfil.html', 'index.html', 'jarvis.html'];
    const bridge = !!(window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === 'function' &&
      window.Capacitor.isNativePlatform());
    const appMode = bridge || p.get('sos_app') === 'android' ||
      localStorage.getItem('sos_valencio_android_shell') === '1';
    // Não gravar a marca de APK no navegador web convencional.
    if (appMode) localStorage.setItem('sos_valencio_android_shell', '1');
    if (appMode || paginasWebAprovadas.includes(path)) {
      document.documentElement.classList.add('sos-premium-ui');
      if (!document.querySelector('link[data-sos-android-style]')) {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'css/android-app.css?v=26.25.6';
        css.setAttribute('data-sos-android-style', '1');
        document.head.appendChild(css);
      }
    }
    // Ícone da aba do navegador; mantém favicon/manifest PWA preexistentes
    // apenas quando a página não possui um ícone declarado.
    if (!document.querySelector('link[rel~="icon"]')) {
      const favicon = document.createElement('link');
      favicon.rel = 'icon';
      favicon.type = 'image/svg+xml';
      favicon.href = 'assets/sos-valencio-android-icon.svg';
      favicon.setAttribute('data-sos-favicon', '1');
      document.head.appendChild(favicon);
    }
  } catch (e) {
    console.warn('[S.O.S. Valêncio] Identidade visual indisponível:', e?.message || e);
  }
  window.thiTheme = { get, set, toggle };
})();
/* Powered by thIAguinho Soluções Digitais */
