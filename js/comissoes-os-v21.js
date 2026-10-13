/**
 * OFICIN-IA V24 — Comissões rastreáveis por O.S., serviço e mecânico.
 * Cada card mostra somente os serviços realmente atribuídos ao colaborador.
 * O rateio interno do valor do serviço aparece somente no financeiro.
 * Powered by thIAguinho Soluções Digitais
 */
(function(){
  'use strict';
  const $id=id=>document.getElementById(id);
  const n=v=>{
    if(window.JOS?.parseNumberBR)return window.JOS.parseNumberBR(v);
    if(typeof v==='number')return Number.isFinite(v)?v:0;
    let s=String(v??'').trim().replace(/\s|R\$/gi,'');
    if(s.includes(',')&&s.includes('.'))s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
    else if(s.includes(','))s=s.replace(',','.');
    const x=parseFloat(s);return Number.isFinite(x)?x:0;
  };
  const money=v=>(typeof window.moeda==='function'?window.moeda(n(v)):'R$ '+n(v).toFixed(2).replace('.',','));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const isPaid=f=>['pago','liquidado','baixado','parcial'].includes(norm(f?.status))||!!f?.pagoEm||!!f?.dataPgto;
  const isCanceled=f=>['cancelado','cancelada','compensado'].includes(norm(f?.status))||f?.canceladoPorReemissaoOS===true;
  const finalStatus=o=>/pronto|entregue|concluido|faturado|finalizado/i.test(String(o?.status||''));
  const selectedFunc=()=> (window.J?.equipe||[]).find(f=>String(f.id)===String($id('rhPgtoFunc')?.value||''));
  const vehicleFor=os=>(window.J?.veiculos||[]).find(v=>String(v.id)===String(os?.veiculoId||''))||os?.veiculoSnapshot||{};
  const clientFor=os=>(window.J?.clientes||[]).find(c=>String(c.id)===String(os?.clienteId||''))||{};

  function ensureStyles(){
    if($id('com-v22-style'))return;
    const st=document.createElement('style');st.id='com-v22-style';st.textContent=`
      #comListaV21{overflow-x:hidden!important;max-width:100%;box-sizing:border-box}
      .com-v22-os{border:1px solid rgba(0,212,255,.20);border-radius:5px;background:rgba(0,212,255,.035);overflow:hidden;max-width:100%;min-width:0}
      .com-v22-row{display:grid;grid-template-columns:24px minmax(0,1fr) minmax(92px,116px);gap:7px;align-items:center;border:1px solid rgba(255,255,255,.08);border-radius:4px;padding:7px;min-width:0;max-width:100%;box-sizing:border-box}
      .com-v22-row label{min-width:0;overflow-wrap:anywhere}
      .com-v22-row .j-input{width:100%;min-width:0;max-width:100%;box-sizing:border-box}
      .com-v22-toolbar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:0 0 8px}
      .com-v22-hist{margin-top:10px;border-top:1px solid rgba(255,255,255,.08);padding-top:9px;font-family:var(--fm);font-size:.62rem;color:var(--muted2);line-height:1.5}
      .com-v22-os-head{display:grid;grid-template-columns:24px minmax(0,1fr);gap:6px;align-items:start;padding:8px 10px;background:rgba(0,0,0,.18);font-family:var(--fm);font-size:.66rem;color:var(--cyan);overflow-wrap:anywhere}
      @media(max-width:720px){
        .com-v22-row{grid-template-columns:24px minmax(0,1fr)}
        .com-v22-row .com-valor-v21{grid-column:1/-1;width:100%}
        #comListaV21{max-height:54vh!important;padding-right:0!important}
      }
    `;document.head.appendChild(st);
  }

  function paymentAllocations(fin){
    if(Array.isArray(fin?.alocacoesComissao))return fin.alocacoesComissao;
    if(Array.isArray(fin?.itensComissaoPagos))return fin.itensComissaoPagos;
    return [];
  }

  function paidMapFor(mecId){
    const map=new Map();
    (window.J?.financeiro||[]).filter(f=>f?.isComissao===true&&String(f.mecId||'')===String(mecId||'')&&!isCanceled(f)&&isPaid(f)).forEach(fin=>{
      const allocs=paymentAllocations(fin);
      if(allocs.length){
        allocs.forEach(a=>{
          const key=`${a.osId||fin.osId||''}|${a.servicoKey||a.key||''}`;
          map.set(key,(map.get(key)||0)+n(a.valorPago??a.valor??0));
        });
        return;
      }
      const servs=Array.isArray(fin.servicosComissao)?fin.servicosComissao:[];
      let restante=n(fin.valor||0);
      servs.forEach((s,idx)=>{
        if(restante<=0)return;
        const previsto=n(s.valorComissao??s.comissao??0),parcela=previsto>0?Math.min(restante,previsto):0;
        if(parcela>0){const key=`${fin.osId||''}|${s.key||`servico-${idx}`}`;map.set(key,(map.get(key)||0)+parcela);restante-=parcela;}
      });
      if(restante>0&&fin.osId){const key=`${fin.osId}|pecas`;map.set(key,(map.get(key)||0)+restante);}
    });
    return map;
  }

  function rateioDoMecanico(os,item,mecId,registro,mec){
    const origem=(os?.servicos||[])[Number(item?.index)]||{};
    const diretos=Array.isArray(item?.rateiosComissao)?item.rateiosComissao:[];
    const salvos=Array.isArray(origem.rateiosComissao)?origem.rateiosComissao:[];
    const rateios=diretos.length?diretos:salvos;
    const nomeMec=norm(mec?.nome||mec?.usuario||'');
    const achado=rateios.find(r=>{
      const rid=String(r?.mecId||r?.id||'');
      const rnome=norm(r?.mecNome||r?.nome||'');
      return (rid&&rid===String(mecId||''))||(!rid&&nomeMec&&rnome===nomeMec)||(nomeMec&&rnome===nomeMec);
    });
    if(achado)return {valorBase:Math.max(0,n(achado.valorBase??achado.valorDividido??achado.baseComissao??0)),legado:false,explicito:true};
    if(rateios.length)return null;
    const responsavel=registro?.mecId||registro?.responsavelId||origem.mecId||origem.mecanicoId||origem.responsavelId||item?.mecId||item?.responsavelId||os?.mecId||'';
    const responsavelNome=norm(registro?.mecNome||registro?.responsavelNome||origem.mecNome||origem.mecanicoNome||origem.responsavelNome||item?.mecNome||item?.responsavelNome||'');
    if(String(responsavel)!==String(mecId||'')&&(!nomeMec||responsavelNome!==nomeMec))return null;
    return {valorBase:Math.max(0,n(item?.valorFinal||0)),legado:true,explicito:false};
  }

  function totalPagoOSMecanico(mecId,osId){
    return +(window.J?.financeiro||[]).filter(f=>f?.isComissao===true&&String(f.mecId||'')===String(mecId||'')&&String(f.osId||'')===String(osId||'')&&!isCanceled(f)&&isPaid(f)).reduce((s,f)=>s+n(f.valor||0),0).toFixed(2);
  }

  function comissaoOficialConfigurada(os,cli){
    const tipo=norm(cli?.tipoCliente||cli?.tipo||os?.tipoCliente||'');
    const oficial=!!window.JOS?.isOfficialClient?.(os,cli) || tipo==='governo'||tipo==='oficial'||cli?.clienteOficial===true;
    const cfg=os?.comissaoOficialOS||{};
    if(!oficial||cfg?.ativa!==true||!Array.isArray(cfg?.rateios))return null;
    const rateios=cfg.rateios.map(r=>({mecId:String(r?.mecId||r?.id||''),mecNome:r?.mecNome||r?.nome||'',valor:Math.max(0,n(r?.valor??r?.valorPrevisto??0))})).filter(r=>r.mecId&&r.valor>0);
    return rateios.length?{...cfg,rateios}:null;
  }

  function rowsFor(mec){
    if(!mec)return[];
    const pct=50,pagos=paidMapFor(mec.id),rows=[];
    (window.J?.os||[]).filter(o=>!/^cancel/i.test(String(o?.status||''))).forEach(os=>{
      const cli=clientFor(os),vei=vehicleFor(os);
      const cfgOficial=comissaoOficialConfigurada(os,cli);
      if(!!window.JOS?.isOfficialClient?.(os,cli) || ['governo','oficial'].includes(norm(cli?.tipoCliente||cli?.tipo||os?.tipoCliente||'')) || cli?.clienteOficial===true){
        if(!cfgOficial)return;
        const rateio=cfgOficial.rateios.find(r=>String(r.mecId)===String(mec.id));
        if(rateio){
          const previsto=+n(rateio.valor).toFixed(2),pago=totalPagoOSMecanico(mec.id,os.id),falta=Math.max(0,+(previsto-pago).toFixed(2));
          rows.push({osId:os.id,servicoKey:'oficial-viatura',servico:'COMISSÃO FIXA DA VIATURA — CLIENTE OFICIAL',placa:vei.placa||os.placa||'',veiculo:vei.modelo||vei.veiculo||os.veiculoSnapshot?.modelo||os.veiculo||'',cliente:cli.nome||os.clienteNome||os.cliente||'',status:os.status||'',data:os.data||os.createdAt||'',valorServico:previsto,base:previsto,percentual:100,previsto,pago,falta,finalizada:finalStatus(os),legado:false,rateioExplicito:true,semPercentual:false,aguardandoExecucao:false,liberadaPorValorCombinado:true,comissaoOficial:true});
        }
        return;
      }
      const itens=window.JOS?.buildBudgetItems?window.JOS.buildBudgetItems(os,cli):[];
      const aprovacaoAtiva=window.JOS?.hasApproval?.(os),aprovados=window.JOS?.getApprovedKeys?.(os)||new Set(),exec=os.execucaoItens||{};
      const temExecServico=Object.entries(exec).some(([key,val])=>String(key).startsWith('servico-')&&String(val?.status||'').trim());
      const statusExecutado=st=>/^(executado|executado_obs|concluido|finalizado|feito|realizado|trocada)$/i.test(String(st||'').trim());
      itens.filter(it=>it.tipo==='servico').forEach(it=>{
        const origem=(os?.servicos||[])[it.index]||{};
        const tipoExec=norm(origem.tipoExecucao||origem.execucaoTipo||it.tipoExecucao||'');
        if(['terceirizada','terceirizado','externa','externo'].includes(tipoExec)||origem.terceirizado===true||origem.servicoTerceirizado===true||origem.terceirizadoNome||origem.prestadorNome)return;
        if(aprovacaoAtiva&&!aprovados.has(it.key))return;
        const reg=exec[it.key]||{};
        const elegivelPagamento=temExecServico?statusExecutado(reg.status):finalStatus(os);
        const rateio=rateioDoMecanico(os,it,mec.id,reg,mec);
        if(!rateio||rateio.valorBase<=0)return;
        // O serviço explicitamente dividido continua visível antes da finalização,
        // mas permanece bloqueado para pagamento até existir execução confirmada ou O.S. finalizada.
        if(!elegivelPagamento&&!rateio.explicito)return;
        const base=+Math.min(n(it.valorFinal||0),rateio.valorBase).toFixed(2),previsto=+(base*(pct/100)).toFixed(2);
        const key=`${os.id}|${it.key}`,pago=+(pagos.get(key)||0).toFixed(2),falta=Math.max(0,+(previsto-pago).toFixed(2));
        rows.push({osId:os.id,servicoKey:it.key,servico:it.desc||'Serviço',placa:vei.placa||os.placa||'',veiculo:vei.modelo||vei.veiculo||os.veiculoSnapshot?.modelo||os.veiculo||'',cliente:cli.nome||os.clienteNome||os.cliente||'',status:os.status||'',data:os.data||os.createdAt||'',valorServico:n(it.valorFinal||0),base,percentual:pct,previsto,pago,falta,finalizada:finalStatus(os),legado:rateio.legado,rateioExplicito:rateio.explicito===true,semPercentual:pct<=0,aguardandoExecucao:!elegivelPagamento});
      });
      const pctPeca=n(mec.comissaoPeca||0),principal=String(os.mecId||os.mecIds?.[0]||'');
      const basePecas=itens.filter(it=>it.tipo==='peca'&&(!aprovacaoAtiva||aprovados.has(it.key))).reduce((sum,it)=>sum+n(it.valorFinal||0),0);
      if(basePecas>0&&pctPeca>0&&finalStatus(os)&&principal===String(mec.id)){
        const previsto=+(basePecas*(pctPeca/100)).toFixed(2),key=`${os.id}|pecas`,pago=+(pagos.get(key)||0).toFixed(2);
        rows.push({osId:os.id,servicoKey:'pecas',servico:'COMISSÃO SOBRE PEÇAS DA O.S.',placa:vei.placa||os.placa||'',veiculo:vei.modelo||os.veiculoSnapshot?.modelo||'',cliente:cli.nome||os.cliente||'',status:os.status||'',data:os.data||os.createdAt||'',valorServico:basePecas,base:basePecas,percentual:pctPeca,previsto,pago,falta:Math.max(0,+(previsto-pago).toFixed(2)),finalizada:true,legado:false});
      }
    });
    return rows.sort((a,b)=>String(b.data).localeCompare(String(a.data))||a.placa.localeCompare(b.placa));
  }

  function ensureUI(){
    ensureStyles();const modal=$id('modalPgtoRH');if(!modal)return;
    if($id('boxComissaoDetalhadaV21'))return;
    const body=modal.querySelector('.modal-body');if(!body)return;
    const box=document.createElement('div');box.id='boxComissaoDetalhadaV21';box.style.display='none';
    box.innerHTML=`<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px;max-width:100%;overflow:hidden"><div style="font-family:var(--fd);font-weight:800;color:var(--cyan);letter-spacing:1px;margin-bottom:6px;">COMISSÃO POR O.S. E SERVIÇO</div><div style="font-family:var(--fm);font-size:.61rem;color:var(--muted);line-height:1.45;margin-bottom:8px;">Selecione uma ou várias O.S./serviços. Pode quitar tudo agora ou informar valor parcial; pagamentos posteriores da mesma O.S. ficam registrados separadamente.</div><input id="comBuscaV21" class="j-input" type="search" placeholder="Pesquisar O.S., placa, veículo ou serviço..." autocomplete="off" style="margin-bottom:8px;width:100%;box-sizing:border-box"><div class="com-v22-toolbar"><button type="button" class="btn-outline" onclick="window.selecionarComissoesDisponiveisV21()">✓ SELECIONAR DISPONÍVEIS</button><button type="button" class="btn-ghost" onclick="window.limparSelecaoComissoesV21()">LIMPAR SELEÇÃO</button></div><div id="comResumoV21" style="font-family:var(--fm);font-size:.68rem;color:var(--warn);margin-bottom:8px;"></div><div id="comListaV21" style="display:grid;gap:8px;max-height:43vh;overflow:auto;padding-right:3px;"></div><div id="comHistoricoV21" class="com-v22-hist"></div></div>`;
    body.appendChild(box);
    $id('rhPgtoTipo')?.addEventListener('change',toggle);$id('rhPgtoFunc')?.addEventListener('change',render);$id('comBuscaV21')?.addEventListener('input',render);
    modal.addEventListener('input',e=>{if(e.target?.classList?.contains('com-valor-v21'))updateSummary();});
    modal.addEventListener('change',e=>{
      if(e.target?.classList?.contains('com-os-check-v21')){
        const boxOs=e.target.closest('.com-v22-os');
        boxOs?.querySelectorAll('.com-check-v21:not(:disabled)').forEach(ch=>{ch.checked=e.target.checked;const row=ch.closest('[data-com-row]'),inp=row?.querySelector('.com-valor-v21');if(inp)inp.disabled=!ch.checked;});
        updateSummary();return;
      }
      if(e.target?.classList?.contains('com-check-v21')){const row=e.target.closest('[data-com-row]'),inp=row?.querySelector('.com-valor-v21');if(inp)inp.disabled=!e.target.checked;sincronizarCheckOSV21(row?.closest('.com-v22-os'));updateSummary();}
    });
  }

  function toggle(){ensureUI();const show=$id('rhPgtoTipo')?.value==='Pagamento Comissão',box=$id('boxComissaoDetalhadaV21');if(box)box.style.display=show?'block':'none';const val=$id('rhPgtoValor');if(val){val.readOnly=show;val.title=show?'Valor calculado pelos serviços selecionados.':'';}if(show)render();}

  function render(){
    ensureUI();if($id('rhPgtoTipo')?.value!=='Pagamento Comissão')return;
    const mec=selectedFunc(),list=$id('comListaV21');if(!list)return;
    if(!mec){list.innerHTML='<div style="padding:14px;color:var(--muted);">Selecione o colaborador.</div>';updateSummary();return;}
    const q=norm($id('comBuscaV21')?.value||''),rows=rowsFor(mec).filter(r=>!q||norm([r.osId,r.placa,r.veiculo,r.cliente,r.servico,r.status].join(' ')).includes(q));
    const groups=new Map();rows.forEach(r=>{if(!groups.has(r.osId))groups.set(r.osId,[]);groups.get(r.osId).push(r);});
    list.innerHTML=Array.from(groups.values()).map(group=>{const h=group[0],temDisponivel=group.some(r=>r.falta>0&&!r.semPercentual&&!r.aguardandoExecucao);return `<div class="com-v22-os" data-com-os="${esc(h.osId)}"><div class="com-v22-os-head"><input class="com-os-check-v21" type="checkbox" ${temDisponivel?'':'disabled'} title="Selecionar todos os serviços disponíveis desta O.S." style="width:auto;min-height:0;margin-top:2px"><div><b>O.S. #${esc(String(h.osId).slice(-6).toUpperCase())}</b> · ${esc(h.placa||'SEM PLACA')} · ${esc(h.veiculo||'VEÍCULO')}<br><span style="color:var(--muted)">${esc(h.cliente)} · ${esc(h.status)} · entrada ${esc(String(h.data||'').slice(0,10)||'-')}</span></div></div><div style="display:grid;gap:5px;padding:8px;min-width:0">${group.map(r=>{const id=`${r.osId}|${r.servicoKey}`.replace(/[^a-zA-Z0-9_-]/g,'_'),disabled=r.falta<=0||r.semPercentual||r.aguardandoExecucao,alertaPct=r.semPercentual?' · ⚠ percentual de comissão não cadastrado para este colaborador':'',alertaExec=r.aguardandoExecucao?' · ⏳ aguardando execução confirmada ou finalização da O.S.':'';return `<div class="com-v22-row" data-com-row data-os-id="${esc(r.osId)}" data-key="${esc(r.servicoKey)}" data-servico="${esc(r.servico)}" data-placa="${esc(r.placa)}" data-veiculo="${esc(r.veiculo)}" data-base="${r.base}" data-pct="${r.percentual}" data-previsto="${r.previsto}" data-pago="${r.pago}" data-oficial="${r.comissaoOficial?'1':'0'}" style="${disabled?'opacity:.62;':''}"><input id="${id}" class="com-check-v21" type="checkbox" ${disabled?'disabled':''} style="width:auto;min-height:0"><label for="${id}" style="font-size:.75rem;line-height:1.35;cursor:pointer"><b>${esc(r.servico)}</b><br><small style="color:${r.semPercentual||r.aguardandoExecucao?'var(--warn)':'var(--muted)'}">${r.comissaoOficial?`Valor combinado para esta viatura ${money(r.previsto)} · já pago ${money(r.pago)} · falta ${money(r.falta)} · disponível para pagamento independentemente do status da O.S.`:`Valor cobrado ${money(r.valorServico)} · base interna deste mecânico ${money(r.base)} · ${r.percentual.toFixed(2).replace('.',',')}% · comissão prevista ${money(r.previsto)} · já paga ${money(r.pago)} · falta ${money(r.falta)}${alertaPct}${alertaExec}`}</small></label><input class="j-input com-valor-v21" type="text" inputmode="decimal" value="${r.falta>0?r.falta.toFixed(2).replace('.',','):''}" ${disabled?'disabled':''} style="text-align:right" title="Valor da comissão a pagar agora neste serviço"></div>`;}).join('')}</div></div>`;}).join('')||'<div style="padding:14px;color:var(--muted);text-align:center;">Nenhum serviço atribuído a este colaborador.</div>';
    renderHistoricoPagamentos(mec);
    aplicarPreSelecaoIA(mec);
    updateSummary();
  }

  function sincronizarCheckOSV21(boxOs){
    if(!boxOs)return;const pai=boxOs.querySelector('.com-os-check-v21'),chs=Array.from(boxOs.querySelectorAll('.com-check-v21:not(:disabled)'));if(!pai)return;
    const marcadas=chs.filter(ch=>ch.checked).length;pai.checked=!!chs.length&&marcadas===chs.length;pai.indeterminate=marcadas>0&&marcadas<chs.length;
  }
  function renderHistoricoPagamentos(mec){
    const box=$id('comHistoricoV21');if(!box)return;
    const hist=(window.J?.financeiro||[]).filter(f=>f?.isComissao===true&&isPaid(f)&&!isCanceled(f)&&String(f.mecId||'')===String(mec?.id||''))
      .sort((a,b)=>String(b.dataPgto||b.pagoEm||b.venc||b.createdAt||'').localeCompare(String(a.dataPgto||a.pagoEm||a.venc||a.createdAt||''))).slice(0,12);
    if(!hist.length){box.innerHTML='<b style="color:var(--cyan)">HISTÓRICO DE PAGAMENTOS</b><br>Nenhum pagamento de comissão registrado para este colaborador.';return;}
    box.innerHTML='<b style="color:var(--cyan)">HISTÓRICO DE PAGAMENTOS</b><br>'+hist.map(f=>{
      const data=String(f.dataPgto||f.venc||f.pagoEm||f.createdAt||'').slice(0,10).split('-').reverse().join('/');
      const os=String(f.osId||'').slice(-6).toUpperCase(),placa=f.placa||'',obs=f.nota||'';
      return `- ${esc(data||'-')} · ${placa?esc(placa):('O.S. '+esc(os))} · ${money(f.valor||0)} · ${esc(f.pgto||f.forma||'')}${obs?` · ${esc(obs)}`:''}`;
    }).join('<br>');
  }
  function aplicarPreSelecaoIA(mec){
    const pre=window.__comissaoPreselectV21;if(!pre||String(pre.mecId||'')!==String(mec?.id||''))return;
    const ids=new Set((pre.osIds||[]).map(String));
    document.querySelectorAll('#comListaV21 [data-com-row]').forEach(row=>{if(ids.size&&!ids.has(String(row.dataset.osId||'')))return;const ch=row.querySelector('.com-check-v21');if(ch&&!ch.disabled){ch.checked=true;const inp=row.querySelector('.com-valor-v21');if(inp)inp.disabled=false;}});
    document.querySelectorAll('#comListaV21 .com-v22-os').forEach(sincronizarCheckOSV21);
    window.__comissaoPreselectV21=null;
  }
  window.selecionarComissoesDisponiveisV21=function(){document.querySelectorAll('#comListaV21 .com-check-v21:not(:disabled)').forEach(ch=>{ch.checked=true;const inp=ch.closest('[data-com-row]')?.querySelector('.com-valor-v21');if(inp)inp.disabled=false;});document.querySelectorAll('#comListaV21 .com-v22-os').forEach(sincronizarCheckOSV21);updateSummary();};
  window.limparSelecaoComissoesV21=function(){document.querySelectorAll('#comListaV21 .com-check-v21').forEach(ch=>{ch.checked=false;const inp=ch.closest('[data-com-row]')?.querySelector('.com-valor-v21');if(inp&&!ch.disabled)inp.disabled=true;});document.querySelectorAll('#comListaV21 .com-v22-os').forEach(sincronizarCheckOSV21);updateSummary();};

  function selectedAllocations(){return Array.from(document.querySelectorAll('#comListaV21 [data-com-row]')).filter(row=>row.querySelector('.com-check-v21')?.checked).map(row=>({osId:row.dataset.osId||'',servicoKey:row.dataset.key||'',servico:row.dataset.servico||'',placa:row.dataset.placa||'',veiculo:row.dataset.veiculo||'',baseServico:n(row.dataset.base),percentual:n(row.dataset.pct),valorComissaoPrevista:n(row.dataset.previsto),valorJaPagoAntes:n(row.dataset.pago),valorPago:n(row.querySelector('.com-valor-v21')?.value||0),comissaoOficial:row.dataset.oficial==='1'})).filter(a=>a.valorPago>0);}
  function updateSummary(){const allocs=selectedAllocations(),total=allocs.reduce((s,a)=>s+a.valorPago,0);if($id('rhPgtoValor'))$id('rhPgtoValor').value=total?total.toFixed(2):'';if($id('comResumoV21'))$id('comResumoV21').textContent=allocs.length?`${allocs.length} serviço(s) selecionado(s) · pagamento agora ${money(total)}`:'Selecione os serviços que serão pagos agora.';}

  // Compatibilidade: implementação anterior mantida intacta. A rotina de pagamento
  // detalhado atual usa transação atômica e não chama esta função de lote legada.
  async function consumePending(batch,mecId,osId,valor,agora,paymentId){let restante=valor;const pend=(window.J?.financeiro||[]).filter(f=>f?.isComissao===true&&String(f.mecId||'')===String(mecId)&&String(f.osId||'')===String(osId)&&!isCanceled(f)&&!isPaid(f)).sort((a,b)=>String(a.venc||a.createdAt||'').localeCompare(String(b.venc||b.createdAt||'')));for(const fin of pend){if(restante<=.001)break;const atual=n(fin.valor||0),usar=Math.min(atual,restante),novo=+(atual-usar).toFixed(2),ref=window.db.collection('financeiro').doc(fin.id);if(novo<=.001)batch.update(ref,{status:'Cancelado',valor:0,compensadoPorPagamentoComissao:true,pagamentoComissaoId:paymentId,motivoCancelamento:'Saldo quitado por pagamento detalhado de comissão',updatedAt:agora});else batch.update(ref,{valor:novo,totalComissaoJaPago:+n(fin.totalComissaoJaPago||0)+usar,pagamentoComissaoId:paymentId,updatedAt:agora});restante-=usar;}}


  // Controle transacional do pagamento detalhado: todos os documentos da seleção
  // são lidos antes de qualquer escrita. A O.S. é o ponto de serialização entre
  // gestores/dispositivos; um pagamento simultâneo provoca nova validação.
  const centavos=v=>Math.round(n(v)*100);
  let salvandoDetalhado=false;
  async function saveDetailed(){
    if(salvandoDetalhado){window.toast?.('Um pagamento já está sendo registrado.','warn');return;}
    const mec=selectedFunc();
    if(!mec){window.toast?.('Selecione o colaborador.','warn');return;}
    const allocs=selectedAllocations();
    if(!allocs.length){window.toast?.('Selecione ao menos um serviço e informe o valor pago.','warn');return;}
    const linhasAtuais=rowsFor(mec);
    const disponiveis=new Map(linhasAtuais.map(r=>[`${r.osId}|${r.servicoKey}`,r]));
    const usados=new Set();
    for(const a of allocs){
      const key=`${a.osId}|${a.servicoKey}`;
      const origem=disponiveis.get(key);
      if(!origem || origem.semPercentual || origem.aguardandoExecucao || usados.has(key)){
        window.toast?.(`Seleção de comissão desatualizada: ${a.servico}. Atualize a lista.`, 'warn');return;
      }
      usados.add(key);
      // Nunca confiar no saldo/percentual enviado pelo DOM sem validar com o modelo atual.
      if(centavos(a.valorComissaoPrevista)!==centavos(origem.previsto) || centavos(a.valorJaPagoAntes)!==centavos(origem.pago)){
        window.toast?.(`Os valores de ${a.servico} mudaram. Atualize a seleção.`, 'warn');return;
      }
      if(centavos(a.valorPago)<=0 || centavos(a.valorPago)>centavos(origem.falta)){
        window.toast?.(`Valor excede saldo de ${a.servico}: ${money(origem.falta)}.`, 'warn');return;
      }
    }
    const groups=new Map();
    allocs.forEach(a=>{if(!groups.has(a.osId))groups.set(a.osId,[]);groups.get(a.osId).push(a);});
    if(groups.size>40){window.toast?.('Para preservar a operação atômica, selecione até 40 O.S. por pagamento.','warn');return;}
    const database=window.db;
    const agora=new Date().toISOString(),data=$id('rhPgtoData')?.value||agora.slice(0,10);
    const forma=$id('rhPgtoForma')?.value||'PIX',obs=$id('rhPgtoObs')?.value||'';
    const paymentId=database.collection('financeiro').doc().id;
    const actor=window.J?.nome||'Gestor',actorId=window.J?.uid||window.J?.fid||'';
    const totalGeral=+allocs.reduce((s,a)=>s+a.valorPago,0).toFixed(2);
    salvandoDetalhado=true;
    try{
      await database.runTransaction(async trx=>{
        const refs=Array.from(groups.keys()).map(osId=>[osId,database.collection('ordens_servico').doc(osId)]);
        const snapshots=new Map();
        for(const [osId,ref] of refs){
          const snap=await trx.get(ref);
          if(!snap.exists)throw new Error(`O.S. ${osId} não encontrada.`);
          const atual=snap.data()||{};
          if(String(atual.tenantId||'')!==String(window.J.tid||''))throw new Error('Oficina divergente na O.S.');
          const local=(window.J?.os||[]).find(o=>String(o.id)===String(osId));
          if(local?.updatedAt&&atual.updatedAt&&String(local.updatedAt)!==String(atual.updatedAt))throw new Error(`O.S. atualizada em outro dispositivo. Reabra comissões antes de pagar (${osId}).`);
          if(/^cancel/i.test(String(atual.status||'')))throw new Error(`O.S. cancelada (${osId}).`);
          snapshots.set(osId,{ref,atual});
        }
        // Também relê saldos financeiros reais para não reusar um pendente
        // que outro pagamento já consumiu/cancelou.
        const pendingRefs=new Map();
        for(const [osId,entry] of snapshots){
          const ctrl=entry.atual.comissaoControleV26?.[String(mec.id)]||{};
          const pend=(window.J?.financeiro||[]).filter(f=>f?.id&&f.isComissao===true&&String(f.mecId||'')===String(mec.id)&&String(f.osId||'')===String(osId)&&!isCanceled(f)&&!isPaid(f));
          const ids=new Set(pend.map(f=>String(f.id)));
          if(ctrl.saldoId)ids.add(String(ctrl.saldoId));
          for(const id of ids)pendingRefs.set(id,database.collection('financeiro').doc(id));
        }
        const pendSnap=new Map();
        for(const [id,ref] of pendingRefs)pendSnap.set(id,await trx.get(ref));
        // TODAS as leituras da transação estão concluídas neste ponto.
        for(const [osId,itens] of groups){
          const {ref:osRef,atual}=snapshots.get(osId);
          const allControl={...(atual.comissaoControleV26||{})};
          const mecControl={...(allControl[String(mec.id)]||{})};
          const pagosCentavos={...(mecControl.pagosCentavos||{})};
          const total=+itens.reduce((s,a)=>s+a.valorPago,0).toFixed(2);
          const placa=itens[0]?.placa||'',veiculo=itens[0]?.veiculo||'';
          const especialOficial=itens.some(a=>a.comissaoOficial===true);
          const liberados=linhasAtuais.filter(r=>String(r.osId)===String(osId)&&!r.semPercentual&&!r.aguardandoExecucao);
          for(const a of itens){
            const anterior=Math.max(centavos(a.valorJaPagoAntes),Number(pagosCentavos[a.servicoKey]||0));
            const previsto=centavos(a.valorComissaoPrevista),parcela=centavos(a.valorPago);
            if(anterior+parcela>previsto){throw new Error(`Pagamento duplicado/excedente bloqueado: ${a.servico} na O.S. ${placa||osId}. Reabra o extrato.`);}
            pagosCentavos[a.servicoKey]=anterior+parcela;
          }
          const residualCent=liberados.reduce((s,r)=>s+Math.max(0,centavos(r.previsto)-Math.max(centavos(r.pago),Number(pagosCentavos[r.servicoKey]||0))),0);
          const residual=+(residualCent/100).toFixed(2);
          const pendExistentes=Array.from(pendSnap.values()).filter(s=>s.exists&&
            String(s.data()?.osId||'')===String(osId)&&String(s.data()?.mecId||'')===String(mec.id)&&
            String(s.data()?.tenantId||'')===String(window.J.tid)&&!isCanceled(s.data())&&!isPaid(s.data()))
            .sort((a,b)=>String(a.data()?.venc||a.data()?.createdAt||'').localeCompare(String(b.data()?.venc||b.data()?.createdAt||'')));
          let restante=centavos(total);
          for(const p of pendExistentes){
            if(restante<=0)break;
            const fin=p.data(),atualCent=centavos(fin.valor||0),usar=Math.min(atualCent,restante),novoCent=atualCent-usar;
            if(usar<=0)continue;
            trx.update(p.ref,novoCent<=0?{
              status:'Cancelado',valor:0,compensadoPorPagamentoComissao:true,
              pagamentoComissaoId:paymentId,motivoCancelamento:'Saldo pago em comissão detalhada',updatedAt:agora
            }:{valor:novoCent/100,totalComissaoJaPago:+(n(fin.totalComissaoJaPago||0)+usar/100).toFixed(2),pagamentoComissaoId:paymentId,updatedAt:agora});
            restante-=usar;
          }
          // Apenas a primeira transação sem título pendente cria um saldo;
          // o ID fica na O.S., impedindo a duplicação no próximo dispositivo.
          if(!pendExistentes.length&&residualCent>0){
            const pendRef=database.collection('financeiro').doc();
            mecControl.saldoId=pendRef.id;
            trx.set(pendRef,{
              tenantId:window.J.tid,tipo:'Saída',status:'Pendente',isComissao:true,
              categoria:especialOficial?'comissao_cliente_oficial_viatura_parcial':'comissao_os_servico_parcial',
              origem:especialOficial?'saldo_comissao_cliente_oficial':'saldo_pagamento_comissao_detalhado',
              mecId:mec.id,mecNome:mec.nome||'',vinculo:`E_${mec.id}`,
              osId,placa,veiculo,valor:residual,pgto:'A Combinar',venc:data,
              desc:`Saldo de comissão — ${mec.nome} — O.S. ${placa||String(osId).slice(-6)}`,
              servicosComissao:liberados.map(r=>({key:r.servicoKey,desc:r.servico,
                valorComissao:Math.max(0,(centavos(r.previsto)-Math.max(centavos(r.pago),Number(pagosCentavos[r.servicoKey]||0)))/100),
                baseServico:r.base,percentual:r.percentual})),createdAt:agora,updatedAt:agora
            });
          }
          // Cada O.S. recebe o próprio lançamento integral, mesmo no pagamento em lote.
          const pagamentoRef=database.collection('financeiro').doc();
          trx.set(pagamentoRef,{
            tenantId:window.J.tid,tipo:'Saída',status:'Pago',isComissao:true,isComissaoPagamento:true,
            categoria:especialOficial?'pagamento_comissao_cliente_oficial':'pagamento_comissao_os_servico',
            origem:especialOficial?'pagamento_comissao_cliente_oficial':'pagamento_comissao_detalhado',
            comissaoClienteOficial:especialOficial,mecId:mec.id,mecNome:mec.nome||'',vinculo:`E_${mec.id}`,
            osId,placa,veiculo,valor:total,pgto:forma,venc:data,dataPgto:data,pagoEm:agora,
            pagamentoComissaoId:paymentId,registroPor:actor,registroPorId:actorId,
            situacaoComissao:residualCent>0?'parcial':'quitada',saldoComissaoDepois:residual,
            desc:`Pagamento comissão — ${mec.nome} — O.S. ${placa||String(osId).slice(-6)}`,
            nota:obs,alocacoesComissao:itens,itensComissaoPagos:itens,createdAt:agora,updatedAt:agora
          });
          mecControl.pagosCentavos=pagosCentavos;
          mecControl.ultimoPagamentoId=paymentId;
          mecControl.updatedAt=agora;
          allControl[String(mec.id)]=mecControl;
          const servicosPagos=itens.map(a=>a.servico).filter(Boolean).join('; ');
          trx.update(osRef,{
            comissaoControleV26:allControl,comissaoAtualizadaEm:agora,
            timeline:firebase.firestore.FieldValue.arrayUnion({
              dt:agora,user:actor,userId:actorId,perfil:window.J?.role||'gestor',
              tipo:'pagamento_comissao',mecanicoId:mec.id,mecanicoNome:mec.nome||'',
              valor:total,pagamentoComissaoId:paymentId,saldoPendente:residual,
              situacao:residualCent>0?'parcial':'quitada',
              acao:`Comissão ${residualCent>0?'parcialmente paga':'quitada'} para ${mec.nome}: ${money(total)}. Saldo estimado: ${money(residual)}${servicosPagos?' — '+servicosPagos:''}${obs?' — '+obs:''}`
            })
          });
        }
      });
      window.toast?.(`✓ Pagamento de comissão registrado: ${money(totalGeral)} para ${mec.nome} em ${groups.size} O.S.`, 'ok');
      if(typeof window.audit==='function')try{window.audit('RH/EQUIPE',`Pagamento de comissão ${money(totalGeral)} para ${mec.nome} em ${groups.size} O.S. (ID ${paymentId})`);}catch(_){}
      window.fecharModal?.('modalPgtoRH');window.calcComissoes?.();
    }catch(e){console.error('[Comissões] pagamento transacional:',e);window.toast?.('Pagamento NÃO efetuado: '+(e?.message||e),'err');}
    finally{salvandoDetalhado=false;}
  }

  function summaryByFunc(func){
    const id=func?.id||func;
    const all=(window.J?.financeiro||[]).filter(f=>f?.isComissao===true&&String(f.mecId||'')===String(id||'')&&!isCanceled(f));
    const linhas=rowsFor(typeof func==='object'?func:(window.J?.equipe||[]).find(f=>String(f.id)===String(id)));
    return{
      pendente:+linhas.filter(r=>!r.aguardandoExecucao&&!r.semPercentual).reduce((s,r)=>s+n(r.falta||0),0).toFixed(2),
      pago:all.filter(isPaid).reduce((s,f)=>s+n(f.valor||0),0),
      qtdPago:all.filter(isPaid).length,
      qtdServicos:linhas.length,
      semPercentual:linhas.filter(r=>r.semPercentual).length,
      aguardando:linhas.filter(r=>r.aguardandoExecucao).length
    };
  }
  function calcCards(){
    const box=$id('boxComissoes');if(!box)return;
    window.thiaEnsureDataFor?.('equipe');
    box.innerHTML=(window.J?.equipe||[]).map(f=>({f,s:summaryByFunc(f)})).filter(x=>x.s.qtdServicos>0||x.s.pendente>0||x.s.pago>0).map(({f,s})=>`<div class="com-card" style="cursor:pointer;align-items:center;min-width:0;max-width:100%;box-sizing:border-box" onclick="window.abrirComissaoColaboradorV21('${esc(f.id)}')"><div style="min-width:0"><div class="com-nome" style="overflow-wrap:anywhere">${esc(f.nome)}</div><div style="font-family:var(--fm);font-size:.6rem;color:var(--muted)">${s.qtdServicos} SERVIÇO(S) · PAGO ${money(s.pago)} · FALTA ${money(s.pendente)}${s.semPercentual?` · <span style="color:var(--warn)">${s.semPercentual} SEM %</span>`:''}${s.aguardando?` · <span style="color:var(--warn)">${s.aguardando} AGUARDANDO</span>`:''}</div></div><div style="text-align:right"><div class="com-val">${money(s.pendente)}</div><div style="font-family:var(--fm);font-size:.56rem;color:var(--cyan);margin-top:3px">DETALHAR / PAGAR</div></div></div>`).join('')||'<div style="text-align:center;color:var(--muted);padding:20px;">Sem serviços atribuídos ou comissões registradas</div>';
  }

  // Fonte única para a IA financeira: reaproveita rowsFor, rateios e pagamentos reais.
  window.thiaComissoesResumoV26=function(mecId){
    const mec=(window.J?.equipe||[]).find(f=>String(f.id)===String(mecId));
    if(!mec)return null;
    const linhas=rowsFor(mec);
    return {mecId:mec.id,linhas,
      previsto:+linhas.reduce((s,r)=>s+n(r.previsto),0).toFixed(2),
      pago:+linhas.reduce((s,r)=>s+n(r.pago),0).toFixed(2),
      pendente:+linhas.filter(r=>!r.semPercentual&&!r.aguardandoExecucao).reduce((s,r)=>s+n(r.falta),0).toFixed(2)};
  };

  const oldPrep=window.prepPgtoRH;window.prepPgtoRH=function(){if(typeof oldPrep==='function')oldPrep.apply(this,arguments);ensureUI();toggle();};
  const oldSave=window.salvarPgtoRH;window.salvarPgtoRH=function(){return $id('rhPgtoTipo')?.value==='Pagamento Comissão'?saveDetailed():(typeof oldSave==='function'?oldSave.apply(this,arguments):undefined);};
  window.calcComissoes=calcCards;
  window.abrirComissaoColaboradorV21=function(id,opts={}){window.thiaEnsureDataFor?.('equipe');window.__comissaoPreselectV21={mecId:String(id||''),osIds:Array.isArray(opts.osIds)?opts.osIds.map(String):[]};window.abrirModal?.('modalPgtoRH');window.prepPgtoRH();if($id('rhPgtoFunc'))$id('rhPgtoFunc').value=id;if($id('rhPgtoTipo'))$id('rhPgtoTipo').value='Pagamento Comissão';toggle();render();setTimeout(render,350);setTimeout(render,1100);};
  window.thiaAbrirComissaoIA=function(btn){const id=btn?.dataset?.mecId||'',osIds=String(btn?.dataset?.osIds||'').split(',').map(x=>x.trim()).filter(Boolean);if(!id){window.toast?.('Colaborador não identificado para pagamento.','warn');return;}window.abrirComissaoColaboradorV21(id,{osIds});};
  function boot(){ensureUI();calcCards();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();[500,1200,2500].forEach(ms=>setTimeout(boot,ms));
})();
