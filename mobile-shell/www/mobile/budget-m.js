/* Compound Ascend — Presupuesto móvil: lógica */
(function(){
  const fmt = n => Number(n).toLocaleString('es-ES');

  /* ---- Tabs ---- */
  const tabs = document.getElementById('tabs');
  function activate(name){
    tabs.querySelectorAll('.m-tab').forEach(t=>t.classList.toggle('on', t.dataset.tab===name));
    document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('on', p.dataset.panel===name));
    try{ history.replaceState(null,'','#'+name); }catch(e){}
    window.scrollTo({top:0});
  }
  tabs.addEventListener('click', e=>{ const t=e.target.closest('.m-tab'); if(t) activate(t.dataset.tab); });
  function fromHash(){ const n=(location.hash||'').slice(1); if(document.querySelector(`[data-panel="${n}"]`)) activate(n); }
  window.addEventListener('hashchange', fromHash);
  if(location.hash) fromHash();

  /* ---- EXP model (frascos & sobres) ---- */
  const EXP = {
    'Vivienda': { color:'var(--pos)', icon:'<path d="M3 10 12 3l9 7M5 10v10h14V10"/>', items:[['Servicios general',168,180],['Alquiler',2400,2400],['Mantenimiento y reparaciones',182,200]], suggest:['Seguro de hogar','Agua','Electricidad','Internet y TV','Limpieza'] },
    'Transporte': { color:'var(--warn)', icon:'<path d="M5 17H3v-5l2-5h14l2 5v5h-2"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="17.5" r="2.5"/>', items:[['Gastos vehículo',280,320],['Mantenimiento',100,120]], suggest:['Combustible','Seguro de auto','Transporte público','Parking'] },
    'Alimentación': { color:'var(--info)', icon:'<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/>', items:[['Supermercados',720,760],['Restaurantes',536,520]], suggest:['Café','Delivery','Snacks'] },
    'Salud y bienestar': { color:'var(--rose)', icon:'<path d="M3 12h4l2-5 4 10 2-5h6"/>', items:[['Salud general',180,200],['Cuidado personal / estética',160,160],['Farmacia',80,100]], suggest:['Seguro médico','Dentista','Terapia','Suplementos'] },
    'Estilo de vida': { color:'var(--teal)', icon:'<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>', items:[['Viajes o paseos',320,400],['Subscripciones',180,180],['Gimnasio',90,90]], suggest:['Hobbies','Ropa','Regalos','Mascotas'] },
    'Educación': { color:'var(--info)', icon:'<path d="M3 8l9-4 9 4-9 4-9-4Z"/><path d="M7 10v5c0 1 2 2.5 5 2.5s5-1.5 5-2.5v-5"/>', items:[['Formación',240,280]], suggest:['Cursos online','Libros','Idiomas'] }
  };
  const LINK = {
    'Libertad Financiera': { color:'var(--info)', icon:'<path d="M3 17l5-5 4 4 8-9"/><path d="M14 7h6v6"/>', sub:'Inversiones de tu Portafolio', total:'$2.000',
      items:[{n:'VTI · Total Market',s:'312 acciones',a:'$284.512'},{n:'VXUS · Internacional',s:'2.140 acciones',a:'$183.820'},{n:'SCHD · Dividendos',s:'640 acciones',a:'$49.984'}],
      cta:['Crear inversión','Investments.html'] },
    'Deudas': { color:'var(--c-debt)', icon:'<path d="M9 11V7a3 3 0 0 1 6 0v4"/><rect x="5" y="11" width="14" height="10" rx="2"/>', sub:'Deudas de Deudas y Préstamos', total:'$2.870',
      items:[{n:'Chase Sapphire',s:'21,5% TAE',a:'$3.210'},{n:'Auto Tesla',s:'4,9% TAE',a:'$24.820'},{n:'Hipoteca',s:'3,25%',a:'$118.420'}],
      cta:['Ingresar deuda','Debts.html#add'] },
    'Defensa patrimonial': { color:'var(--c-protect)', icon:'<path d="M12 2 4 6v6c0 5 3.4 9 8 10 4.6-1 8-5 8-10V6l-8-4Z"/>', sub:'Pólizas activas', total:'$720',
      items:[{n:'Vida temporal',s:'Haven Life · $1,5M',a:'$1.840/año'},{n:'Hogar',s:'State Farm',a:'$2.180/año'},{n:'Auto',s:'Geico',a:'$1.260/año'}],
      cta:['Añadir póliza','Defense.html#add'] },
    'Ahorro/Objetivo': { color:'var(--pos)', icon:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/>', sub:'Fondos y metas', total:'$1.850',
      items:[{n:'Fondo de emergencia',s:'Sugerido · 89%',a:'$48.000'},{n:'Fondo de paz',s:'Sugerido · 42%',a:'$12.500'},{n:'Mejora del hogar',s:'Meta · 56%',a:'$84.200'}],
      cta:['Ingresar objetivo','Networth.html#add-goal'] }
  };
  const CAT_COLORS = ['var(--pos)','var(--info)','var(--warn)','var(--teal)','var(--rose)','var(--c-networth)'];
  const LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

  /* ---- Render category list ---- */
  const expList = document.getElementById('expList');
  function catRowHTML(name, cfg, linked){
    const budget = linked ? null : cfg.items.reduce((a,i)=>a+i[2],0);
    const spent = linked ? null : cfg.items.reduce((a,i)=>a+i[1],0);
    const p = linked ? 60 : (budget?Math.min(100,Math.round(spent/budget*100)):0);
    const amt = linked ? cfg.total : '$'+fmt(budget);
    const sub = linked ? cfg.sub : (cfg.items.length?cfg.items.map(i=>i[0]).slice(0,2).join(', '):'Sin sobres aún');
    return `<div class="env exp-row" data-cat="${name}" data-linked="${linked?1:0}">
      <div class="env-ic" style="background:color-mix(in srgb,${cfg.color} 16%, transparent);color:${cfg.color}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${cfg.icon}</svg></div>
      <div><div class="env-name">${name}</div><div class="env-sub">${sub}</div></div>
      <div class="env-num"><div class="big">${amt}</div><div class="small">/mes</div></div>
      ${linked?'<span></span>':`<button class="cat-menu-btn" data-cat="${name}" aria-label="Editar"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg></button>`}
      <div class="env-bar-row"><div class="bar-track"><div class="bar-fill" style="width:${p}%;background:${cfg.color}"></div></div></div>
    </div>`;
  }
  function renderCats(){
    expList.innerHTML = Object.keys(EXP).map(k=>catRowHTML(k,EXP[k],false)).join('') +
      Object.keys(LINK).map(k=>catRowHTML(k,LINK[k],true)).join('');
  }
  renderCats();

  /* ---- Frasco detail ---- */
  function subRow(it,color,idx){
    const over=it[1]>it[2], p=it[2]?Math.min(100,Math.round(it[1]/it[2]*100)):0, rem=it[2]-it[1];
    return `<div class="subenv">
      <div class="se-ic"><span style="background:${over?'var(--neg)':color}"></span></div>
      <div class="se-open" data-q="${it[0]}"><div class="se-name">${it[0]}</div><div class="se-meta">$${fmt(it[1])} de $${fmt(it[2])} · <span class="se-link">ver movimientos ›</span></div></div>
      <div class="se-amt">$${fmt(it[2])}</div>
      <button class="se-lock" data-idx="${idx}">${LOCK}</button>
      <div class="se-bar"><div class="bar-track"><div class="bar-fill" style="width:${p}%;background:${over?'var(--neg)':color}"></div></div>
      <div class="se-bar-meta"><span>${p}% gastado</span><span style="color:${rem<0?'var(--neg)':'var(--muted)'}">${rem<0?'−$'+fmt(-rem)+' excedido':'$'+fmt(rem)+' restante'}</span></div></div>
    </div>`;
  }
  function openNormal(name){
    const c=EXP[name];
    const spent=c.items.reduce((a,i)=>a+i[1],0), budget=c.items.reduce((a,i)=>a+i[2],0);
    const pct=budget?Math.round(spent/budget*100):0;
    App.openModal({ large:true, title:name, sub:'Sobres de la categoría',
      body:`<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:14px">
          <div><div style="font-size:11px;color:var(--muted)">Gastado este mes</div><div class="num-xl" style="font-size:24px;margin-top:3px">$${fmt(spent)} <span style="font-size:12px;color:var(--muted)">/ $${fmt(budget)}</span></div></div>
          <span class="chip" style="background:${pct>=100?'var(--neg-soft)':'var(--pos-soft)'};color:${pct>=100?'var(--neg)':'var(--pos)'}">${pct}%</span></div>
        <div id="seList">${c.items.map((it,i)=>subRow(it,c.color,i)).join('')}</div>
        <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line)">
          <div style="font-weight:600;font-size:12.5px;margin-bottom:6px">Crear nueva subcategoría</div>
          <div class="sug-wrap" id="sugWrap">${c.suggest.map(x=>`<span class="sug-chip">${x}</span>`).join('')}</div>
          <div style="display:flex;gap:8px;margin-top:6px">
            <input class="inp" id="seName" placeholder="Nombre del sobre" style="flex:1">
            <div class="inp-money" style="width:104px"><span class="pre">$</span><input id="seAmt" inputmode="decimal" placeholder="0"></div>
          </div>
          <button class="btn btn-primary" id="seAdd" style="width:100%;justify-content:center;margin-top:8px">Añadir sobre</button>
        </div>`,
      footer:'<button class="btn btn-ghost" onclick="App.closeModal()">Cerrar</button>' });
    document.getElementById('sugWrap').addEventListener('click',ev=>{ const ch=ev.target.closest('.sug-chip'); if(ch){ document.getElementById('seName').value=ch.textContent; }});
    document.getElementById('seAdd').addEventListener('click',()=>{
      const nm=(document.getElementById('seName').value||'').trim()||'Nuevo sobre';
      const amt=parseInt((document.getElementById('seAmt').value||'0').replace(/\D/g,''))||0;
      c.items.push([nm,0,amt]); renderCats(); openNormal(name); App.toast('Sobre añadido');
    });
    document.getElementById('seList').addEventListener('click',ev=>{
      const open=ev.target.closest('.se-open');
      if(open){ App.closeModal(); activate('transactions'); const i=document.getElementById('txnSearch'); i.value=open.dataset.q; i.dispatchEvent(new Event('input')); App.toast('Movimientos de "'+open.dataset.q+'"'); return; }
      const lock=ev.target.closest('.se-lock'); if(!lock) return;
      openBudgetWarning(()=>openEditSobre(name, +lock.dataset.idx));
    });
  }
  function openLink(name){
    const c=LINK[name];
    App.openModal({ large:true, title:name, sub:c.sub,
      body:'<div style="font-size:11px;color:var(--muted);margin-bottom:10px">Vinculado automáticamente desde su módulo.</div>'+
        c.items.map(it=>`<div class="lk-row"><div class="lk-ic" style="background:color-mix(in srgb,${c.color} 14%, transparent);color:${c.color}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${c.icon}</svg></div><div><div class="lk-name">${it.n}</div><div class="lk-sub">${it.s}</div></div><div class="lk-amt">${it.a}</div></div>`).join(''),
      footer:`<button class="btn btn-ghost" onclick="App.closeModal()">Cerrar</button><a class="btn btn-primary" href="${c.cta[1]}">${c.cta[0]}</a>` });
  }
  expList.addEventListener('click', e=>{
    const menuBtn=e.target.closest('.cat-menu-btn');
    if(menuBtn){ e.stopPropagation(); openCatEdit(menuBtn.dataset.cat); return; }
    const row=e.target.closest('.env'); if(!row) return;
    const cat=row.dataset.cat;
    if(row.dataset.linked==='1') openLink(cat); else openNormal(cat);
  });

  /* ---- Cat edit (color / delete) ---- */
  function openCatEdit(cat){
    App.openModal({ title:'Editar categoría', sub:cat,
      body:`<div style="font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:var(--muted-2);font-weight:600;margin-bottom:8px">Cambiar color</div>
        <div style="display:flex;gap:8px" id="cmColors">${CAT_COLORS.map(c=>`<span data-c="${c}" style="width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;display:inline-block"></span>`).join('')}</div>
        <button class="btn btn-secondary" id="cmDel" style="width:100%;justify-content:center;margin-top:16px;color:var(--neg)">Eliminar categoría</button>`,
      footer:'<button class="btn btn-ghost" onclick="App.closeModal()">Cerrar</button>' });
    document.getElementById('cmColors').addEventListener('click',ev=>{
      const s=ev.target.closest('[data-c]'); if(!s) return;
      EXP[cat].color=s.dataset.c; renderCats(); App.closeModal(); App.toast('Color actualizado');
    });
    document.getElementById('cmDel').addEventListener('click',()=>{
      App.openModal({ title:'Eliminar categoría', sub:cat,
        body:`<div style="font-size:13px;color:var(--ink-2);line-height:1.55">¿Eliminar <strong>${cat}</strong> y sus sobres? Esta acción no se puede deshacer.</div>`,
        footer:`<button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button><button class="btn btn-primary" id="delGo" style="background:var(--neg)">Eliminar</button>` });
      document.getElementById('delGo').addEventListener('click',()=>{ delete EXP[cat]; renderCats(); App.closeModal(); App.toast('Categoría eliminada'); });
    });
  }

  /* ---- Budget warning (sequential checks) ---- */
  function openBudgetWarning(onConfirm){
    const checks=[
      'Entiendo que este presupuesto debió estar configurado antes de iniciar el período.',
      'Entiendo que modificar el presupuesto afectará la precisión de mis métricas y análisis financieros.',
      'Entiendo que debería utilizar esta acción únicamente cuando exista un cambio real en mis circunstancias financieras.'];
    App.openModal({ title:'Modificar presupuesto del período actual', sub:'Período en curso',
      body:`<div style="font-size:13px;color:var(--ink-2);line-height:1.55">Tu presupuesto idealmente debería estar definido <strong>antes de iniciar el período</strong>.</div>
        <div style="font-size:12px;color:var(--muted);line-height:1.55;margin-top:8px">Cuando modificas un presupuesto después de iniciado el mes, los reportes y análisis financieros pueden perder precisión.</div>
        <div id="bwChecks" style="margin-top:4px">${checks.map((t,i)=>`<label class="bw-check" data-i="${i}" style="${i>0?'display:none':''}"><span class="bw-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-11"/></svg></span><span class="bw-txt">${t}</span></label>`).join('')}</div>
        <div id="bwSuccess" class="bw-success" style="display:none"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 6v6c0 5 3.4 9 8 10 4.6-1 8-5 8-10V6l-8-4Z"/><path d="m9 12 2 2 4-4"/></svg><span>Excelente. Lo importante no es ser perfecto, sino mantener un presupuesto que refleje tu realidad financiera.</span></div>`,
      footer:'<button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button><button class="btn btn-primary" id="bwConfirm" disabled>Continuar y modificar</button>' });
    const rows=[...document.querySelectorAll('#bwChecks .bw-check')]; let done=0;
    document.getElementById('bwChecks').addEventListener('click',ev=>{
      const row=ev.target.closest('.bw-check'); if(!row||+row.dataset.i!==done||row.classList.contains('on')) return;
      row.classList.add('on'); done++;
      if(done<rows.length){ rows[done].style.display='flex'; }
      else { document.getElementById('bwSuccess').style.display='flex'; document.getElementById('bwConfirm').disabled=false; }
    });
    document.getElementById('bwConfirm').addEventListener('click',()=>{ if(done>=rows.length) onConfirm(); });
  }
  function openEditSobre(name, idx){
    const it=EXP[name].items[idx];
    App.openModal({ title:'Nuevo presupuesto del sobre', sub:name+' · '+it[0],
      body:`<div class="fld"><span class="fld-label">Presupuesto mensual</span><div class="inp-money"><span class="pre">$</span><input id="sbAmt" inputmode="decimal" value="${it[2]}"></div></div>`,
      footer:'<button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button><button class="btn btn-primary" id="sbSave">Guardar</button>' });
    document.getElementById('sbSave').addEventListener('click',()=>{
      it[2]=parseInt((document.getElementById('sbAmt').value||'0').replace(/\D/g,''))||0;
      renderCats(); openNormal(name); App.toast('Presupuesto actualizado');
    });
  }

  /* ---- Registrar gasto ---- */
  function sobreOptions(){
    let h=''; Object.keys(EXP).forEach(cat=>{ if(!EXP[cat].items.length) return;
      h+=`<optgroup label="${cat}">${EXP[cat].items.map((it,i)=>`<option value="${cat}|${i}">${it[0]}</option>`).join('')}</optgroup>`; });
    return h||'<option value="">— Sin sobres —</option>';
  }
  document.getElementById('addSpendBtn').addEventListener('click', ()=>{
    const today=new Date().toISOString().slice(0,10);
    App.openModal({ title:'Registrar gasto', sub:'Descuenta del sobre elegido',
      body:`<div class="fld"><span class="fld-label">Nombre</span><input class="inp" id="asName" placeholder="p. ej. Whole Foods"></div>
        <div class="fld-2"><div class="fld"><span class="fld-label">Fecha</span><input class="inp" id="asDate" type="date" value="${today}"></div>
        <div class="fld"><span class="fld-label">Moneda · Monto</span><div style="display:flex;gap:6px"><select class="sel" id="asCur" style="width:64px"><option>$</option><option>€</option><option>£</option></select><div class="inp-money" style="flex:1"><span class="pre">$</span><input id="asAmt" inputmode="decimal" placeholder="0"></div></div></div></div>
        <div class="fld"><span class="fld-label">Sobre</span><select class="sel" id="asSobre">${sobreOptions()}</select></div>`,
      footer:'<button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button><button class="btn btn-primary" id="asSave">Registrar</button>' });
    document.getElementById('asSave').addEventListener('click',()=>{
      const sv=document.getElementById('asSobre').value; if(!sv){ App.toast('Crea un sobre primero'); return; }
      const [cat,idx]=sv.split('|'); const it=EXP[cat].items[+idx];
      const amt=parseInt((document.getElementById('asAmt').value||'0').replace(/\D/g,''))||0;
      const nm=(document.getElementById('asName').value||'').trim()||it[0];
      it[1]+=amt; renderCats();
      const list=document.getElementById('txnList');
      const row=document.createElement('div');
      row.className='list-row'; row.dataset.kind='spending'; row.dataset.text=(nm+' '+it[0]+' '+cat+' '+amt).toLowerCase();
      row.innerHTML=`<div class="li-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h18M3 8l2-3h14l2 3M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/></svg></div><div><div class="li-name">${nm}</div><div class="li-sub">${it[0]} · Hoy</div></div><div class="li-amt">−$${fmt(amt)}</div>`;
      list.prepend(row);
      App.closeModal(); App.toast('Gasto de $'+fmt(amt)+' registrado');
    });
  });

  /* ---- Kebab ---- */
  const kbtn=document.getElementById('expMenuBtn'), kmenu=document.getElementById('expMenu');
  kbtn.addEventListener('click', e=>{ e.stopPropagation(); kmenu.classList.toggle('open'); });
  document.addEventListener('click', ()=>kmenu.classList.remove('open'));
  kmenu.addEventListener('click', e=>{
    const b=e.target.closest('button'); if(!b) return; kmenu.classList.remove('open');
    if(b.dataset.act==='copy'){
      App.openModal({ title:'Copiar del mes anterior', sub:'Octubre → Noviembre',
        body:'<div style="font-size:13px;color:var(--ink-2);line-height:1.55">Se copiarán montos y categorías de <strong>octubre</strong> al mes actual.</div>',
        footer:'<button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button><button class="btn btn-primary" onclick="App.closeModal();App.toast(\'Gastos copiados\')">Copiar</button>' });
    } else if(b.dataset.act==='cat'){
      App.openModal({ title:'Nueva categoría', sub:'Crea un frasco y luego añade sobres',
        body:`<div class="fld"><span class="fld-label">Nombre</span><input class="inp" id="catNew" placeholder="p. ej. Hijos, Mascotas"></div>
          <div style="display:flex;gap:8px" id="catColors">${CAT_COLORS.map((c,i)=>`<span data-c="${c}" style="width:26px;height:26px;border-radius:50%;background:${c};cursor:pointer;display:inline-block;border:2px solid ${i===0?'var(--ink)':'transparent'}"></span>`).join('')}</div>`,
        footer:'<button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button><button class="btn btn-primary" id="catGo">Crear</button>' });
      let col=CAT_COLORS[0];
      document.getElementById('catColors').addEventListener('click',ev=>{ const s=ev.target.closest('[data-c]'); if(!s)return; document.querySelectorAll('#catColors [data-c]').forEach(x=>x.style.border='2px solid transparent'); s.style.border='2px solid var(--ink)'; col=s.dataset.c; });
      document.getElementById('catGo').addEventListener('click',()=>{
        const nm=(document.getElementById('catNew').value||'').trim(); if(!nm){ App.toast('Escribe un nombre'); return; }
        EXP[nm]={ color:col, icon:'<path d="M3 7h18M6 7v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7M9 7V5a3 3 0 0 1 6 0v2"/>', items:[], suggest:['Suscripción','Servicio','Otro'] };
        renderCats(); App.closeModal(); App.toast('Categoría creada'); openNormal(nm);
      });
    } else if(b.dataset.act==='sobre'){
      App.openModal({ title:'Nuevo sobre', sub:'Elige la categoría',
        body:`<div class="fld"><span class="fld-label">Categoría</span><select class="sel" id="nsCat">${Object.keys(EXP).map(c=>`<option>${c}</option>`).join('')}</select></div>
          <div class="fld"><span class="fld-label">Nombre del sobre</span><input class="inp" id="nsName" placeholder="p. ej. Gimnasio"></div>
          <div class="fld"><span class="fld-label">Presupuesto mensual</span><div class="inp-money"><span class="pre">$</span><input id="nsAmt" inputmode="decimal" placeholder="0"></div></div>`,
        footer:'<button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button><button class="btn btn-primary" id="nsGo">Crear sobre</button>' });
      document.getElementById('nsGo').addEventListener('click',()=>{
        const cat=document.getElementById('nsCat').value;
        const nm=(document.getElementById('nsName').value||'').trim()||'Nuevo sobre';
        const amt=parseInt((document.getElementById('nsAmt').value||'0').replace(/\D/g,''))||0;
        EXP[cat].items.push([nm,0,amt]); renderCats(); App.closeModal(); App.toast('Sobre creado en '+cat);
      });
    }
  });

  /* ---- Income: add + confirm pills ---- */
  document.getElementById('addIncomeBtn').addEventListener('click', ()=>{
    App.openModal({ title:'Añadir ingreso', sub:'Se suma a la persona elegida',
      body:`<div class="fld"><span class="fld-label">Persona</span><select class="sel"><option>Elena Marsh</option><option>Jordan Marsh</option></select></div>
        <div class="fld"><span class="fld-label">Fuente</span><input class="inp" placeholder="p. ej. Salario, Alquiler"></div>
        <div class="fld-2"><div class="fld"><span class="fld-label">Tipo</span><select class="sel"><option>Salario</option><option>Autónomo</option><option>Bono</option><option>Pasivo</option></select></div>
        <div class="fld"><span class="fld-label">Monto</span><div class="inp-money"><span class="pre">$</span><input inputmode="decimal" placeholder="0"></div></div></div>`,
      footer:'<button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button><button class="btn btn-primary" onclick="App.closeModal();App.toast(\'Ingreso añadido\')">Añadir</button>' });
  });
  document.addEventListener('click', e=>{
    const pill=e.target.closest('.confirm-pill'); if(!pill||pill.classList.contains('done')) return;
    pill.classList.add('done');
    pill.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-11"/></svg>Recibido';
    const row=pill.closest('.inc-row');
    if(row){
      const name=row.querySelector('.inc-name').textContent;
      const amt=row.querySelector('.inc-amt').textContent;
      const list=document.getElementById('txnList');
      const tr=document.createElement('div');
      tr.className='list-row'; tr.dataset.kind='income'; tr.dataset.text=(name+' ingreso').toLowerCase();
      tr.innerHTML=`<div class="li-icon" style="background:var(--pos-soft);color:var(--pos)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div><div><div class="li-name">${name}</div><div class="li-sub">Ingreso confirmado · Hoy</div></div><div class="li-amt pos">+${amt}</div>`;
      list.prepend(tr);
    }
    App.toast('Ingreso registrado en Transacciones');
  });

  /* ---- Transactions search/filter ---- */
  const txnList=document.getElementById('txnList'), txnEmpty=document.getElementById('txnEmpty'),
        txnCount=document.getElementById('txnCount'), searchInput=document.getElementById('txnSearch');
  let curFilter='all';
  function applyTxn(){
    const q=(searchInput.value||'').toLowerCase().trim();
    const qs=q.endsWith('s')?q.slice(0,-1):q;
    let shown=0;
    txnList.querySelectorAll('.list-row').forEach(r=>{
      const hay=(r.dataset.text||'');
      const mt=!q||hay.includes(q)||hay.includes(qs);
      let mf=true;
      if(curFilter==='income') mf=r.dataset.kind==='income';
      else if(curFilter==='spending') mf=r.dataset.kind==='spending';
      const ok=mt&&mf; r.style.display=ok?'':'none'; if(ok)shown++;
    });
    txnEmpty.style.display=shown?'none':'block';
    txnCount.textContent=shown+' movimiento'+(shown===1?'':'s');
  }
  searchInput.addEventListener('input', applyTxn);
  document.querySelectorAll('.filter-chips .fchip').forEach(c=>c.addEventListener('click',()=>{
    document.querySelectorAll('.filter-chips .fchip').forEach(x=>x.classList.remove('on'));
    c.classList.add('on'); curFilter=c.dataset.f; applyTxn();
  }));
})();
