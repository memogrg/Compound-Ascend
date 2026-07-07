/* ============================================================
   COMPOUND ASCEND — Inversiones (portafolio universal)
   ============================================================ */
(function () {
  const fmt = n => '$' + Math.round(n).toLocaleString('es-ES');
  const fmtK = n => n >= 1e6 ? '$' + (n/1e6).toFixed(2).replace('.', ',') + 'M' : (n >= 1e3 ? '$' + Math.round(n/1e3) + 'k' : '$' + Math.round(n));
  const pctFmt = n => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(1).replace('.', ',') + '%';
  const CURSYM = { USD:'$', CRC:'₡', EUR:'€', BTC:'₿' };
  const money = (cur, n) => (CURSYM[cur]||'$') + Math.round(n).toLocaleString('es-ES');
  const MES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  /* ---------- Domain model ---------- */
  const NATURE = {
    flujo:  { label: 'Flujo de caja', color: 'var(--c-income)' },
    crecim: { label: 'Crecimiento patrimonial', color: 'var(--c-invest)' }
  };
  const CATS = {
    flujo: [
      'Dinero en cuentas que gana intereses',
      'Depósitos a plazo / CDP',
      'Bonos del gobierno',
      'Bonos de empresas',
      'Fondos conservadores',
      'Préstamos que generan intereses',
      'Propiedades alquiladas',
      'Fondos inmobiliarios / REITs',
      'Acciones o ETFs que pagan dividendos',
      'Negocios que dejan ganancia'
    ],
    crecim: [
      'Acciones de empresas con potencial de crecer',
      'ETFs o fondos de crecimiento',
      'Fondos indexados globales',
      'Portafolios automáticos / fondos para retiro',
      'Propiedades que compro esperando plusvalía',
      'Proyectos inmobiliarios',
      'Startups o empresas nuevas',
      'Compra de negocios para hacerlos crecer',
      'Cripto y activos digitales',
      'Activos alternativos que pueden subir de valor'
    ]
  };
  const STATUS = ['Activa','Pausada','Cerrada','Vendida'];
  const FREQ_APORTE = ['Mensual','Trimestral','Anual','Único','Irregular'];
  const FREQ_INGRESO = ['No aplica','Mensual','Trimestral','Semestral','Anual'];
  const MOV_TYPES = ['Aporte','Retiro','Venta parcial','Comisión','Impuesto','Reinversión'];
  const CAT_COLOR = ['var(--c-income)','var(--c-savings)','var(--teal)','var(--info)','var(--c-invest)','var(--warn)','var(--c-networth)','var(--gold)','var(--pos)','var(--neg)'];

  /* ---------- Sample portfolio (con movimientos y valoraciones) ---------- */
  let INV = [
    { id:1, name:'Apartamento · Escazú', nat:'flujo', cat:'Propiedades alquiladas', cur:'USD', region:'Costa Rica', start:'2022-06-01', openAmount:170000, status:'Activa', freqAporte:'Único', freqIngreso:'Mensual', invested:185000, monthly:0, retAcum:0.21, cashflow:1950, cashMonth:null,
      movements:[{date:'2022-06-01',type:'Aporte',cur:'USD',gross:170000,fee:0,tax:0,net:170000,source:'Cuenta de ahorro'},{date:'2023-03-10',type:'Aporte',cur:'USD',gross:15000,fee:0,tax:0,net:15000,source:'Bono'}],
      valuations:[{date:'2024-01-01',value:188000},{date:'2024-07-01',value:201000},{date:'2025-01-01',value:212000},{date:'2025-06-01',value:224000}] },
    { id:2, name:'VYM · ETF de dividendos', nat:'flujo', cat:'Acciones o ETFs que pagan dividendos', cur:'USD', region:'EE. UU.', start:'2023-01-15', openAmount:30000, status:'Activa', freqAporte:'Mensual', freqIngreso:'Trimestral', invested:43700, monthly:300, retAcum:0.072, cashflow:303, cashMonth:null,
      movements:[{date:'2023-01-15',type:'Aporte',cur:'USD',gross:30000,fee:12,tax:0,net:29988,source:'Cuenta corriente'}],
      valuations:[{date:'2024-06-01',value:38000},{date:'2025-01-01',value:41500},{date:'2025-06-01',value:46900}] },
    { id:3, name:'Certificado de depósito · BAC', nat:'flujo', cat:'Depósitos a plazo / CDP', cur:'USD', region:'Costa Rica', start:'2024-09-01', openAmount:25000, status:'Activa', freqAporte:'Único', freqIngreso:'Semestral', invested:25000, monthly:0, retAcum:0.052, cashflow:108, cashMonth:null, movements:[], valuations:[] },
    { id:4, name:'Bono del Tesoro · T-Bill', nat:'flujo', cat:'Bonos del gobierno', cur:'USD', region:'EE. UU.', start:'2025-02-01', openAmount:30000, status:'Activa', freqAporte:'Único', freqIngreso:'Anual', invested:30000, monthly:0, retAcum:0.046, cashflow:0, cashMonth:'Dic', movements:[], valuations:[] },
    { id:5, name:'Cuenta remunerada · 4,6%', nat:'flujo', cat:'Dinero en cuentas que gana intereses', cur:'USD', region:'EE. UU.', start:'2024-01-01', openAmount:12000, status:'Activa', freqAporte:'Mensual', freqIngreso:'Mensual', invested:18000, monthly:500, retAcum:0.046, cashflow:69, cashMonth:null, movements:[], valuations:[] },
    { id:6, name:'Préstamo P2P · Kubo', nat:'flujo', cat:'Préstamos que generan intereses', cur:'CRC', region:'Costa Rica', start:'2024-05-01', openAmount:9000, status:'Activa', freqAporte:'Único', freqIngreso:'Mensual', invested:9000, monthly:0, retAcum:0.094, cashflow:71, cashMonth:null, movements:[], valuations:[] },
    { id:7, name:'VTI · Total Market', nat:'crecim', cat:'Fondos indexados globales', cur:'USD', region:'EE. UU.', start:'2021-01-10', openAmount:120000, status:'Activa', freqAporte:'Mensual', freqIngreso:'No aplica', invested:284512, monthly:1200, retAcum:0.142, cashflow:0, cashMonth:null,
      movements:[{date:'2021-01-10',type:'Aporte',cur:'USD',gross:120000,fee:0,tax:0,net:120000,source:'Cuenta de ahorro'}],
      valuations:[{date:'2024-01-01',value:232000},{date:'2024-07-01',value:255000},{date:'2025-01-01',value:271000},{date:'2025-06-01',value:284512}] },
    { id:8, name:'VXUS · Internacional', nat:'crecim', cat:'ETFs o fondos de crecimiento', cur:'USD', region:'Global', start:'2022-03-01', openAmount:140000, status:'Activa', freqAporte:'Mensual', freqIngreso:'No aplica', invested:183820, monthly:600, retAcum:0.081, cashflow:0, cashMonth:null, movements:[], valuations:[{date:'2024-06-01',value:168000},{date:'2025-06-01',value:183820}] },
    { id:9, name:'Bitcoin', nat:'crecim', cat:'Cripto y activos digitales', cur:'USD', region:'Global', start:'2023-08-01', openAmount:24000, status:'Activa', freqAporte:'Mensual', freqIngreso:'No aplica', invested:38000, monthly:150, retAcum:0.34, cashflow:0, cashMonth:null, movements:[], valuations:[{date:'2024-06-01',value:29000},{date:'2025-01-01',value:34000},{date:'2025-06-01',value:38000}] },
    { id:10, name:'Terreno · Guanacaste', nat:'crecim', cat:'Propiedades que compro esperando plusvalía', cur:'USD', region:'Costa Rica', start:'2021-11-01', openAmount:52000, status:'Activa', freqAporte:'Único', freqIngreso:'No aplica', invested:62000, monthly:0, retAcum:0.18, cashflow:0, cashMonth:null, movements:[], valuations:[] },
    { id:11, name:'Oro físico', nat:'crecim', cat:'Activos alternativos que pueden subir de valor', cur:'USD', region:'Global', start:'2023-04-01', openAmount:12600, status:'Activa', freqAporte:'Irregular', freqIngreso:'No aplica', invested:14000, monthly:0, retAcum:0.11, cashflow:0, cashMonth:null, movements:[], valuations:[] }
  ];
  let seq = 12;

  const PERIOD_FACTOR = { '1m': 0.026, '3m': 0.061, 'ytd': 0.127, 'all': 0.127 };
  const RECURRING_INCOME = 18640;
  let indPeriod = 'ytd', tablePeriod = 'ytd';

  function totals() {
    const invested = INV.reduce((a,b)=>a+b.invested,0);
    const cashflow = INV.reduce((a,b)=>a+(b.cashflow||0),0);
    const monthly = INV.reduce((a,b)=>a+(b.monthly||0),0);
    const accum = INV.reduce((a,b)=>a+b.invested*b.retAcum,0);
    return { invested, cashflow, monthly, accum };
  }

  /* ---------- Indicators ---------- */
  function renderIndicators() {
    const t = totals();
    const f = PERIOD_FACTOR[indPeriod];
    document.getElementById('kTotal').textContent = fmt(t.invested);
    const rate = Math.round(t.monthly / RECURRING_INCOME * 100);
    document.getElementById('kRate').textContent = rate + '%';
    document.getElementById('kRateBar').style.width = Math.min(100, rate) + '%';
    document.getElementById('kPeriod').textContent = '+' + fmt(t.invested * f);
    document.getElementById('kPeriodPct').textContent = pctFmt(f * 100);
    document.getElementById('kAccum').textContent = '+' + fmt(t.accum);
    document.getElementById('kCashflow').textContent = fmt(t.cashflow);
    document.getElementById('natTotal').textContent = fmtK(t.invested);
    drawInvestLine(f);
  }
  function drawInvestLine(f) {
    const W=520, H=88, pad=4;
    const months = indPeriod==='1m'?6 : indPeriod==='3m'?8 : indPeriod==='ytd'?10 : 14;
    const base = totals().invested, pts = [];
    for (let i=0;i<months;i++){ const t=i/(months-1); pts.push(base*(1-f) + base*f*t*(0.85+0.15*Math.sin(i*1.3))); }
    const max=Math.max(...pts)*1.02, min=Math.min(...pts)*0.97;
    const X=i=>pad+i*((W-2*pad)/(pts.length-1)), Y=v=>H-6-((v-min)/(max-min||1))*(H-18);
    const line=pts.map((v,i)=>`${i?'L':'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    const area=line+` L${X(pts.length-1).toFixed(1)},${H} L${X(0).toFixed(1)},${H} Z`;
    document.getElementById('investLine').innerHTML =
      `<defs><linearGradient id="ilf" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--c-invest)" stop-opacity="0.18"/><stop offset="1" stop-color="var(--c-invest)" stop-opacity="0"/></linearGradient></defs>
       <path d="${area}" fill="url(#ilf)"/><path d="${line}" fill="none" stroke="var(--c-invest)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
       <circle cx="${X(pts.length-1).toFixed(1)}" cy="${Y(pts[pts.length-1]).toFixed(1)}" r="3.4" fill="var(--surface)" stroke="var(--c-invest)" stroke-width="2"/>`;
  }

  /* ---------- Donuts ---------- */
  function donutSVG(el, segs) {
    let off=25, html=`<circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--chip)" stroke-width="5"/>`;
    segs.forEach(s => { html+=`<circle cx="21" cy="21" r="15.915" fill="none" stroke="${s.color}" stroke-width="5" stroke-dasharray="${s.pct.toFixed(2)} ${(100-s.pct).toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"/>`; off-=s.pct; });
    document.getElementById(el).innerHTML = html;
  }
  function natureSegs(items) {
    const tot = items.reduce((a,b)=>a+b.invested,0) || 1;
    const byNat = {}; items.forEach(i => byNat[i.nat]=(byNat[i.nat]||0)+i.invested);
    return Object.keys(byNat).map(k => ({ color:NATURE[k].color, pct:byNat[k]/tot*100, label:NATURE[k].label, amt:byNat[k] }));
  }
  function catSegsOf(items) {
    const tot = items.reduce((a,b)=>a+b.invested,0) || 1;
    const byCat = {}; items.forEach(i => byCat[i.cat]=(byCat[i.cat]||0)+i.invested);
    let cats = Object.entries(byCat).map(([k,v])=>({k,v})).sort((a,b)=>b.v-a.v);
    let top = cats.slice(0,6); const rest = cats.slice(6).reduce((a,b)=>a+b.v,0);
    const segs = top.map((c,i)=>({ color:CAT_COLOR[i%CAT_COLOR.length], pct:c.v/tot*100, label:c.k, amt:c.v }));
    if (rest>0) segs.push({ color:'var(--muted-2)', pct:rest/tot*100, label:'Otros', amt:rest });
    return { segs, count: cats.length };
  }
  function renderDonuts() {
    const nat = natureSegs(INV);
    donutSVG('donutNature', nat);
    document.getElementById('legNature').innerHTML = nat.map(s=>`<div class="leg-row"><span class="sw" style="background:${s.color}"></span><span class="nm">${s.label}</span><span class="pc">${Math.round(s.pct)}% · ${fmtK(s.amt)}</span></div>`).join('');
    const c = catSegsOf(INV);
    document.getElementById('catCount').textContent = c.count;
    donutSVG('donutCat', c.segs);
    document.getElementById('legCat').innerHTML = c.segs.map(s=>`<div class="leg-row"><span class="sw" style="background:${s.color}"></span><span class="nm" title="${s.label}">${s.label}</span><span class="pc">${Math.round(s.pct)}%</span></div>`).join('');
  }

  /* ---------- Table ---------- */
  function rowHTML(i) {
    const f = PERIOD_FACTOR[tablePeriod];
    const periodRet = i.retAcum * (tablePeriod==='all'?1:(f/0.127));
    const gain = i.invested * periodRet;
    return `<div class="inv-row" data-id="${i.id}">
      <div>
        <div class="inv-name">${i.name}</div>
        <div class="inv-sub"><span class="nat-dot" style="background:${NATURE[i.nat].color}"></span>${i.cur} · ${i.region}${i.status&&i.status!=='Activa'?' · '+i.status:''}</div>
      </div>
      <div><span class="tag" style="color:${NATURE[i.nat].color}">${NATURE[i.nat].label}</span><div class="cell-sub" style="margin-top:5px">${i.cat}</div></div>
      <div class="inv-amt">${money(i.cur,i.invested)}</div>
      <div class="inv-amt c-aporte">${i.monthly>0?money(i.cur,i.monthly)+'<span class="s">/mes</span>':'<span style="color:var(--muted)">—</span>'}</div>
      <div>
        <div class="inv-amt ${periodRet>=0?'pos':'neg'}">${pctFmt(periodRet*100)}</div>
        <div class="cell-sub ${gain>=0?'pos':'neg'}">${gain>=0?'+':'−'}${fmt(Math.abs(gain))}</div>
      </div>
      <div class="kebab-wrap">
        <button class="kebab" data-kebab="${i.id}" aria-label="Opciones"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg></button>
        <div class="kmenu" data-menu="${i.id}">
          <button data-act="movimiento"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h13M4 7l3-3M4 7l3 3M20 17H7M20 17l-3-3M20 17l-3 3"/></svg>Movimientos de capital</button>
          <button data-act="valoracion"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-5 4 4 8-9"/><path d="M14 7h6v6"/></svg>Valoración de la inversión</button>
          <button data-act="dashboard"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>Ver dashboard</button>
          <button data-act="edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>Editar inversión</button>
          <button data-act="delete" class="danger"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>Eliminar</button>
        </div>
      </div>
    </div>`;
  }
  function renderTable() {
    document.getElementById('invList').innerHTML = INV.map(rowHTML).join('');
    document.getElementById('tableCount').textContent = INV.length + ' inversiones';
  }
  function renderAll(){ renderIndicators(); renderDonuts(); renderTable(); }

  /* ============================================================
     MODAL 1 · CATÁLOGO (alta / edición de inversión)
     ============================================================ */
  const catOptions = (nat, sel) => CATS[nat].map(c => `<option ${c===sel?'selected':''}>${c}</option>`).join('');
  const opts = (arr, sel) => arr.map(o => `<option ${o===sel?'selected':''}>${o}</option>`).join('');
  const today = () => new Date().toISOString().slice(0,10);

  function invModal(existing) {
    const e = existing || { name:'', nat:'flujo', cat:CATS.flujo[0], cur:'USD', region:'Costa Rica', start:today(), openAmount:'', status:'Activa', freqAporte:'Mensual', monthly:'', freqIngreso:'No aplica', cashflow:'' };
    App.openModal({
      large:true,
      title: existing ? 'Editar inversión' : 'Catálogo · nueva inversión',
      sub: 'El registro maestro: qué tenés, dónde, de qué tipo y para qué sirve en tu patrimonio.',
      body: `
        <div class="fld"><span class="fld-label">Nombre de inversión</span><input class="inp" id="ivName" placeholder="p. ej. ETF S&P 500, CDP BAC, Apartamento Escazú" value="${e.name}"></div>
        <div class="fld-2" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div class="fld"><span class="fld-label">Tipo de inversión</span><select class="sel" id="ivNat"><option value="flujo" ${e.nat==='flujo'?'selected':''}>Flujo de caja</option><option value="crecim" ${e.nat==='crecim'?'selected':''}>Crecimiento patrimonial</option></select></div>
          <div class="fld"><span class="fld-label">Categoría principal</span><select class="sel" id="ivCat">${catOptions(e.nat, e.cat)}</select></div>
        </div>
        <div class="fld-2" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div class="fld"><span class="fld-label">Fecha de inicio</span><input class="inp" type="date" id="ivStart" value="${e.start}"></div>
          <div class="fld"><span class="fld-label">Moneda base</span><select class="sel" id="ivCur">${opts(['USD','CRC','EUR','BTC'], e.cur)}</select></div>
        </div>
        <div class="fld-2" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div class="fld"><span class="fld-label">Monto de apertura</span><div class="inp-money"><span class="pre">$</span><input id="ivOpen" inputmode="decimal" placeholder="0" value="${e.openAmount}"></div></div>
          <div class="fld"><span class="fld-label">Estado</span><select class="sel" id="ivStatus">${opts(STATUS, e.status)}</select></div>
        </div>
        <div class="fld-2" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div class="fld"><span class="fld-label">Frecuencia de aporte</span><select class="sel" id="ivFreqA">${opts(FREQ_APORTE, e.freqAporte)}</select></div>
          <div class="fld"><span class="fld-label">Monto de aporte esperado</span><div class="inp-money"><span class="pre">$</span><input id="ivMonthly" inputmode="decimal" placeholder="0" value="${e.monthly}"></div></div>
        </div>
        <div class="fld-2" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div class="fld"><span class="fld-label">Frecuencia de ingreso pasivo</span><select class="sel" id="ivFreqI">${opts(FREQ_INGRESO, e.freqIngreso)}</select></div>
          <div class="fld" id="ivCashWrap" style="${(e.freqIngreso&&e.freqIngreso!=='No aplica')?'':'display:none'}"><span class="fld-label">Ingreso esperado por periodo</span><div class="inp-money"><span class="pre">$</span><input id="ivCash" inputmode="decimal" placeholder="0" value="${e.cashflow}"></div></div>
        </div>
        <div class="fld"><span class="fld-label">País / región</span><input class="inp" id="ivRegion" placeholder="Costa Rica" value="${e.region}"></div>
      `,
      footer: `<button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button><button class="btn btn-primary" id="ivSave">${existing?'Guardar cambios':'Registrar inversión'}</button>`
    });
    const natSel=document.getElementById('ivNat'), catSel=document.getElementById('ivCat'),
          freqI=document.getElementById('ivFreqI'), cashWrap=document.getElementById('ivCashWrap');
    natSel.addEventListener('change', () => { catSel.innerHTML = catOptions(natSel.value); });
    freqI.addEventListener('change', () => { cashWrap.style.display = freqI.value==='No aplica' ? 'none' : ''; });
    document.getElementById('ivSave').addEventListener('click', () => {
      const num = id => parseFloat((document.getElementById(id).value||'0').toString().replace(/[^0-9.]/g,'')) || 0;
      const open = num('ivOpen');
      const data = {
        name: document.getElementById('ivName').value || 'Nueva inversión',
        nat: natSel.value, cat: catSel.value, cur: document.getElementById('ivCur').value,
        region: document.getElementById('ivRegion').value || '—',
        start: document.getElementById('ivStart').value || today(),
        openAmount: open, status: document.getElementById('ivStatus').value,
        freqAporte: document.getElementById('ivFreqA').value, monthly: num('ivMonthly'),
        freqIngreso: freqI.value, cashflow: freqI.value==='No aplica' ? 0 : num('ivCash')
      };
      if (existing) { Object.assign(existing, data); App.toast('Inversión actualizada'); }
      else {
        INV.push({ id: seq++, retAcum:0, invested: open, ...data,
          movements: open>0 ? [{date:data.start,type:'Aporte',cur:data.cur,gross:open,fee:0,tax:0,net:open,source:'Apertura'}] : [],
          valuations: [] });
        App.toast('Inversión registrada en el catálogo');
      }
      App.closeModal(); renderAll();
    });
  }

  /* ============================================================
     MODAL 2 · MOVIMIENTOS DE CAPITAL
     ============================================================ */
  function movementModal(preId) {
    const invOpts = INV.map(i => `<option value="${i.id}" ${i.id===preId?'selected':''}>${i.name}</option>`).join('');
    App.openModal({
      large:true,
      title: 'Movimientos de capital',
      sub: 'Cada entrada o salida de dinero de una inversión. El neto ajusta tu capital invertido.',
      body: `
        <div class="fld-2" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div class="fld"><span class="fld-label">Fecha</span><input class="inp" type="date" id="mvDate" value="${today()}"></div>
          <div class="fld"><span class="fld-label">Inversión</span><select class="sel" id="mvInv">${invOpts}</select></div>
        </div>
        <div class="fld-2" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div class="fld"><span class="fld-label">Tipo de movimiento</span><select class="sel" id="mvType">${opts(MOV_TYPES,'Aporte')}</select></div>
          <div class="fld"><span class="fld-label">Moneda</span><select class="sel" id="mvCur">${opts(['USD','CRC','EUR','BTC'],'USD')}</select></div>
        </div>
        <div class="fld"><span class="fld-label">Monto bruto</span><div class="inp-money"><span class="pre">$</span><input id="mvGross" inputmode="decimal" placeholder="0"></div></div>
        <div class="fld-2" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div class="fld"><span class="fld-label">Comisión</span><div class="inp-money"><span class="pre">$</span><input id="mvFee" inputmode="decimal" placeholder="0"></div></div>
          <div class="fld"><span class="fld-label">Impuesto / retención</span><div class="inp-money"><span class="pre">$</span><input id="mvTax" inputmode="decimal" placeholder="0"></div></div>
        </div>
        <div class="fld"><span class="fld-label">Fuente del dinero <span style="color:var(--muted);font-weight:400">· cuenta o frasco de patrimonio cash</span></span>
          <select class="sel" id="mvSource">${opts(['Cuenta corriente · Banco','Cuenta de ahorro','Frasco · Patrimonio cash','Cuenta remunerada','Otra inversión (reinversión)','Efectivo'],'Frasco · Patrimonio cash')}</select></div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:13px 15px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);margin-top:4px">
          <span style="font-size:12.5px;color:var(--muted)">Monto neto <span style="color:var(--muted-2)">(bruto − comisión − impuesto)</span></span>
          <strong style="font-family:var(--serif);font-size:22px;letter-spacing:-0.02em" id="mvNet">$0</strong>
        </div>
      `,
      footer: `<button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button><button class="btn btn-primary" id="mvSave">Registrar movimiento</button>`
    });
    const num = id => parseFloat((document.getElementById(id).value||'0').toString().replace(/[^0-9.]/g,'')) || 0;
    const typeSel = document.getElementById('mvType'), netEl = document.getElementById('mvNet');
    function recalc() {
      const sign = /Retiro|Venta|Comisión|Impuesto/.test(typeSel.value) ? -1 : 1;
      const net = num('mvGross') - num('mvFee') - num('mvTax');
      netEl.textContent = (sign<0?'−':'') + fmt(Math.abs(net));
      netEl.style.color = sign<0 ? 'var(--neg)' : 'var(--pos)';
    }
    ['mvGross','mvFee','mvTax'].forEach(id => document.getElementById(id).addEventListener('input', recalc));
    typeSel.addEventListener('change', recalc); recalc();
    document.getElementById('mvSave').addEventListener('click', () => {
      const inv = INV.find(x => x.id === +document.getElementById('mvInv').value); if (!inv) return;
      const type = typeSel.value, gross = num('mvGross'), fee = num('mvFee'), tax = num('mvTax');
      const net = gross - fee - tax;
      inv.movements = inv.movements || [];
      inv.movements.unshift({ date:document.getElementById('mvDate').value, type, cur:document.getElementById('mvCur').value, gross, fee, tax, net, source:document.getElementById('mvSource').value });
      if (type==='Aporte' || type==='Reinversión') inv.invested += net;
      else if (type==='Retiro' || type==='Venta parcial') inv.invested = Math.max(0, inv.invested - Math.abs(net));
      const neg = /Retiro|Venta|Comisión|Impuesto/.test(type);
      App.closeModal(); renderAll(); App.toast(type + ' · ' + (neg?'−':'+') + fmt(Math.abs(net)));
    });
  }

  /* ============================================================
     MODAL 3 · VALORACIÓN
     ============================================================ */
  function valRow(inv, v) {
    const d = new Date(v.date+'T00:00:00');
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-top:1px solid var(--line)">
      <span style="font-size:12.5px;color:var(--ink-2)">${d.getDate()} ${MES[d.getMonth()]} ${d.getFullYear()}</span>
      <strong style="font-size:13.5px;font-variant-numeric:tabular-nums">${money(inv.cur,v.value)}</strong></div>`;
  }
  function valuationModal(inv) {
    const hist = (inv.valuations||[]).slice().sort((a,b)=>b.date.localeCompare(a.date));
    App.openModal({
      title: 'Valoración de la inversión',
      sub: inv.name + ' · una foto del valor en el tiempo',
      body: `
        <div class="fld-2" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div class="fld"><span class="fld-label">Fecha de valoración</span><input class="inp" type="date" id="vlDate" value="${today()}"></div>
          <div class="fld"><span class="fld-label">Valor de cuenta</span><div class="inp-money"><span class="pre">${CURSYM[inv.cur]||'$'}</span><input id="vlValue" inputmode="decimal" placeholder="${Math.round(inv.invested)}"></div></div>
        </div>
        <div style="font-size:11.5px;color:var(--muted);line-height:1.5;margin:-4px 0 14px">Incluye capital invertido + aportes recurrentes + rendimientos acumulados de la inversión a esa fecha.</div>
        <button class="btn btn-primary" id="vlAdd" style="width:100%;justify-content:center;margin-bottom:18px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px"><path d="M12 5v14M5 12h14"/></svg>Guardar valoración</button>
        <div style="font-weight:600;font-size:12.5px;margin-bottom:6px">Historial de valoraciones</div>
        <div id="vlHist">${hist.length ? hist.map(v=>valRow(inv,v)).join('') : '<div style="font-size:12.5px;color:var(--muted);padding:8px 0">Aún no hay valoraciones registradas.</div>'}</div>
      `,
      footer: `<button class="btn btn-ghost" onclick="App.closeModal()">Cerrar</button>`
    });
    document.getElementById('vlAdd').addEventListener('click', () => {
      const val = parseFloat((document.getElementById('vlValue').value||'0').replace(/[^0-9.]/g,'')) || 0;
      if (!val) { App.toast('Ingresa un valor'); return; }
      inv.valuations = inv.valuations || [];
      inv.valuations.push({ date:document.getElementById('vlDate').value, value:val });
      const h = inv.valuations.slice().sort((a,b)=>b.date.localeCompare(a.date));
      document.getElementById('vlHist').innerHTML = h.map(v=>valRow(inv,v)).join('');
      App.toast('Valoración registrada'); renderAll();
    });
  }

  /* ============================================================
     MODAL 4 · DASHBOARD por inversión
     ============================================================ */
  function buildSeries(inv) {
    const months = 12, base = inv.invested / (1 + inv.retAcum);
    const series = [], aportes = [], passive = [], monthRet = [];
    let val = base;
    for (let i=0;i<months;i++){
      const growth = inv.retAcum/months * base * (0.7 + 0.6*Math.sin(i*0.9+inv.id));
      const ap = (inv.monthly||0);
      val += growth + ap;
      series.push(val); aportes.push(ap); passive.push(inv.cashflow||0); monthRet.push(growth);
    }
    (inv.valuations||[]).forEach((v,k,arr)=>{ const idx = Math.min(months-1, Math.round((k+1)/(arr.length+1)*months)); series[idx]=v.value; });
    return { series, aportes, passive, monthRet, base };
  }
  function lineChart(data, color, area) {
    const W=300,H=92,pad=4; const max=Math.max(...data)*1.04, min=Math.min(...data,0)*0.98;
    const X=i=>pad+i*((W-2*pad)/(data.length-1||1)), Y=v=>H-6-((v-min)/(max-min||1))*(H-16);
    const line=data.map((v,i)=>`${i?'L':'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    const gid='dlf'+Math.random().toString(36).slice(2,7);
    const fill = area ? `<defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity="0.16"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="${line} L${X(data.length-1).toFixed(1)},${H} L${X(0).toFixed(1)},${H} Z" fill="url(#${gid})"/>` : '';
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:92px;display:block">${fill}<path d="${line}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  function barChart(data, color) {
    const W=300,H=92,pad=4,gap=3; const max=Math.max(...data.map(Math.abs))*1.1||1, n=data.length;
    const bw=(W-2*pad)/n-gap, zero=H-8;
    let bars=''; data.forEach((v,i)=>{ const h=Math.abs(v)/max*(H-18); const x=pad+i*((W-2*pad)/n); const y=v>=0?zero-h:zero; bars+=`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(2,h).toFixed(1)}" rx="2" fill="${v>=0?color:'var(--neg)'}" opacity="0.9"/>`; });
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:92px;display:block">${bars}</svg>`;
  }
  function miniDonut(segs) {
    let off=25, html=`<circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--chip)" stroke-width="6"/>`;
    segs.forEach(s=>{ html+=`<circle cx="21" cy="21" r="15.915" fill="none" stroke="${s.color}" stroke-width="6" stroke-dasharray="${s.pct.toFixed(2)} ${(100-s.pct).toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"/>`; off-=s.pct; });
    return `<svg viewBox="0 0 42 42" style="width:104px;height:104px">${html}</svg>`;
  }
  function dashStat(k, v, sub, col) {
    return `<div style="background:var(--surface-2);border:1px solid var(--line);border-radius:12px;padding:13px 14px">
      <div style="font-size:10.5px;letter-spacing:.03em;text-transform:uppercase;color:var(--muted);font-weight:500">${k}</div>
      <div style="font-family:var(--serif);font-size:21px;letter-spacing:-0.02em;margin-top:5px${col?';color:'+col:''}">${v}</div>
      ${sub?`<div style="font-size:10.5px;color:var(--muted);margin-top:3px">${sub}</div>`:''}</div>`;
  }
  function chartCard(title, svg, legend) {
    return `<div style="background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 16px">
      <div style="font-size:12.5px;font-weight:600;margin-bottom:8px">${title}</div>${svg}${legend?`<div style="font-size:10.5px;color:var(--muted);margin-top:6px">${legend}</div>`:''}</div>`;
  }
  function dashboardModal(inv) {
    const s = buildSeries(inv);
    const investedTot = inv.invested;
    const recurring = inv.monthly||0;
    const rate = Math.round(recurring / RECURRING_INCOME * 100);
    const currentVal = s.series[s.series.length-1];
    const prevVal = s.series[s.series.length-2] || s.base;
    const gainMonth = currentVal - prevVal - recurring;
    const retMonthPct = prevVal ? gainMonth/prevVal*100 : 0;
    const yearsHeld = Math.max(0.5, (Date.now()-new Date(inv.start+'T00:00:00'))/(365.25*864e5));
    const annualized = (Math.pow(1+inv.retAcum, 1/yearsHeld)-1)*100;
    const accumPct = inv.retAcum*100;
    const passiveMonth = inv.cashflow||0, passiveYear = passiveMonth*12;
    const yieldCap = investedTot ? passiveYear/investedTot*100 : 0;
    const natSegArr = [{color:NATURE[inv.nat].color, pct:100}];

    App.openModal({
      large:true,
      title: inv.name,
      sub: `${NATURE[inv.nat].label} · ${inv.cat} · ${inv.cur} · ${inv.region}`,
      body: `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:8px">
          ${dashStat('Monto invertido', money(inv.cur,investedTot), 'aportes netos − retiros')}
          ${dashStat('Valor actual', money(inv.cur,currentVal), 'valoración de mercado')}
          ${dashStat('Aporte recurrente', recurring?money(inv.cur,recurring)+'/mes':'—', inv.freqAporte)}
          ${dashStat('Ganancia mensual', (gainMonth>=0?'+':'−')+fmt(Math.abs(gainMonth)), 'último mes', gainMonth>=0?'var(--pos)':'var(--neg)')}
          ${dashStat('Rendimiento mensual', pctFmt(retMonthPct), 'sobre valor inicial', retMonthPct>=0?'var(--pos)':'var(--neg)')}
          ${dashStat('Rendimiento anualizado', pctFmt(annualized), `${yearsHeld.toFixed(1)} años`, annualized>=0?'var(--pos)':'var(--neg)')}
          ${dashStat('Rentabilidad acumulada', pctFmt(accumPct), 'desde el inicio', accumPct>=0?'var(--pos)':'var(--neg)')}
          ${dashStat('Ingreso pasivo mensual', passiveMonth?money(inv.cur,passiveMonth):'—', inv.freqIngreso)}
          ${dashStat('Ingreso pasivo anual', passiveYear?money(inv.cur,passiveYear):'—', 'estimado')}
          ${dashStat('Yield sobre capital', passiveYear?yieldCap.toFixed(1).replace('.',',')+'%':'—', 'ingreso/capital', 'var(--c-income)')}
          ${dashStat('Tasa de inversión', recurring?rate+'%':'—', 'del ingreso mensual')}
          ${dashStat('Tipo de activo', inv.nat==='flujo'?'Flujo de caja':'Crecimiento', inv.status)}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px">
          ${chartCard('Valor total a través del tiempo', lineChart(s.series, NATURE[inv.nat].color, true), '12 meses · valoración + aportes + rendimientos')}
          ${chartCard('Aportes mensuales', barChart(s.aportes, 'var(--c-invest)'), 'cuánto inviertes cada mes')}
          ${chartCard('Rentabilidad acumulada', lineChart(s.series.map(v=>(v-s.base)/(s.base||1)*100), 'var(--pos)', false), 'ganancia/pérdida desde el inicio (%)')}
          ${chartCard('Rendimiento mensual', barChart(s.monthRet, 'var(--pos)'), 'meses positivos y negativos')}
          ${inv.cashflow ? chartCard('Ingreso pasivo mensual', barChart(s.passive, 'var(--c-income)'), 'pagos recibidos por mes') : chartCard('Composición del activo', `<div style="display:flex;align-items:center;gap:16px"><div style="position:relative;display:inline-grid;place-items:center">${miniDonut(natSegArr)}<div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center"><div style="font-family:var(--serif);font-size:15px">100%</div></div></div><div style="font-size:12px;color:var(--ink-2)"><span style="display:inline-block;width:9px;height:9px;border-radius:3px;background:${NATURE[inv.nat].color};margin-right:7px"></span>${NATURE[inv.nat].label}</div></div>`, '')}
          ${chartCard('Línea de tasa de inversión', lineChart(s.aportes.map((_,i)=>rate*(0.85+0.25*Math.sin(i+inv.id))), 'var(--c-savings)', false), '% de ingresos invertido')}
        </div>
        <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
          <button class="btn btn-secondary" id="dbMov" style="flex:1;justify-content:center;min-width:160px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px"><path d="M4 7h13M4 7l3-3M4 7l3 3M20 17H7"/></svg>Registrar movimiento</button>
          <button class="btn btn-secondary" id="dbVal" style="flex:1;justify-content:center;min-width:160px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px"><path d="M3 17l5-5 4 4 8-9"/></svg>Nueva valoración</button>
        </div>
      `,
      footer: `<button class="btn btn-ghost" onclick="App.closeModal()">Cerrar</button><button class="btn btn-primary" id="dbEdit">Editar inversión</button>`
    });
    document.getElementById('dbMov').addEventListener('click', () => movementModal(inv.id));
    document.getElementById('dbVal').addEventListener('click', () => valuationModal(inv));
    document.getElementById('dbEdit').addEventListener('click', () => invModal(inv));
  }

  /* ---------- Delete ---------- */
  function deleteModal(inv) {
    App.openModal({
      title: 'Eliminar inversión', sub: inv.name,
      body: `<div style="font-size:13.5px;color:var(--ink-2);line-height:1.55">¿Eliminar <strong>${inv.name}</strong> de tu portafolio? Se borran sus movimientos y valoraciones. Esta acción no se puede deshacer.</div>`,
      footer: `<button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button><button class="btn btn-primary" id="delGo" style="background:var(--neg)">Eliminar</button>`
    });
    document.getElementById('delGo').addEventListener('click', () => { INV = INV.filter(x=>x.id!==inv.id); App.closeModal(); renderAll(); App.toast('Inversión eliminada'); });
  }

  /* ---------- Wire portfolio ---------- */
  document.getElementById('addInvBtn').addEventListener('click', () => invModal(null));
  document.getElementById('indSeg').addEventListener('click', e => {
    const b=e.target.closest('.seg-btn'); if(!b) return;
    document.querySelectorAll('#indSeg .seg-btn').forEach(x=>x.classList.remove('on')); b.classList.add('on');
    indPeriod=b.dataset.p; renderIndicators();
  });
  document.getElementById('tableSeg').addEventListener('click', e => {
    const b=e.target.closest('.seg-btn'); if(!b) return;
    document.querySelectorAll('#tableSeg .seg-btn').forEach(x=>x.classList.remove('on')); b.classList.add('on');
    tablePeriod=b.dataset.p; renderTable();
  });
  document.getElementById('invList').addEventListener('click', e => {
    const kb = e.target.closest('.kebab');
    if (kb) {
      e.stopPropagation();
      const menu = kb.parentElement.querySelector('.kmenu');
      const wasOpen = menu.classList.contains('open');
      document.querySelectorAll('.kmenu.open').forEach(m=>m.classList.remove('open'));
      if (!wasOpen) menu.classList.add('open');
      return;
    }
    const act = e.target.closest('[data-act]');
    if (act) {
      const id = +act.closest('[data-menu]').dataset.menu;
      const inv = INV.find(x=>x.id===id);
      document.querySelectorAll('.kmenu.open').forEach(m=>m.classList.remove('open'));
      const a = act.dataset.act;
      if (a==='movimiento') movementModal(id);
      else if (a==='valoracion') valuationModal(inv);
      else if (a==='dashboard') dashboardModal(inv);
      else if (a==='edit') invModal(inv);
      else deleteModal(inv);
      return;
    }
    const row = e.target.closest('.inv-row');
    if (row) { const inv = INV.find(x=>x.id===+row.dataset.id); if (inv) dashboardModal(inv); }
  });
  document.addEventListener('click', () => document.querySelectorAll('.kmenu.open').forEach(m=>m.classList.remove('open')));

  renderAll();

  /* ============================================================
     SUBTABS
     ============================================================ */
  document.getElementById('subtabs').addEventListener('click', e => {
    const b=e.target.closest('.subtab'); if(!b) return;
    document.querySelectorAll('.subtab').forEach(x=>x.classList.remove('on')); b.classList.add('on');
    document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('on', p.dataset.panel===b.dataset.st));
    if (b.dataset.st==='calculadora') drawCalc();
    if (b.dataset.st==='monitor') loadMonitor();
    window.scrollTo({ top:0, behavior:'smooth' });
  });

  /* ============================================================
     CALCULADORA DE INTERÉS COMPUESTO
     ============================================================ */
  const ci = id => document.getElementById(id);
  function calcCompute() {
    const P=+ci('cInit').value, m=+ci('cMonth').value, r=+ci('cRate').value/100, yrs=+ci('cYears').value;
    const mr=r/12, n=yrs*12, series=[], contribSeries=[]; let bal=P, contrib=P;
    for (let i=0;i<=n;i++){ if(i>0){ bal=bal*(1+mr)+m; contrib+=m; } if(i%12===0){ series.push(bal); contribSeries.push(contrib); } }
    return { final:bal, contrib, interest:bal-contrib, series, contribSeries };
  }
  function drawCalc() {
    ci('cInitV').textContent = fmt(+ci('cInit').value);
    ci('cMonthV').textContent = fmt(+ci('cMonth').value);
    ci('cRateV').textContent = (+ci('cRate').value).toString().replace('.', ',') + '%';
    ci('cYearsV').textContent = ci('cYears').value + ' años';
    const r = calcCompute();
    ci('cFinal').textContent = fmt(r.final);
    ci('cContrib').textContent = fmt(r.contrib);
    ci('cInterest').textContent = fmt(r.interest);
    ci('cMult').textContent = (r.final/(r.contrib||1)).toFixed(1).replace('.', ',') + '×';
    const W=560,H=230,pad=6; const all=r.series.concat(r.contribSeries); const max=Math.max(...all)*1.04, min=0;
    const X=i=>pad+i*((W-2*pad)/(r.series.length-1||1)), Y=v=>H-8-((v-min)/(max-min||1))*(H-20);
    const mk=arr=>arr.map((v,i)=>`${i?'L':'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    const total=mk(r.series), contrib=mk(r.contribSeries);
    const area=total+` L${X(r.series.length-1).toFixed(1)},${H} L${X(0).toFixed(1)},${H} Z`;
    ci('calcChart').innerHTML =
      `<defs><linearGradient id="ccf" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--c-invest)" stop-opacity="0.2"/><stop offset="1" stop-color="var(--c-invest)" stop-opacity="0"/></linearGradient></defs>
       <g stroke="var(--line)" stroke-width="1"><line x1="0" y1="${H*0.33}" x2="${W}" y2="${H*0.33}"/><line x1="0" y1="${H*0.66}" x2="${W}" y2="${H*0.66}"/></g>
       <path d="${area}" fill="url(#ccf)"/>
       <path d="${contrib}" fill="none" stroke="var(--muted-2)" stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round"/>
       <path d="${total}" fill="none" stroke="var(--c-invest)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
       <circle cx="${X(r.series.length-1).toFixed(1)}" cy="${Y(r.series[r.series.length-1]).toFixed(1)}" r="4" fill="var(--surface)" stroke="var(--c-invest)" stroke-width="2"/>`;
  }
  ['cInit','cMonth','cRate','cYears'].forEach(id => ci(id).addEventListener('input', drawCalc));

  /* ============================================================
     MONITOR DE FONDOS (Finnhub con respaldo a demo)
     ============================================================ */
  const FINNHUB_TOKEN = 'd7p1rppr01qr68pbdaigd7p1rppr01qr68pbdaj0';
  const WATCH = [
    { sym:'VTI', name:'Vanguard Total Market', col:'linear-gradient(135deg,var(--info),var(--teal))', demo:284.12, dc:1.42 },
    { sym:'VOO', name:'Vanguard S&P 500', col:'linear-gradient(135deg,var(--c-invest),var(--info))', demo:512.40, dc:0.88 },
    { sym:'VXUS', name:'Vanguard Internacional', col:'linear-gradient(135deg,var(--pos),var(--teal))', demo:64.20, dc:-0.34 },
    { sym:'QQQ', name:'Invesco QQQ · Nasdaq', col:'linear-gradient(135deg,var(--c-networth),var(--ink-2))', demo:478.90, dc:2.10 },
    { sym:'SCHD', name:'Schwab Dividendos', col:'linear-gradient(135deg,var(--gold),var(--warn))', demo:78.10, dc:0.42 },
    { sym:'BND', name:'Total Bond Market', col:'linear-gradient(135deg,var(--warn),var(--gold))', demo:74.50, dc:-0.18 },
    { sym:'AAPL', name:'Apple Inc.', col:'linear-gradient(135deg,var(--ink-2),var(--c-networth))', demo:228.60, dc:1.05 },
    { sym:'BTC', name:'Bitcoin · USD', col:'linear-gradient(135deg,var(--gold),#e8a33d)', demo:67420, dc:3.4 }
  ];
  function spark(seed, up) {
    const pts=[]; let v=20;
    for (let i=0;i<14;i++){ v += Math.sin(i*1.6+seed)*4 + (up? i*0.7 : -i*0.5); pts.push(v); }
    const max=Math.max(...pts), min=Math.min(...pts);
    const X=i=>i*(120/13), Y=x=>30-((x-min)/(max-min||1))*26-2;
    const d=pts.map((x,i)=>`${i?'L':'M'}${X(i).toFixed(1)},${Y(x).toFixed(1)}`).join(' ');
    return `<svg class="mon-spark" viewBox="0 0 120 34" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="${up?'var(--pos)':'var(--neg)'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  function monRow(w, price, chg) {
    const up = chg >= 0;
    const priceFmt = price>=1000 ? '$'+Math.round(price).toLocaleString('es-ES') : '$'+price.toFixed(2).replace('.', ',');
    return `<div class="mon-row" data-sym="${w.sym}">
      <div class="mon-ic" style="background:${w.col}">${w.sym.slice(0,4)}</div>
      <div><div class="mon-name">${w.sym}</div><div class="mon-sub">${w.name}</div></div>
      <div><div class="mon-price">${priceFmt}</div></div>
      <div><div class="mon-chg ${up?'pos':'neg'}">${pctFmt(chg)}</div></div>
      <div class="c-spark">${spark(w.sym.length, up)}</div>
    </div>`;
  }
  let monLoaded = false;
  function renderMonitor(quotes, live) {
    const q = (searchVal()||'').toUpperCase();
    const list = WATCH.filter(w => !q || w.sym.includes(q) || w.name.toUpperCase().includes(q));
    document.getElementById('monList').innerHTML = list.map(w => { const data = quotes[w.sym] || { p:w.demo, dp:w.dc }; return monRow(w, data.p, data.dp); }).join('') || `<div style="padding:30px;text-align:center;color:var(--muted);font-size:13px">Sin resultados.</div>`;
    const st = document.getElementById('monStatus');
    st.className = 'status-pill ' + (live?'live':'cached');
    st.innerHTML = `<span class="d"></span>${live?'Precios en vivo':'Datos de demostración'}`;
  }
  function searchVal(){ const s=document.getElementById('monSearch'); return s?s.value:''; }
  async function loadMonitor() {
    if (monLoaded) return; monLoaded = true;
    renderMonitor({}, false);
    const quotes = {}; let any = false;
    await Promise.all(WATCH.filter(w=>w.sym!=='BTC').map(async w => {
      try {
        const ctrl = new AbortController(); const to = setTimeout(()=>ctrl.abort(), 3500);
        const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${w.sym}&token=${FINNHUB_TOKEN}`, { signal: ctrl.signal });
        clearTimeout(to);
        if (!res.ok) return;
        const j = await res.json();
        if (j && typeof j.c === 'number' && j.c > 0) { quotes[w.sym] = { p: j.c, dp: j.dp || 0 }; any = true; }
      } catch (e) {}
    }));
    renderMonitor(quotes, any);
  }
  const monSearch = document.getElementById('monSearch');
  if (monSearch) monSearch.addEventListener('input', () => renderMonitor({}, false));
  const monRefresh = document.getElementById('monRefresh');
  if (monRefresh) monRefresh.addEventListener('click', () => { monLoaded = false; loadMonitor(); });
})();
