/* Ícone e instalação do painel do Fábio. Não modifica cadastros nem autenticação. */
(function (W, D) {
  'use strict';
  let pedido = null, instalado = false, atualizarPedido = () => {};
  const standalone = W.matchMedia('(display-mode: standalone)');
  const appAberto = () => instalado || standalone.matches || W.navigator.standalone === true || W.Capacitor?.isNativePlatform?.();
  const atualizarBotao = () => { const b = D.getElementById('fabioInstalar'); if (b) b.hidden = !!appAberto(); };
  W.addEventListener('beforeinstallprompt', evento => {
    evento.preventDefault(); pedido = evento; atualizarPedido();
  });
  W.addEventListener('appinstalled', () => {
    instalado = true; pedido = null; atualizarBotao(); atualizarPedido();
  });
  standalone.addEventListener?.('change', atualizarBotao);
  function criar(tag, texto, pai, classe) {
    const el = D.createElement(tag);
    if (texto != null) el.textContent = texto;
    if (classe) el.className = classe;
    pai?.appendChild(el); return el;
  }
  function botao(texto, pai, acao) {
    const b = criar('button', texto, pai); b.type = 'button'; b.addEventListener('click', acao); return b;
  }
  function abrir() {
    if (D.getElementById('fabioInstalacao')) return;
    const foco = D.activeElement, overflow = D.body.style.overflow;
    const overlay = criar('div', null, D.body); overlay.id = 'fabioInstalacao';
    const painel = criar('section', null, overlay, 'fabio-instalar-painel');
    painel.setAttribute('role', 'dialog'); painel.setAttribute('aria-modal', 'true');
    painel.setAttribute('aria-labelledby', 'fabioInstalacaoTitulo');
    const topo = criar('div', null, painel, 'fabio-instalar-topo');
    criar('h2', 'Ícone na tela inicial', topo).id = 'fabioInstalacaoTitulo';
    const fechar = () => {
      D.removeEventListener('keydown', teclado, true); atualizarPedido = () => {};
      overlay.remove(); D.body.style.overflow = overflow; foco?.focus();
    };
    const fecharBtn = botao('Fechar', topo, fechar);
    const identidade = criar('div', null, painel, 'fabio-instalar-identidade');
    const logo = criar('img', null, identidade); logo.src = 'assets/icon-192.png?v=sosicon-20261015'; logo.alt = 'S.O.S. Valêncio';
    const nome = criar('div', null, identidade); criar('strong', 'Fábio · SOS', nome);
    criar('p', 'Um toque no ícone abre este painel.', nome);
    const plataformas = criar('div', null, painel, 'fabio-instalar-plataformas');
    let plataforma = /iPhone|iPad|iPod/.test(W.navigator.userAgent) || (W.navigator.platform === 'MacIntel' && W.navigator.maxTouchPoints > 1) ? 'ios' : 'android';
    const android = botao('Android', plataformas, () => { plataforma = 'android'; mostrar(); });
    const iphone = botao('iPhone / iPad', plataformas, () => { plataforma = 'ios'; mostrar(); });
    const passos = criar('ol', null, painel);
    const instalar = botao('Instalar este painel', painel, async () => {
      const atual = pedido; if (!atual) return;
      pedido = null; instalar.disabled = true;
      try {
        await atual.prompt();
        const escolha = await atual.userChoice;
        estado.textContent = escolha.outcome === 'accepted' ? 'Instalação solicitada. Aguarde a confirmação do aparelho.' : 'Você pode instalar depois pelo menu do navegador.';
      } catch (_) { estado.textContent = 'Use os passos acima para adicionar o ícone pelo navegador.'; }
      finally { instalar.disabled = false; atualizarPedido(); }
    });
    instalar.className = 'fabio-instalar-agora';
    const estado = criar('p', '', painel); estado.setAttribute('role', 'status');
    atualizarPedido = () => {
      instalar.hidden = plataforma === 'ios' || !pedido || instalado;
      if (instalado) estado.textContent = 'Painel instalado. Abra pelo ícone Fábio · SOS na tela inicial.';
    };
    function mostrar() {
      android.setAttribute('aria-pressed', String(plataforma === 'android'));
      iphone.setAttribute('aria-pressed', String(plataforma === 'ios'));
      passos.replaceChildren();
      const textos = plataforma === 'ios' ? [
        'Abra este painel no Safari.',
        'Toque em Compartilhar. Em algumas versões, essa opção fica no menu da página.',
        'Escolha Adicionar à Tela de Início.',
        'Se aparecer Abrir como App da Web, deixe ativado. Confirme em Adicionar.'
      ] : [
        'Abra este painel no Chrome.',
        'Toque em ⋮ no canto superior direito.',
        'Escolha Adicionar à tela inicial. Se aparecer Instalar app, selecione essa opção.',
        'Confirme em Adicionar ou Instalar.'
      ];
      textos.forEach(t => criar('li', t, passos)); estado.textContent = ''; atualizarPedido();
    }
    function teclado(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); fechar(); }
      else if (e.key === 'Tab') {
        const itens = [...painel.querySelectorAll('button:not(:disabled)')].filter(b => !b.hidden);
        if (e.shiftKey && D.activeElement === itens[0]) { e.preventDefault(); itens.at(-1)?.focus(); }
        else if (!e.shiftKey && D.activeElement === itens.at(-1)) { e.preventDefault(); itens[0]?.focus(); }
      }
    }
    mostrar(); D.body.style.overflow = 'hidden'; D.addEventListener('keydown', teclado, true); fecharBtn.focus();
  }
  const iniciar = () => { D.getElementById('fabioInstalar')?.addEventListener('click', abrir); atualizarBotao(); };
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', iniciar, { once: true }); else iniciar();
  if ('serviceWorker' in W.navigator && !W.Capacitor?.isNativePlatform?.()) {
    const registrar = () => W.navigator.serviceWorker.register('service-worker.js').catch(() => {});
    if (D.readyState === 'complete') registrar(); else W.addEventListener('load', registrar, { once: true });
  }
})(window, document);
