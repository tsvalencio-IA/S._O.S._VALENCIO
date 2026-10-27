/* Abertura dos boletos já cadastrados. Consulta somente; nenhuma baixa ou gravação. */
(function (W, D) {
  'use strict';
  const state = () => W.J || {};
  const str = v => v == null ? '' : String(v);
  const array = v => Array.isArray(v) ? v : [];
  const norm = v => str(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const money = v => v == null || v === '' ? 'Não informado' : W.moeda(v);
  const date = v => {
    const match = str(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? match[3] + '/' + match[2] + '/' + match[1] : str(v) || 'Não informado';
  };
  const canOpen = f => !!f && (f.boletoAgrupado === true || f.boletoAgrupadoOrigem === true ||
    f.boletoRealDoPacote === true || f.aguardaBoletoAgrupado === true ||
    /boleto/.test(norm([f.pgto, f.tipoDocumento].join(' '))) ||
    !!((f.notaFiscalId || f.nfId) && /parcelado|duplicata/.test(norm(f.pgto))));
  let modal, corpo, titulo, aviso, token = 0, focoAnterior;
  function el(tag, parent, text, classe) {
    const node = D.createElement(tag); if (text != null) node.textContent = text;
    if (classe) node.className = classe; parent?.appendChild(node); return node;
  }
  function button(parent, text, fn) { const b = el('button', parent, text, 'btn-outline'); b.type = 'button'; b.addEventListener('click', fn); return b; }
  function fechar() { token++; modal?.classList.remove('open'); try { focoAnterior?.focus(); } catch (_) {} }
  function montar() {
    if (modal) return;
    const estilo = el('style', D.head); estilo.id = 'financeiroBoletoConsultaEstilo';
    estilo.textContent = `
      #modalBoletoFinanceiro{z-index:11000;padding:12px;overflow:hidden}
      #modalBoletoFinanceiro .modal{width:min(920px,100%);max-width:100%;max-height:calc(100dvh - 24px);display:flex;flex-direction:column;overflow:hidden}
      #modalBoletoFinanceiro .modal-head,#modalBoletoFinanceiro .modal-foot{flex-shrink:0;flex-wrap:wrap;gap:8px}
      #modalBoletoFinanceiro .modal-title{white-space:normal;overflow-wrap:anywhere;min-width:0}
      #modalBoletoFinanceiro .modal-body{min-height:0;overflow:auto;overscroll-behavior:contain;overflow-wrap:anywhere}
      #modalBoletoFinanceiro .bol-fin-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 0}
      #modalBoletoFinanceiro .bol-fin-campo{min-width:0;padding:10px;background:var(--surf3,#10243a);border:1px solid var(--border,#31516f);border-radius:6px}
      #modalBoletoFinanceiro .bol-fin-campo small{display:block;color:var(--muted2,#adc4d8);margin-bottom:5px}
      #modalBoletoFinanceiro h3{font-size:1rem;margin:18px 0 8px;color:var(--cyan,#42caff)}
      #modalBoletoFinanceiro p{white-space:pre-wrap;line-height:1.5;margin:7px 0}
      #modalBoletoFinanceiro .bol-fin-origem{padding:10px;border:1px solid var(--border,#31516f);border-radius:6px;margin:7px 0}
      #modalBoletoFinanceiro textarea{width:100%;max-width:100%;resize:vertical;overflow-wrap:anywhere;white-space:pre-wrap}
      #modalBoletoFinanceiro button{white-space:normal;overflow-wrap:anywhere;min-height:42px}
      #modalBoletoFinanceiro .bol-fin-estado{color:var(--warn,#facc15);white-space:normal}
      @media(max-width:560px){#modalBoletoFinanceiro{padding:7px}#modalBoletoFinanceiro .modal{max-height:calc(100dvh - 14px)}#modalBoletoFinanceiro .bol-fin-grid{grid-template-columns:minmax(0,1fr)}#modalBoletoFinanceiro .modal-foot button{flex:1 1 140px}}
    `;
    modal = el('div', D.body, null, 'overlay'); modal.id = 'modalBoletoFinanceiro';
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'boletoFinanceiroTitulo');
    const box = el('div', modal, null, 'modal'), head = el('div', box, null, 'modal-head');
    titulo = el('div', head, '', 'modal-title'); titulo.id = 'boletoFinanceiroTitulo';
    button(head, '✕ Fechar', fechar);
    corpo = el('div', box, null, 'modal-body'); corpo.id = 'boletoFinanceiroCorpo';
    const foot = el('div', box, null, 'modal-foot');
    aviso = el('span', foot, '', 'bol-fin-estado'); aviso.setAttribute('role', 'status');
    button(foot, 'Fechar / voltar', fechar);
    modal.addEventListener('click', e => { if (e.target === modal) fechar(); });
    D.addEventListener('keydown', e => {
      if (!modal.classList.contains('open')) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); fechar(); }
      else if (e.key === 'Tab') {
        const nodes = [...modal.querySelectorAll('button:not(:disabled),textarea')];
        if (e.shiftKey && D.activeElement === nodes[0]) { e.preventDefault(); nodes.at(-1)?.focus(); }
        else if (!e.shiftKey && D.activeElement === nodes.at(-1)) { e.preventDefault(); nodes[0]?.focus(); }
      }
    }, true);
  }
  function campo(parent, nome, valor) {
    const box = el('div', parent, null, 'bol-fin-campo'); el('small', box, nome); el('strong', box, str(valor) || 'Não informado');
  }
  function origens(parent, nomes, rows) {
    el('h3', parent, nomes);
    if (!rows.length) { el('p', parent, 'Nenhuma origem detalhada disponível neste registro.'); return; }
    rows.forEach(row => {
      const box = el('article', parent, null, 'bol-fin-origem');
      el('strong', box, row.desc || (row.nfNumero ? 'NF ' + row.nfNumero : 'Título de origem'));
      el('p', box, [row.nfNumero ? 'NF: ' + row.nfNumero : '', 'Vencimento: ' + date(row.venc || row.vencimento), 'Valor: ' + money(row.valor)].filter(Boolean).join(' • '));
      if (row.pgto) el('p', box, 'Pagamento: ' + row.pgto);
    });
  }
  async function abrir(id, registroLido = null) {
    const tid = str(state().tid), record = registroLido || array(state().financeiro).find(f => str(f.id) === str(id));
    if (!tid || !record || (record.tenantId && str(record.tenantId) !== tid)) { W.toast?.('Boleto não encontrado nesta oficina. Atualize a lista.', 'warn'); return; }
    montar(); focoAnterior = D.activeElement; const atual = ++token;
    corpo.replaceChildren(); aviso.textContent = ''; modal.classList.add('open');
    titulo.textContent = record.boletoNumero ? 'BOLETO ' + record.boletoNumero : 'BOLETO CADASTRADO';
    el('p', corpo, record.desc || 'Descrição não informada');
    const grid = el('div', corpo, null, 'bol-fin-grid');
    const fornecedor = array(state().fornecedores).find(f => str(f.id) === str(record.fornecedorId || str(record.vinculo).replace(/^F_/, '')));
    campo(grid, 'Valor deste boleto', money(record.valor)); campo(grid, 'Vencimento', date(record.venc || record.vencimento));
    campo(grid, 'Status registrado', record.status); campo(grid, 'Forma de pagamento', record.pgto);
    campo(grid, 'Fornecedor', record.fornecedorNome || fornecedor?.nome); campo(grid, 'Número do boleto', record.boletoNumero);
    if (record.boletoBanco) campo(grid, 'Banco', record.boletoBanco);
    if (record.boletoParcela || record.boletoTotalParcelas) campo(grid, 'Parcela', str(record.boletoParcela || '?') + ' / ' + str(record.boletoTotalParcelas || '?'));
    if (record.pacoteBoletoNumero) campo(grid, 'Pacote', record.pacoteBoletoNumero);
    if (record.boletoLinhaDigitavel) {
      el('h3', corpo, 'Linha digitável cadastrada');
      const linha = el('textarea', corpo, null, 'j-textarea'); linha.value = str(record.boletoLinhaDigitavel); linha.readOnly = true; linha.rows = 3; linha.setAttribute('aria-label', 'Linha digitável cadastrada');
      button(corpo, 'Copiar linha digitável', async () => {
        try { await W.navigator.clipboard.writeText(linha.value); if (atual === token) aviso.textContent = 'Linha digitável copiada.'; }
        catch (_) { linha.focus(); linha.select(); if (atual === token) aviso.textContent = 'Linha selecionada. Use a opção Copiar do aparelho.'; }
      });
    }
    const observacoes = [record.nota, record.obs].filter((s, i, all) => s && all.indexOf(s) === i);
    if (observacoes.length) { el('h3', corpo, 'Observações / histórico do cadastro'); observacoes.forEach(s => el('p', corpo, s)); }
    const relacionado = el('section', corpo); const estado = el('p', relacionado, 'Carregando os vínculos do boleto…', 'bol-fin-estado'); estado.setAttribute('role', 'status');
    const memo = new Map();
    async function ler(collection, idDoc, target) {
      const key = str(idDoc); if (!key || key.includes('/') || str(state().tid) !== tid) return null;
      const cache = array(state()[target]).find(x => str(x.id) === key && (!x.tenantId || str(x.tenantId) === tid));
      if (cache) return cache;
      const keyMemo = collection + ':' + key; if (memo.has(keyMemo)) return memo.get(keyMemo);
      const promise = (async () => {
        const banco = W.db || state().db; if (!banco) return null;
        const snap = await banco.collection(collection).doc(key).get();
        if (!snap.exists) return null;
        const data = snap.data(); return str(data?.tenantId) === tid ? { ...data, id: key } : null;
      })(); memo.set(keyMemo, promise); return promise;
    }
    const ativo = () => atual === token && modal.classList.contains('open') && str(state().tid) === tid;
    modal.querySelector('button')?.focus();
    try {
      let origensExibidas = false;
      if (array(record.notasAgrupadas).length) { origens(relacionado, 'Notas / títulos que compõem o agrupamento', record.notasAgrupadas); origensExibidas = true; }
      const vinculados = [...new Set([...array(record.agrupadoNoBoletoIds), record.agrupadoNoBoletoId].filter(Boolean).map(String))];
      if (vinculados.length) {
        const boletos = await Promise.all(vinculados.map(k => ler('financeiro', k, 'financeiro'))); if (!ativo()) return;
        el('h3', relacionado, 'Boletos vinculados a este título de origem');
        boletos.forEach(b => {
          if (!b) { el('p', relacionado, 'Um boleto vinculado não está disponível para consulta.'); return; }
          const row = el('article', relacionado, null, 'bol-fin-origem'); el('strong', row, b.desc || 'Boleto vinculado');
          el('p', row, 'Vencimento: ' + date(b.venc) + ' • Valor: ' + money(b.valor) + ' • Status: ' + str(b.status));
          button(row, 'Abrir este boleto', () => abrir(b.id, b));
        });
      }
      if (record.pacoteBoletoId) {
        const pacote = await ler('pacotes_boletos', record.pacoteBoletoId, 'pacotesBoletos'); if (!ativo()) return;
        if (pacote) {
          el('h3', relacionado, 'Pacote ' + str(pacote.numero || record.pacoteBoletoNumero || 'cadastrado'));
          origens(relacionado, 'Notas / títulos do pacote', array(pacote.titulos)); origensExibidas = array(pacote.titulos).length > 0;
          el('h3', relacionado, 'Boletos cadastrados no pacote');
          array(pacote.boletos).forEach(b => { const box = el('article', relacionado, null, 'bol-fin-origem'); el('strong', box, 'Boleto ' + str(b.numero || 'sem número')); el('p', box, 'Vencimento: ' + date(b.vencimento) + ' • Valor: ' + money(b.valor)); if (b.obs) el('p', box, b.obs); });
        } else el('p', relacionado, 'Os detalhes do pacote não estão disponíveis. Os dados deste boleto estão exibidos acima.');
      }
      if (!origensExibidas && array(record.titulosOrigem).length) {
        const origem = await Promise.all(record.titulosOrigem.map(k => ler('financeiro', k, 'financeiro'))); if (!ativo()) return;
        origens(relacionado, 'Títulos de origem', origem.filter(Boolean));
        if (origem.some(x => !x)) el('p', relacionado, 'Um ou mais títulos de origem não estão disponíveis para consulta.');
      }
      const nfId = record.notaFiscalId || record.nfId;
      if (nfId) {
        const nf = await ler('notas_fiscais_entrada', nfId, 'notasFiscaisEntrada'); if (!ativo()) return;
        el('h3', relacionado, 'Nota fiscal de entrada vinculada');
        if (nf) {
          const info = el('div', relacionado, null, 'bol-fin-grid');
          campo(info, 'Número da NF', nf.numero); campo(info, 'Data da NF', date(nf.dataNF || nf.data));
          campo(info, 'Total registrado da NF', money(nf.totalNF)); campo(info, 'Fornecedor da NF', nf.fornecedorNome);
          if (nf.chave) { el('p', relacionado, 'Chave da NF: ' + nf.chave); }
        } else el('p', relacionado, 'A NF vinculada não está disponível para consulta. Os dados do boleto permanecem exibidos acima.');
      }
      if (!ativo()) return;
      if (relacionado.children.length === 1) el('p', relacionado, 'Este registro não possui outros vínculos detalhados.');
      estado.remove();
    } catch (erro) {
      if (ativo()) estado.textContent = 'Não foi possível consultar todos os vínculos. Os dados cadastrados do boleto estão exibidos acima.';
      console.warn('[Financeiro / consulta do boleto]', erro?.message || erro);
    }
  }
  W.financeiroPodeAbrirBoleto = canOpen;
  W.abrirBoletoFinanceiro = id => abrir(id);
  D.addEventListener('click', e => {
    const button = e.target.closest?.('[data-boleto-financeiro]'); if (!button) return;
    e.preventDefault(); abrir(button.dataset.boletoFinanceiro).catch(err => W.toast?.('Não foi possível abrir o boleto: ' + str(err?.message || err), 'err'));
  });
})(window, document);
