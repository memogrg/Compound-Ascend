/* ============================================================
   CARTERA+ · App shell  (sidebar web + topbar + mobile tabbar)
   Dark mode default. Icons from the brand set. window.App API.
   Each page sets window.PAGE = { id, title, crumb } first.
   ============================================================ */
(function () {
  const PAGE = window.PAGE || { id:"inicio", title:"Patrimonio", crumb:"Capital" };

  /* ---- brand icon set (24px grid, stroke 2, rounded) ---- */
  const I = {
    inicio:'<path d="M4 11 L12 4 L20 11"/><path d="M6 10 V20 H18 V10"/>',
    cartera:'<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M16 12 h2"/>',
    rendimiento:'<path d="M4 16 l5 -5 l4 3 l7 -8"/><path d="M16 6 h4 v4"/>',
    riesgo:'<path d="M12 3 L19 6 V11 C19 16 12 21 12 21 C12 21 5 16 5 11 V6 Z"/>',
    educacion:'<path d="M3 8 l9 -4 l9 4 l-9 4 Z"/><path d="M21 8 v5"/><path d="M7 10 v4 c0 1.5 10 1.5 10 0 v-4"/>',
    perfil:'<circle cx="12" cy="8" r="4"/><path d="M5 20 c0 -4 3.5 -6 7 -6 s7 2 7 6"/>',
    aportar:'<path d="M12 5 V19 M5 12 H19"/>',
    presupuesto:'<path d="M12 3 a9 9 0 1 0 9 9 h-9 Z"/>',
    metas:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>',
    movimientos:'<path d="M7 4 V20 M7 4 l-3 4 M7 4 l3 4 M17 20 V4 M17 20 l-3 -4 M17 20 l3 -4"/>',
    cuentas:'<path d="M3 9 l9 -5 l9 5"/><path d="M5 9 V19 M19 9 V19 M9 9 V19 M15 9 V19 M3 19 H21"/>',
    seguridad:'<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11 V8 a4 4 0 0 1 8 0 v3"/>',
    buscar:'<circle cx="11" cy="11" r="7"/><path d="M16 16 l5 5"/>',
    alertas:'<path d="M6 9 a6 6 0 0 1 12 0 c0 5 2 7 2 7 H4 c0 0 2 -2 2 -7"/><path d="M10 20 a2 2 0 0 0 4 0"/>',
    ajustes:'<circle cx="12" cy="12" r="3.4"/><path d="M12 3 v3 M12 18 v3 M3 12 h3 M18 12 h3 M5.5 5.5 l2 2 M16.5 16.5 l2 2 M18.5 5.5 l-2 2 M5.5 18.5 l2 -2"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
    menu:'<path d="M3 6h18M3 12h18M3 18h18"/>',
    x:'<path d="M18 6 6 18M6 6l12 12"/>'
  };
  const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

  /* ---- recolored isotipo: C in muted, + in accent ---- */
  const ISO = `<svg class="iso" viewBox="0 0 120 120" fill="none" aria-label="Cartera+">
    <path d="M98.06 42.25 A42 42 0 1 0 98.06 77.75" stroke="var(--text-muted)" stroke-width="9" stroke-linecap="round"/>
    <path d="M87.5 49.5 V70.5 M77 60 H98" stroke="var(--accent)" stroke-width="8" stroke-linecap="round"/></svg>`;

  /* ---- nav model ---- */
  const NAV = [
    { label:"Capital", items:[
      { id:"inicio", name:"Patrimonio", icon:"inicio", href:"Inicio.html" },
      { id:"cuentas", name:"Cuentas y tarjetas", icon:"cuentas", href:"Cuentas.html" },
    ]},
    { label:"Flujo", items:[
      { id:"presupuesto", name:"Presupuesto", icon:"presupuesto", href:"Presupuesto.html" },
      { id:"movimientos", name:"Movimientos", icon:"movimientos", href:"Movimientos.html" },
      { id:"metas", name:"Ahorro y metas", icon:"metas", href:"Metas.html" },
    ]},
    { label:"Crecimiento", items:[
      { id:"cartera", name:"Cartera", icon:"cartera", href:"Cartera.html" },
      { id:"rendimiento", name:"Rendimiento", icon:"rendimiento", href:"Rendimiento.html" },
      { id:"riesgo", name:"Riesgo y protección", icon:"riesgo", href:"Riesgo.html" },
    ]},
    { label:"Más", items:[
      { id:"educacion", name:"Educación", icon:"educacion", href:"Educacion.html" },
    ]},
  ];
  const activeId = PAGE.navId || PAGE.id;

  /* ---- sidebar ---- */
  const sidebar = document.createElement("aside");
  sidebar.className = "sidebar";
  sidebar.innerHTML = `
    <div class="brand">${ISO}<div class="word">CARTERA<span class="plus">+</span></div></div>
    ${NAV.map(g => `<div class="nav-label">${g.label}</div><nav class="nav">${g.items.map(it=>`
      <a class="nav-item${it.id===activeId?' active':''}" href="${it.href}" data-nav="${it.id}">
        <span class="nav-ic">${svg(I[it.icon])}</span><span>${it.name}</span>
        ${it.badge?`<span class="nav-badge">${it.badge}</span>`:''}
      </a>`).join("")}</nav>`).join("")}
    <div class="sidebar-cta">
      <div class="aportar-card" id="aportarCard">
        <div class="ov">Patrimonio total</div>
        <div class="amt">$ 348.920</div>
        <div class="chg">+12,4% este año</div>
        <div class="btn-row">${svg(I.aportar)} Aportar</div>
      </div>
      <div class="user-row">
        <div class="avatar">EM</div>
        <div style="flex:1;min-width:0"><div class="user-name">Elena Marsh</div><div class="user-sub">Plan Cartera+</div></div>
      </div>
    </div>`;

  /* ---- topbar ---- */
  const topbar = document.createElement("div");
  topbar.className = "topbar";
  topbar.innerHTML = `
    <button class="icon-btn hamburger" aria-label="Menú">${svg(I.menu)}</button>
    <div class="page-h"><span class="crumb">${PAGE.crumb||"Capital"}</span><span class="title">${PAGE.title}</span></div>
    <div class="topbar-spacer"></div>
    <div class="search">${svg(I.buscar)}<input placeholder="Buscar activos, movimientos…"></div>
    <button class="icon-btn" aria-label="Alertas">${svg(I.alertas)}</button>
    <button class="theme-toggle" id="themeToggle" aria-label="Cambiar modo"><span class="sun">${svg(I.sun)}</span><span class="moon">${svg(I.moon)}</span></button>`;

  /* ---- mobile tab bar ---- */
  const tabbar = document.createElement("nav");
  tabbar.className = "tabbar";
  const TABS = [
    { id:"inicio", name:"Inicio", icon:"inicio", href:"Inicio.html" },
    { id:"cartera", name:"Cartera", icon:"cartera", href:"Cartera.html" },
    { id:"aportar", name:"Aportar", icon:"aportar", aportar:true },
    { id:"movimientos", name:"Mov.", icon:"movimientos", href:"Movimientos.html" },
    { id:"perfil", name:"Perfil", icon:"perfil", href:"Perfil.html" },
  ];
  tabbar.innerHTML = TABS.map(t => t.aportar
    ? `<button class="tab tab-aportar" id="tabAportar"><span class="fab">${svg(I.aportar)}</span></button>`
    : `<a class="tab${t.id===activeId?' on':''}" href="${t.href}">${svg(I[t.icon])}${t.name}</a>`).join("");

  const scrim = document.createElement("div");
  scrim.className = "sb-scrim";

  /* ---- mount ---- */
  const app = document.querySelector(".app");
  const main = document.querySelector(".main");
  app.insertBefore(sidebar, app.firstChild);
  main.insertBefore(topbar, main.firstChild);
  document.body.appendChild(scrim);
  document.body.appendChild(tabbar);

  /* ---- theme (dark default) ---- */
  const root = document.documentElement;
  const stored = localStorage.getItem("cartera-theme");
  root.setAttribute("data-theme", stored || "dark");
  themeToggleInit();
  function themeToggleInit(){
    document.getElementById("themeToggle").addEventListener("click", () => {
      const next = root.getAttribute("data-theme")==="dark" ? "light" : "dark";
      root.setAttribute("data-theme", next); localStorage.setItem("cartera-theme", next);
    });
  }

  /* ---- mobile drawer ---- */
  const open=()=>{ sidebar.classList.add("open"); scrim.classList.add("open"); };
  const close=()=>{ sidebar.classList.remove("open"); scrim.classList.remove("open"); };
  topbar.querySelector(".hamburger").addEventListener("click", open);
  scrim.addEventListener("click", close);
  sidebar.querySelectorAll(".nav-item").forEach(a=>a.addEventListener("click", close));

  /* ============================================================
     App API: modal + toast
     ============================================================ */
  const mScrim = document.createElement("div"); mScrim.className="m-scrim"; document.body.appendChild(mScrim);
  mScrim.addEventListener("click", e => { if(e.target===mScrim) App.closeModal(); });
  const toastWrap = document.createElement("div"); toastWrap.className="toast-wrap"; document.body.appendChild(toastWrap);

  const App = {
    icon:(n)=>svg(I[n]),
    openModal({title,sub,body,footer,large}={}) {
      mScrim.innerHTML = `<div class="modal${large?' lg':''}" role="dialog">
        <div class="modal-head"><div><div class="modal-title">${title||""}</div>${sub?`<div class="modal-sub">${sub}</div>`:""}</div>
        <button class="modal-x" aria-label="Cerrar">${svg(I.x)}</button></div>
        <div class="modal-body">${body||""}</div>${footer?`<div class="modal-foot">${footer}</div>`:""}</div>`;
      mScrim.querySelector(".modal-x").addEventListener("click",()=>App.closeModal());
      requestAnimationFrame(()=>mScrim.classList.add("open"));
      return mScrim;
    },
    closeModal(){ mScrim.classList.remove("open"); },
    toast(msg, kind){
      const t=document.createElement("div"); t.className="toast"+(kind==="error"?" error":"");
      t.innerHTML = `<span class="t-ic">${kind==="error"?svg(I.alertas):'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-11"/></svg>'}</span>${msg}`;
      toastWrap.appendChild(t); requestAnimationFrame(()=>t.classList.add("show"));
      setTimeout(()=>{ t.classList.remove("show"); setTimeout(()=>t.remove(),220); }, 2600);
    },
    aportarModal(){
      App.openModal({ title:"Aportar", sub:"Suma a tu patrimonio. El + es la acción que te hace crecer.",
        body:`<div class="fld"><label class="fld-l">Monto</label><div class="money"><span>$</span><input id="apAmt" inputmode="decimal" placeholder="2.400"></div></div>
          <div class="fld"><label class="fld-l">Origen</label><select class="sel" id="apSrc"><option>Cuenta ···0824</option><option>Ahorro ···1190</option><option>Transferencia externa</option></select></div>
          <div class="fld"><label class="fld-l">Destino</label><select class="sel"><option>Fondo de emergencia</option><option>Acciones globales</option><option>Fondos indexados</option></select></div>`,
        footer:`<button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button><button class="btn btn-primary" id="apGo">${svg(I.aportar)} Confirmar aporte</button>` });
      document.getElementById("apGo").addEventListener("click",()=>{ const v=document.getElementById("apAmt").value||"2.400"; App.closeModal(); App.toast("Aporte de $ "+v+" confirmado"); });
    }
  };
  window.App = App;
  document.getElementById("aportarCard").addEventListener("click", ()=>App.aportarModal());
  tabbar.querySelector("#tabAportar").addEventListener("click", ()=>App.aportarModal());
  document.addEventListener("keydown", e=>{ if(e.key==="Escape") App.closeModal(); });
})();
