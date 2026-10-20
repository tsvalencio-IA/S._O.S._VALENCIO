/* Contrato único de apresentação pública. Nunca exibe o texto da auditoria. */
(function(W){
  'use strict';
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[_\s/]+/g,' ').trim().toLowerCase();
  const statuses=new Map(Object.entries({aguardando:'Aguardando',triagem:'Triagem',avaliacao:'Em avaliação','triagem avaliacao':'Em avaliação',
    'em orcamento':'Em orçamento',orcamento:'Em orçamento','orcamento enviado':'Orçamento enviado',aprovado:'Aprovado',
    andamento:'Em serviço',box:'Em serviço',patio:'Triagem',aprovacao:'Orçamento enviado','em servico':'Em serviço','em execucao':'Em serviço',pronto:'Pronto para retirada','pronto retirada':'Pronto para retirada',
    entregue:'Entregue',concluido:'Concluído',finalizado:'Finalizado',faturado:'Faturado',cancelado:'Cancelado'}));
  function project(t){
    if(!t||t.visivelCliente===false)return null;
    const type=String(t.tipo||t.tipoEvento||'').toLowerCase();
    let status=null,budget=false;
    if(type==='status_os')status=statuses.get(norm(t.statusNovo));
    else if(['orcamento_enviado','envio_orcamento'].includes(type))budget=true;
    else if(!type && t.interno!==true){
      // Legado: extrair apenas o destino de um formato conhecido. O restante
      // da mensagem (motivo, códigos, observações) nunca vai para o cliente.
      const a=String(t.acao||'');
      const m=a.match(/^Status:\s*[^\n]*?\s*(?:->|→)\s*([^\.\n]+)(?:\. Motivo:[\s\S]*)?$/i)
        ||a.match(/^Status alterado para:\s*([^\.\n]+)\.?$/i);
      if(m)status=statuses.get(norm(m[1]));
    }
    if(!status&&!budget)return null;
    const user=String(t.user||t.usuario||t.usuarioNome||'Equipe');
    return {dt:t.dt||t.data||'',user,tipo:budget?'orcamento_enviado':'status_os',statusNovo:status||'',
      texto:budget||status==='Orçamento enviado'?'Orçamento enviado por '+user+'.':'Status do veículo atualizado para '+status+' por '+user+'.'};
  }
  W.PortalEventosPublicos={project,list:timeline=>(Array.isArray(timeline)?timeline:[]).map(project).filter(Boolean)};
})(window);
