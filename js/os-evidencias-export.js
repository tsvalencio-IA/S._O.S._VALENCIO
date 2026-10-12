/*
 * S.O.S. VALENCIO — Evidências consolidadas da O.S.
 * Somente leitura: reúne URLs já existentes; não grava no Firestore/Cloudinary.
 * Utilizado pelo laudo PDF e pela planilha agrupada do cliente oficial.
 */
(function (W) {
  'use strict';
  const asArray = v => Array.isArray(v) ? v : [];
  const urlOf = m => typeof m === 'string' ? m : (m?.url || m?.secure_url || m?.fotoUrl || m?.imageUrl || m?.src || '');
  const validUrl = u => /^https:\/\/|^http:\/\//i.test(String(u || '').trim());
  const descriptionOf = m => String(
    typeof m === 'object' && m !== null
      ? m.descricao || m.legenda || m.observacao || m.obs || m.caption || m.description || ''
      : ''
  ).trim().slice(0, 420);
  const videoOf = m => {
    const tipo = String(m?.type || m?.tipo || m?.resource_type || '').toLowerCase();
    return /^video(?:\/|$)/.test(tipo) || /\.(?:mp4|mov|m4v|webm)(?:\?|$)/i.test(urlOf(m));
  };
  function coletar(os, opcoes = {}) {
    const fonte = os || {};
    const encontrados = new Map();
    const ordem = [];
    const push = (m, origem, observacaoPadrao) => {
      const url = String(urlOf(m) || '').trim();
      if (!validUrl(url)) return;
      const item = typeof m === 'string' ? { url, type: 'image' } : { ...m, url };
      const descricao = descriptionOf(item) || String(observacaoPadrao || '').trim().slice(0, 420);
      const nova = {
        ...item,
        url,
        type: videoOf(item) ? 'video' : 'image',
        descricao,
        origem: String(item.origem || origem || 'Galeria da O.S.'),
        uploadedAt: item.uploadedAt || item.enviadoEm || '',
        importedAt: item.importedAt || item.vinculadoEm || ''
      };
      if (encontrados.has(url)) {
        const anterior = encontrados.get(url);
        encontrados.set(url, {
          ...anterior,
          ...nova,
          descricao: descricao || anterior.descricao,
          uploadedAt: nova.uploadedAt || anterior.uploadedAt,
          importedAt: nova.importedAt || anterior.importedAt
        });
      } else {
        ordem.push(url);
        encontrados.set(url, nova);
      }
    };
    asArray(fonte.fotos).forEach(m => push(m, 'Galeria da O.S.'));
    asArray(fonte.media).forEach(m => push(m, 'Galeria da O.S.'));
    // Na O.S. aberta, a edição atual da legenda prevalece mesmo antes de salvar.
    asArray(opcoes.mediaAtual).forEach(m => push(m, 'Galeria da O.S.'));
    const checklists = [
      fonte.checklistResumo, fonte.checklistUltimo, fonte.checklistEntregaResumo,
      fonte.checklistEntregaUltimo, fonte.entregaRegistro,
      ...asArray(fonte.checklistsTecnicos), ...asArray(fonte.checklistsEntrega)
    ].filter(c => c && typeof c === 'object');
    checklists.forEach(c => {
      const rotulo = String(c.tipo || '').toLowerCase().includes('entrega') ? 'Checklist de entrega' : 'Checklist técnico';
      asArray(c.fotoUrls || c.fotosGeraisUrls).forEach(m => push(m, rotulo));
      Object.entries(c.itemPhotos || c.itemFotos || {}).forEach(([id, fotos]) => {
        asArray(fotos).forEach(m => push(m, rotulo, id));
      });
      asArray(c.itens || c.criticos).forEach(i => {
        const titulo = String(i?.item || i?.descricao || i?.titulo || '').trim();
        asArray(i?.fotoUrls || i?.fotosUrls).forEach(m => push(m, rotulo, titulo));
      });
    });
    return ordem.map(url => encontrados.get(url));
  }
  W.thiaEvidenciasOS = Object.freeze({
    coletar,
    fotos: (os, opcoes) => coletar(os, opcoes).filter(m => m.type !== 'video')
  });
})(window);
