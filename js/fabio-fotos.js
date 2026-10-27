/* Consulta de fotos e avisos do Fábio. Não altera a O.S. nem grava no banco. */
(function (W, D) {
  'use strict';
  const get = id => D.getElementById(id);
  const source = id => (W.__fabioOsFonte?.() || []).find(o => String(o.id) === String(id));
  const str = v => v == null ? '' : String(v);
  const urls = fotos => fotos.map(f => str(f.url || f.secure_url));
  function listar(id) {
    const os = source(id);
    if (!os) return [];
    if (typeof W.thiaEvidenciasOS?.fotos !== 'function') throw Error('Fotos indisponíveis. Atualize o painel.');
    return W.thiaEvidenciasOS.fotos(os, { somenteAnexosOS: true });
  }
  async function escolher(id, atuais) {
    const os = source(id);
    if (!os) throw Error('O.S. não encontrada.');
    if (typeof W.thiaEscolherFotosDocumento !== 'function') throw Error('Seletor de fotos indisponível. Atualize o painel.');
    const fotos = listar(id);
    const selecionadas = await W.thiaEscolherFotosDocumento(fotos, 'pdf', {
      titulo: 'Escolher fotos — O.S. ' + str(os.numero || os.numeroOS || id.slice(-6)),
      modoFabio: true,
      fotosSelecionadas: atuais
    });
    if (selecionadas === null) return null;
    if (source(id) !== os) throw Error('A O.S. foi atualizada. Confira novamente antes de escolher as fotos.');
    return selecionadas;
  }
  function resumo(id, selecionadas) {
    const fotos = listar(id), set = Array.isArray(selecionadas) ? new Set(selecionadas) : null;
    const total = set ? fotos.filter(f => set.has(str(f.url || f.secure_url))).length : fotos.length;
    return total + ' de ' + fotos.length + ' foto(s) no PDF';
  }
  function criar(tag, classe, texto, parent) {
    const el = D.createElement(tag);
    if (classe) el.className = classe;
    if (texto != null) el.textContent = texto;
    parent?.appendChild(el);
    return el;
  }
  function botao(texto, parent, acao) {
    const el = criar('button', '', texto, parent); el.type = 'button';
    el.addEventListener('click', acao); return el;
  }
  function data(valor) {
    try {
      const raw = typeof valor?.toDate === 'function' ? valor.toDate() :
        valor && typeof valor === 'object' && ('seconds' in valor || '_seconds' in valor) ?
          new Date(Number(valor.seconds ?? valor._seconds) * 1000) : valor;
      if (raw === '' || raw == null) return null;
      const d = new Date(raw); return Number.isNaN(d.getTime()) ? null : d;
    } catch (_) { return null; }
  }
  function observacoes(os) {
    const registros = [];
    const normalizar = (o, texto) => ({
      texto: str(texto).trim(), usuario: str(o.usuario || o.user || o.usuarioNome).trim(),
      usuarioId: str(o.usuarioId || o.userId), dt: data(o.dt || o.data || o.createdAt), origem: str(o.origem)
    });
    for (const o of Array.isArray(os?.observacoesEquipe) ? os.observacoesEquipe : []) {
      if (!o || typeof o !== 'object') continue;
      const r = normalizar(o, o.texto || o.obs || o.observacao);
      if (r.texto) registros.push(r);
    }
    const diretos = registros.slice();
    for (const o of Array.isArray(os?.timeline) ? os.timeline : []) {
      const acao = str(o?.acao), tipo = str(o?.tipo).toLowerCase(), evento = str(o?.tipoEvento).toLowerCase();
      if (tipo !== 'observacao_equipe' && evento !== 'observacao_interna' && !/^observa[cç][aã]o (?:da equipe|interna)\s*:/i.test(acao)) continue;
      const r = normalizar(o, o.observacao || o.texto || acao.replace(/^observa[cç][aã]o (?:da equipe|interna)\s*:\s*/i, ''));
      if (!r.texto) continue;
      const duplicado = diretos.some(x => x.texto === r.texto &&
        (x.usuarioId && r.usuarioId ? x.usuarioId === r.usuarioId : x.usuario === r.usuario) &&
        (x.dt && r.dt ? Math.abs(x.dt - r.dt) <= 60000 : x.dt === r.dt));
      if (!duplicado) registros.push(r);
    }
    return registros.sort((a, b) => (b.dt?.getTime() || 0) - (a.dt?.getTime() || 0));
  }
  function atualizarInternas(id) {
    const box = get('fabioObservacoesLista'); if (!box) return;
    box.replaceChildren();
    const os = source(id); if (!os) return;
    const registros = observacoes(os);
    if (!registros.length) criar('p', '', 'Nenhum aviso interno entre Jarvis e Equipe registrado nesta O.S.', box);
    for (const r of registros) {
      const row = criar('article', 'fabio-aviso', null, box);
      criar('strong', '', r.usuario || (r.usuarioId ? 'Usuário ' + r.usuarioId : 'Autor não registrado'), row);
      criar('small', '', (r.dt ? r.dt.toLocaleString('pt-BR') : 'Data não registrada') +
        (r.origem ? ' • ' + r.origem : ''), row);
      criar('p', '', r.texto, row);
    }
    const exec = os.execucaoItens || {};
    for (const [tipo, itens] of [['servico', os.servicos], ['peca', os.pecas]]) {
      (Array.isArray(itens) ? itens : []).forEach((item, i) => {
        const registro = exec[tipo + '-' + i]; if (!str(registro?.obs).trim()) return;
        const row = criar('article', 'fabio-aviso', null, box);
        criar('strong', '', (tipo === 'servico' ? 'Serviço: ' : 'Peça: ') + str(item.desc || item.descricao || 'Item sem descrição'), row);
        criar('p', '', registro.obs, row);
        const autor = registro.atualizadoPor || registro.atualizadoPorNome || registro.usuario || registro.registradoPor;
        const dt = data(registro.atualizadoEm || registro.updatedAt || registro.registradoEm);
        if (autor || dt) criar('small', '', 'Última atualização do item: ' + (autor || 'autor não registrado') +
          (dt ? ' • ' + dt.toLocaleString('pt-BR') : ''), row);
      });
    }
    const contagem = get('fabioObservacoesContagem');
    if (contagem) contagem.textContent = str(box.querySelectorAll('.fabio-aviso').length);
  }

  let galeria = null;
  function abrirCarrossel(id, inicial = 0) {
    if (galeria) return;
    const fotos = listar(id), os = source(id); if (!os) return;
    const foco = D.activeElement, overflow = D.body.style.overflow;
    const overlay = criar('div', '', null, D.body); overlay.id = 'fabioFotoDialog';
    overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'fabioFotoTitulo');
    const painel = criar('div', 'fabio-foto-painel', null, overlay);
    const topo = criar('div', 'fabio-foto-topo', null, painel);
    criar('h2', '', 'Fotos da O.S. ' + str(os.numero || os.numeroOS || id.slice(-6)), topo).id = 'fabioFotoTitulo';
    const fechar = () => {
      if (galeria !== overlay) return;
      D.removeEventListener('keydown', teclado, true);
      overlay.remove(); galeria = null; D.body.style.overflow = overflow;
      try { foco?.focus(); } catch (_) {}
    };
    const fecharBtn = botao('✕ Fechar fotos', topo, fechar);
    const palco = criar('div', 'fabio-foto-palco', null, painel);
    const anterior = botao('←', palco, () => mostrar(indice - 1)); anterior.setAttribute('aria-label', 'Foto anterior');
    const imagem = criar('img', '', null, palco); imagem.alt = 'Foto da O.S.';
    const proxima = botao('→', palco, () => mostrar(indice + 1)); proxima.setAttribute('aria-label', 'Próxima foto');
    const legenda = criar('div', 'fabio-foto-legenda', null, painel); legenda.setAttribute('aria-live', 'polite');
    const posicao = criar('strong', '', '', legenda), descricao = criar('p', '', '', legenda);
    const acoes = criar('div', 'fabio-foto-acoes', null, painel);
    const baixar = botao('↓ Baixar esta foto', acoes, baixarAtual);
    const original = criar('a', '', 'Abrir foto original', acoes); original.target = '_blank'; original.rel = 'noopener noreferrer';
    const aviso = criar('p', 'fabio-foto-estado', '', painel); aviso.setAttribute('role', 'status');
    const miniaturas = criar('div', 'fabio-foto-miniaturas', null, painel);
    let indice = 0, baixando = false, toque = null;
    const thumbs = fotos.map((f, i) => {
      const btn = botao('', miniaturas, () => mostrar(i)); btn.setAttribute('aria-label', 'Ver foto ' + (i + 1));
      const img = criar('img', '', null, btn); img.alt = 'Foto ' + (i + 1); img.loading = 'lazy'; img.src = f.url;
      return btn;
    });
    function mostrar(proximoIndice) {
      if (!fotos.length) {
        imagem.hidden = true; posicao.textContent = 'Nenhuma foto anexada diretamente à O.S.';
        anterior.disabled = proxima.disabled = baixar.disabled = true; original.hidden = true; return;
      }
      indice = (proximoIndice + fotos.length) % fotos.length;
      const foto = fotos[indice]; imagem.src = foto.url; imagem.alt = 'Foto ' + (indice + 1) + ' da O.S.';
      posicao.textContent = 'Foto ' + (indice + 1) + ' de ' + fotos.length;
      descricao.textContent = str(foto.descricao || foto.legenda || foto.observacao || foto.obs);
      original.href = foto.url; aviso.textContent = '';
      anterior.disabled = proxima.disabled = fotos.length < 2;
      thumbs.forEach((t, i) => t.setAttribute('aria-current', String(i === indice)));
      thumbs[indice]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    imagem.addEventListener('error', () => { aviso.textContent = 'Prévia indisponível. Tente abrir a foto original.'; });
    imagem.addEventListener('touchstart', e => { toque = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; }, { passive: true });
    imagem.addEventListener('touchend', e => {
      if (!toque || !e.changedTouches.length) return;
      const dx = e.changedTouches[0].clientX - toque.x, dy = e.changedTouches[0].clientY - toque.y; toque = null;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) mostrar(indice + (dx < 0 ? 1 : -1));
    }, { passive: true });
    async function baixarAtual() {
      if (baixando || !fotos.length) return;
      const foto = fotos[indice], numeroFoto = indice + 1;
      baixando = true; baixar.disabled = true; aviso.textContent = 'Baixando a foto original…';
      const controle = new AbortController(), timeout = setTimeout(() => controle.abort(), 30000);
      try {
        const response = await W.fetch(foto.url, { mode: 'cors', credentials: 'omit', signal: controle.signal });
        if (!response.ok) throw Error('HTTP ' + response.status);
        const blob = await response.blob();
        if (!blob.size || (blob.type && !/^image\//i.test(blob.type) && blob.type !== 'application/octet-stream')) throw Error('O endereço não retornou uma foto válida.');
        const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/heic': 'heic' })[blob.type] ||
          (new URL(foto.url).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1] || 'jpg');
        const nome = 'OS-' + str(os.numero || os.numeroOS || id.slice(-6)).replace(/[^a-z0-9_-]/gi, '-') + '-FOTO-' + String(numeroFoto).padStart(2, '0') + '.' + ext;
        const link = URL.createObjectURL(blob), anchor = criar('a', '', '', D.body);
        anchor.href = link; anchor.download = nome; anchor.click(); anchor.remove();
        setTimeout(() => URL.revokeObjectURL(link), 60000);
        aviso.textContent = 'Download da foto ' + numeroFoto + ' iniciado.';
      } catch (e) {
        aviso.textContent = 'Não foi possível baixar a foto. Use “Abrir foto original” para salvar pelo navegador.';
      } finally { clearTimeout(timeout); baixando = false; baixar.disabled = !fotos.length; }
    }
    function teclado(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); fechar(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); mostrar(indice + (e.key === 'ArrowLeft' ? -1 : 1)); }
      else if (e.key === 'Tab') {
        const itens = [...painel.querySelectorAll('button:not(:disabled),a[href]')].filter(el => !el.hidden);
        if (e.shiftKey && D.activeElement === itens[0]) { e.preventDefault(); itens.at(-1)?.focus(); }
        else if (!e.shiftKey && D.activeElement === itens.at(-1)) { e.preventDefault(); itens[0]?.focus(); }
      }
    }
    galeria = overlay; D.body.style.overflow = 'hidden';
    D.addEventListener('keydown', teclado, true); mostrar(inicial); fecharBtn.focus();
  }
  W.fabioFotos = Object.freeze({ listar, escolher, resumo, abrirCarrossel, atualizarInternas });
})(window, document);
