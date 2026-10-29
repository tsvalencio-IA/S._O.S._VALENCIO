/* Escolha temporária das fotos dos documentos exportados pelo Jarvis. */
(function (W, D) {
  'use strict';

  let emAndamento = false;

  function contextoFotos() {
    const id = String(D.getElementById('osId')?.value || '');
    const os = (W.J?.os || []).find(item => String(item?.id || '') === id) || {};
    let mediaAtual = [];
    try {
      const media = JSON.parse(D.getElementById('osMediaArray')?.value || '[]');
      if (Array.isArray(media)) mediaAtual = media;
    } catch (_) { /* Preserva o comportamento do exportador para mídia inválida. */ }
    if (typeof W.thiaEvidenciasOS?.fotos !== 'function') {
      throw new Error('Não foi possível carregar as fotos da O.S. Atualize a página e tente novamente.');
    }
    return { id, fotos: W.thiaEvidenciasOS.fotos(os, { mediaAtual, somenteAnexosOS: true }) };
  }

  function botao(texto, classe, acao) {
    const el = D.createElement('button');
    el.type = 'button';
    el.className = classe || '';
    el.textContent = texto;
    el.addEventListener('click', acao);
    return el;
  }

  function criarEstilos() {
    if (D.getElementById('thia-selecao-fotos-estilo')) return;
    const estilo = D.createElement('style');
    estilo.id = 'thia-selecao-fotos-estilo';
    estilo.textContent = `
      #thia-selecao-fotos { position:fixed; inset:0; z-index:2147483000; display:flex; align-items:center; justify-content:center; padding:12px; background:rgba(2,6,23,.82); color:#e9f2ff; font-family:Arial,sans-serif; box-sizing:border-box; }
      #thia-selecao-fotos * { box-sizing:border-box; }
      #thia-selecao-fotos .thia-dialogo { width:min(920px,100%); max-height:calc(100vh - 24px); max-height:calc(100dvh - 24px); display:flex; flex-direction:column; overflow:hidden; background:#101e30; border:1px solid #43617d; border-radius:14px; box-shadow:0 20px 70px rgba(0,0,0,.55); }
      #thia-selecao-fotos .thia-cabecalho { padding:18px 20px 12px; border-bottom:1px solid #34495f; }
      #thia-selecao-fotos h2 { margin:0 0 6px; font-size:19px; line-height:1.25; color:#fff; }
      #thia-selecao-fotos p { margin:4px 0; color:#cbd9e8; font-size:13px; line-height:1.45; }
      #thia-selecao-fotos .thia-controles { display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:10px 20px; }
      #thia-selecao-fotos .thia-contador { margin-left:auto; font-weight:700; color:#d7ebff; font-size:13px; }
      #thia-selecao-fotos .thia-grade { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(145px,100%),1fr)); gap:10px; padding:4px 20px 16px; overflow:auto; overscroll-behavior:contain; min-height:0; }
      #thia-selecao-fotos .thia-foto { display:flex; flex-direction:column; min-width:0; border:2px solid #52677d; border-radius:9px; overflow:hidden; background:#1a2b3e; cursor:pointer; }
      #thia-selecao-fotos .thia-foto.thia-marcada { border-color:#38bdf8; background:#16344b; }
      #thia-selecao-fotos .thia-imagem { width:100%; height:125px; display:block; object-fit:contain; background:#07121e; }
      #thia-selecao-fotos .thia-sem-previa { height:125px; display:flex; align-items:center; justify-content:center; padding:10px; text-align:center; color:#cbd9e8; font-size:12px; background:#07121e; }
      #thia-selecao-fotos .thia-rotulo { display:flex; align-items:flex-start; gap:8px; padding:9px; font-size:13px; line-height:1.3; overflow-wrap:anywhere; }
      #thia-selecao-fotos .thia-rotulo input { flex:0 0 auto; width:20px; height:20px; margin:0; accent-color:#0ea5e9; cursor:pointer; }
      #thia-selecao-fotos .thia-descricao { display:block; margin-top:4px; color:#c6d6e4; font-size:12px; font-weight:normal; }
      #thia-selecao-fotos .thia-rodape { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; padding:12px 20px; border-top:1px solid #34495f; background:#101e30; }
      #thia-selecao-fotos button { min-height:42px; padding:9px 13px; border:1px solid #607d99; border-radius:7px; background:#1d354d; color:#fff; font:700 13px Arial,sans-serif; cursor:pointer; }
      #thia-selecao-fotos button.thia-gerar { border-color:#42c0fa; background:#087db8; }
      #thia-selecao-fotos button:focus-visible, #thia-selecao-fotos input:focus-visible { outline:3px solid #facc15; outline-offset:2px; }
      :root[data-theme="light"] #thia-selecao-fotos .thia-dialogo { color:#0f172a; background:#fff; border-color:#a7bacb; }
      :root[data-theme="light"] #thia-selecao-fotos h2 { color:#0f172a; }
      :root[data-theme="light"] #thia-selecao-fotos p, :root[data-theme="light"] #thia-selecao-fotos .thia-descricao { color:#475569; }
      :root[data-theme="light"] #thia-selecao-fotos .thia-cabecalho, :root[data-theme="light"] #thia-selecao-fotos .thia-rodape { border-color:#cbd5e1; }
      :root[data-theme="light"] #thia-selecao-fotos .thia-rodape { background:#fff; }
      :root[data-theme="light"] #thia-selecao-fotos .thia-contador { color:#18344d; }
      :root[data-theme="light"] #thia-selecao-fotos .thia-foto { color:#0f172a; background:#f1f5f9; border-color:#a3b6c9; }
      :root[data-theme="light"] #thia-selecao-fotos .thia-foto.thia-marcada { background:#e9f6ff; border-color:#007db5; }
      :root[data-theme="light"] #thia-selecao-fotos button:not(.thia-gerar) { color:#17334a; background:#f1f5f9; border-color:#9bb0c4; }
      @media (max-width:480px) { #thia-selecao-fotos { padding:8px; } #thia-selecao-fotos .thia-dialogo { max-height:calc(100vh - 16px); max-height:calc(100dvh - 16px); } #thia-selecao-fotos .thia-cabecalho { padding:13px 12px 9px; } #thia-selecao-fotos .thia-controles { padding:9px 12px; } #thia-selecao-fotos .thia-grade { padding:3px 12px 12px; gap:8px; } #thia-selecao-fotos .thia-rodape { padding:10px 12px; } #thia-selecao-fotos .thia-rodape button { flex:1 1 120px; } }
      #thia-selecao-fotos.thia-fabio button { min-height:48px; font-size:15px; touch-action:manipulation; }
      #thia-selecao-fotos.thia-fabio .thia-rotulo { min-height:56px; align-items:center; font-size:15px; }
      #thia-selecao-fotos.thia-fabio .thia-rotulo input { width:30px; height:30px; }
      #thia-selecao-fotos.thia-fabio .thia-foto { touch-action:manipulation; }
      #thia-selecao-fotos.thia-fabio .thia-cabecalho, #thia-selecao-fotos.thia-fabio .thia-controles { flex:0 0 auto; }
      #thia-selecao-fotos.thia-fabio .thia-grade { grid-auto-rows:max-content; align-items:start; }
      #thia-selecao-fotos.thia-fabio .thia-foto { display:block; align-self:start; }
      #thia-selecao-fotos.thia-fabio .thia-ampliar { display:block; width:100%; padding:0; border:0; border-radius:0; background:#07121e; color:#d7ebff; }
      #thia-selecao-fotos.thia-fabio .thia-ampliar span { display:block; padding:8px; border-bottom:1px solid #52677d; font-size:14px; }
      #thia-selecao-fotos.thia-fabio .thia-imagem { min-height:125px; }
      #thia-selecao-fotos.thia-fabio * { -webkit-tap-highlight-color:transparent; }
      #thia-selecao-fotos.thia-fabio .thia-rodape .thia-gerar { flex:1 1 100%; }
      @media(max-width:650px){
        #thia-selecao-fotos.thia-fabio { padding:0; }
        #thia-selecao-fotos.thia-fabio .thia-dialogo { width:100%; height:100vh; height:100dvh; max-height:100vh; max-height:100dvh; border:0; border-radius:0; padding-top:env(safe-area-inset-top); }
        #thia-selecao-fotos.thia-fabio .thia-cabecalho { padding:12px; }
        #thia-selecao-fotos.thia-fabio .thia-cabecalho h2 { font-size:18px; }
        #thia-selecao-fotos.thia-fabio .thia-cabecalho p { font-size:14px; }
        #thia-selecao-fotos.thia-fabio .thia-grade { flex:1; grid-template-columns:repeat(2,minmax(0,1fr)); align-content:start; -webkit-overflow-scrolling:touch; }
        #thia-selecao-fotos.thia-fabio .thia-imagem, #thia-selecao-fotos.thia-fabio .thia-sem-previa { height:145px; min-height:145px; }
        #thia-selecao-fotos.thia-fabio .thia-controles { padding:8px 12px; }
        #thia-selecao-fotos.thia-fabio .thia-contador { flex:1 1 100%; margin:0; }
        #thia-selecao-fotos.thia-fabio .thia-rodape { flex-shrink:0; padding:10px 12px max(10px,env(safe-area-inset-bottom)); }
        #thia-selecao-fotos.thia-fabio .thia-rodape button { flex:1 1 110px; }
      }
      @media(orientation:landscape) and (max-height:500px){
        #thia-selecao-fotos.thia-fabio .thia-cabecalho { padding:8px 12px; }
        #thia-selecao-fotos.thia-fabio .thia-cabecalho p { display:none; }
        #thia-selecao-fotos.thia-fabio .thia-contador { flex:0 1 auto; margin-left:auto; }
        #thia-selecao-fotos.thia-fabio .thia-rodape { padding:6px 12px max(6px,env(safe-area-inset-bottom)); }
        #thia-selecao-fotos.thia-fabio .thia-rodape button.thia-gerar { flex:1 1 150px; }
      }
    `;
    D.head.appendChild(estilo);
  }

  function escolherFotos(fotos, tipo, opcoes = {}) {
    if (!fotos.length) return Promise.resolve([]);
    criarEstilos();
    const focoAnterior = D.activeElement;
    const overflowAnterior = D.body.style.overflow;
    const overlay = D.createElement('div');
    overlay.id = 'thia-selecao-fotos';
    if (opcoes.modoFabio) overlay.className = 'thia-fabio';
    const dialogo = D.createElement('div');
    dialogo.className = 'thia-dialogo';
    dialogo.setAttribute('role', 'dialog');
    dialogo.setAttribute('aria-modal', 'true');
    dialogo.setAttribute('aria-labelledby', 'thia-selecao-fotos-titulo');

    const cabecalho = D.createElement('div');
    cabecalho.className = 'thia-cabecalho';
    const titulo = D.createElement('h2');
    titulo.id = 'thia-selecao-fotos-titulo';
    titulo.textContent = opcoes.titulo || 'Escolher fotos para ' + (tipo === 'pdf' ? 'o PDF' : 'a planilha agrupada');
    const instrucoes = D.createElement('p');
    instrucoes.textContent = opcoes.modoFabio ? 'Amplie a foto para conferir. Marque aqui ou no carrossel para incluir no PDF.' : 'Marque somente as fotos que deseja incluir. Você também pode gerar o documento sem fotos.';
    const detalhe = D.createElement('p');
    detalhe.textContent = opcoes.modoFabio ? 'As fotos permanecem na O.S. Fotos do checklist não entram no PDF.' : 'A escolha vale para este documento; as fotos continuam na O.S. Fotos do checklist não são incluídas.';
    cabecalho.append(titulo, instrucoes, detalhe);

    const controles = D.createElement('div');
    controles.className = 'thia-controles';
    const contador = D.createElement('span');
    contador.className = 'thia-contador';
    contador.setAttribute('aria-live', 'polite');
    const grade = D.createElement('div');
    grade.className = 'thia-grade';
    const escolhas = [];
    let visualizando = false;
    const atualizar = () => {
      let total = 0;
      escolhas.forEach(({ check, cartao }) => {
        if (check.checked) total++;
        cartao.classList.toggle('thia-marcada', check.checked);
      });
      contador.textContent = total + ' de ' + fotos.length + ' selecionada(s)';
    };
    const marcar = valor => { escolhas.forEach(({ check }) => { check.checked = valor; }); atualizar(); };
    controles.append(botao('Marcar todas', '', () => marcar(true)), botao('Desmarcar todas', '', () => marcar(false)), contador);

    fotos.forEach((foto, indice) => {
      const podeAmpliar = opcoes.modoFabio && typeof opcoes.visualizarFoto === 'function';
      const cartao = D.createElement(podeAmpliar ? 'article' : 'label');
      cartao.className = 'thia-foto';
      const img = D.createElement('img');
      img.className = 'thia-imagem';
      img.alt = 'Prévia da foto ' + (indice + 1);
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', () => {
        const aviso = D.createElement('span');
        aviso.className = 'thia-sem-previa';
        aviso.textContent = 'Prévia indisponível';
        img.replaceWith(aviso);
      }, { once: true });
      img.src = String(foto.url || foto.secure_url || '');
      const rotulo = D.createElement(podeAmpliar ? 'label' : 'span');
      rotulo.className = 'thia-rotulo';
      const check = D.createElement('input');
      check.type = 'checkbox';
      check.checked = !Array.isArray(opcoes.fotosSelecionadas) || opcoes.fotosSelecionadas.includes(String(foto.url || foto.secure_url || ''));
      check.setAttribute('aria-label', 'Incluir foto ' + (indice + 1));
      check.addEventListener('change', atualizar);
      const texto = D.createElement('span');
      const nome = D.createElement('strong');
      nome.textContent = 'Foto ' + (indice + 1);
      texto.appendChild(nome);
      const descricao = String(foto.descricao || foto.legenda || foto.observacao || foto.obs || '').trim();
      if (descricao) {
        const detalheFoto = D.createElement('span');
        detalheFoto.className = 'thia-descricao';
        detalheFoto.textContent = descricao;
        texto.appendChild(detalheFoto);
      }
      rotulo.append(check, texto);
      if (podeAmpliar) {
        const ampliar = botao('', 'thia-ampliar', () => {
          visualizando = true;
          try {
            const abriu = opcoes.visualizarFoto(indice, {
              fotos,
              selecionada: i => !!escolhas[i]?.check.checked,
              marcar: (i, valor) => { if (escolhas[i]) { escolhas[i].check.checked = !!valor; atualizar(); } },
              total: () => escolhas.filter(item => item.check.checked).length,
              aoFechar: () => { visualizando = false; ampliar.focus(); }
            });
            if (abriu === false) visualizando = false;
          } catch (_) { visualizando = false; contador.textContent = 'Não foi possível ampliar. Feche e abra novamente a escolha de fotos.'; }
        });
        ampliar.setAttribute('aria-label', 'Ampliar foto ' + (indice + 1));
        const legendaAmpliar = D.createElement('span');
        legendaAmpliar.textContent = 'Ampliar foto ' + (indice + 1);
        ampliar.append(img, legendaAmpliar);
        cartao.append(ampliar, rotulo);
      } else cartao.append(img, rotulo);
      grade.appendChild(cartao);
      escolhas.push({ check, cartao, url: String(foto.url || foto.secure_url || '') });
    });
    atualizar();

    const rodape = D.createElement('div');
    rodape.className = 'thia-rodape';
    dialogo.append(cabecalho, controles, grade, rodape);
    overlay.appendChild(dialogo);

    return new Promise(resolve => {
      let fechado = false;
      const fechar = resultado => {
        if (fechado) return;
        fechado = true;
        D.removeEventListener('keydown', aoTeclado, true);
        overlay.remove();
        if (opcoes.modoFabio) D.body.style.overflow = overflowAnterior;
        try { focoAnterior?.focus(); } catch (_) {}
        resolve(resultado);
      };
      const aoTeclado = evento => {
        if (visualizando) return;
        if (evento.key === 'Escape') {
          evento.preventDefault();
          evento.stopPropagation();
          fechar(null);
        } else if (evento.key === 'Tab') {
          const elementos = Array.from(dialogo.querySelectorAll('button:not([disabled]), input:not([disabled])'));
          if (!elementos.length) return;
          const primeiro = elementos[0], ultimo = elementos[elementos.length - 1];
          if (evento.shiftKey && D.activeElement === primeiro) { evento.preventDefault(); ultimo.focus(); }
          else if (!evento.shiftKey && D.activeElement === ultimo) { evento.preventDefault(); primeiro.focus(); }
        }
      };
      const cancelar = botao('Cancelar', '', () => fechar(null));
      const gerar = botao(opcoes.modoFabio ? 'Usar fotos marcadas' : tipo === 'pdf' ? 'Gerar PDF' : 'Gerar planilha', 'thia-gerar', () => {
        fechar(escolhas.filter(item => item.check.checked).map(item => item.url));
      });
      rodape.appendChild(cancelar);
      if (opcoes.modoFabio) rodape.appendChild(botao('Continuar sem fotos', '', () => fechar([])));
      rodape.appendChild(gerar);
      D.addEventListener('keydown', aoTeclado, true);
      if (opcoes.modoFabio) D.body.style.overflow = 'hidden';
      D.body.appendChild(overlay);
      escolhas[0]?.check.focus();
    });
  }

  async function exportar(tipo) {
    if (emAndamento) return;
    emAndamento = true;
    try {
      const idAtual = String(D.getElementById('osId')?.value || '');
      if (tipo === 'agrupado' && !idAtual) return await W.exportarOrcamentoPMSPItens();
      const contexto = contextoFotos();
      const fotosSelecionadas = await escolherFotos(contexto.fotos, tipo);
      if (fotosSelecionadas === null) return;
      if (String(D.getElementById('osId')?.value || '') !== contexto.id) {
        throw new Error('A O.S. aberta mudou. Selecione novamente as fotos para exportar.');
      }
      const opcoes = { fotosSelecionadas, osIdSelecaoFotos: contexto.id };
      if (tipo === 'pdf') return await W.gerarPDFOS(opcoes);
      return await W.exportarOrcamentoPMSPItens(opcoes);
    } catch (erro) {
      console.error('[Seleção de fotos da O.S.]', erro);
      W.toast?.('Não foi possível exportar: ' + (erro?.message || erro), 'err');
    } finally {
      emAndamento = false;
    }
  }

  W.thiaEscolherFotosDocumento = escolherFotos;
  W.thiaExportarPDFComSelecaoFotos = () => exportar('pdf');
  W.thiaExportarAgrupadoComSelecaoFotos = () => exportar('agrupado');
})(window, document);
