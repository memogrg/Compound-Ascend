/* ============================================================
   COMPOUND ASCEND — App shell (ES)
   Injects sidebar, topbar, theme toggle, AI coach.
   Exposes window.App: openModal, closeModal, toast, setActiveNav.
   ============================================================ */
(function () {
  const PAGE = window.PAGE || { id: "dashboard", title: "Panel", crumb: "Resumen" };

  const I = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    budget: '<path d="M3 7h18M6 7v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7M9 7V5a3 3 0 0 1 6 0v2"/>',
    income: '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    expense: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    txn: '<path d="M4 7h13M4 7l3-3M4 7l3 3M20 17H7M20 17l-3-3M20 17l-3 3"/>',
    savings: '<path d="M19 7c0-1.7-3.1-3-7-3S5 5.3 5 7m14 0v10c0 1.7-3.1 3-7 3s-7-1.3-7-3V7m14 0c0 1.7-3.1 3-7 3S5 8.7 5 7"/>',
    debt: '<path d="M3 12c0-4 3.5-7 9-7s9 3 9 7-3.5 7-9 7c-1.6 0-3.1-.2-4.4-.7L3 20l1.4-3.6C3.5 15.2 3 13.7 3 12Z"/><path d="M9 12h6"/>',
    invest: '<path d="M3 17l5-5 4 4 8-9"/><path d="M14 7h6v6"/>',
    portfolio: '<path d="M4 7h16v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7Z"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M4 12h16"/>',
    networth: '<path d="M12 3v18M5 8c0-1.7 1.5-3 4-3h6c2.5 0 4 1.3 4 3s-1.5 3-4 3H9c-2.5 0-4 1.3-4 3s1.5 3 4 3h6c2.5 0 4-1.3 4-3"/>',
    defense: '<path d="M12 2 4 6v6c0 5 3.4 9 8 10 4.6-1 8-5 8-10V6l-8-4Z"/><path d="m9 12 2 2 4-4"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
    spark: '<path d="M12 3 13.6 8.5 19 10l-5.4 1.5L12 17l-1.6-5.5L5 10l5.4-1.5L12 3Z"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/>',
    check: '<path d="m5 12 5 5 9-11"/>'
  };
  const svg = (p, w) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w||1.8}" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

  /* ---------- Nav (ES) ---------- */
  const NAV = [
    { label: "Resumen", items: [
      { id: "dashboard", name: "Panel", icon: "dashboard", href: "Dashboard.html" },
    ]},
    { label: "Base", items: [
      { id: "budget", name: "Presupuesto", icon: "budget", href: "Budget.html", badge: "4" },
      { id: "income", name: "Ingresos", icon: "income", href: "Budget.html#income" },
      { id: "expenses", name: "Gastos", icon: "expense", href: "Budget.html#expenses" },
      { id: "transactions", name: "Transacciones", icon: "txn", href: "Budget.html#transactions" },
    ]},
    { label: "Control", items: [
      { id: "savings", name: "Ahorros y Emergencia", icon: "savings", href: "Networth.html#savings" },
      { id: "debts", name: "Deudas y Préstamos", icon: "debt", href: "Debts.html", dot: "var(--neg)" },
    ]},
    { label: "Crecimiento", items: [
      { id: "invest", name: "Inversiones", icon: "invest", href: "Investments.html" },
      { id: "portfolio", name: "Cartera", icon: "portfolio", href: "Investments.html#portfolio" },
    ]},
    { label: "Patrimonio", items: [
      { id: "networth", name: "Patrimonio Neto", icon: "networth", href: "Networth.html" },
      { id: "defense", name: "Defensa Patrimonial", icon: "defense", href: "Defense.html" },
    ]},
  ];

  const activeId = PAGE.navId || PAGE.id;
  const navHTML = NAV.map(group => `
    <div class="nav-label">${group.label}</div>
    <nav class="nav">
      ${group.items.map(it => `
        <a class="nav-item${it.id === activeId ? " active" : ""}" href="${it.href}" data-nav="${it.id}">
          <span class="nav-icon">${svg(I[it.icon])}</span>
          <span>${it.name}</span>
          ${it.badge ? `<span class="nav-badge">${it.badge}</span>` : ""}
          ${it.dot ? `<span class="nav-dot" style="background:${it.dot}"></span>` : ""}
        </a>`).join("")}
    </nav>`).join("");

  const sidebar = document.createElement("aside");
  sidebar.className = "sidebar";
  sidebar.innerHTML = `
    <div class="brand">
      <div class="brand-mark" aria-label="Compound Ascend">
        <svg width="22" height="22" viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <defs>
            <clipPath id="caLogoClip"><circle cx="32" cy="32" r="20.5"/></clipPath>
            <linearGradient id="caLogoFill" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stop-color="#2FAE69" stop-opacity="0"/>
              <stop offset="1" stop-color="#2FAE69" stop-opacity="0.32"/>
            </linearGradient>
          </defs>
          <circle cx="32" cy="32" r="26" stroke="currentColor" stroke-width="2.1" opacity="0.95"/>
          <circle cx="32" cy="32" r="21" stroke="currentColor" stroke-width="0.9" opacity="0.28"/>
          <g clip-path="url(#caLogoClip)">
            <path d="M8 47 L14 44 L19 46 L24 40 L29 42.5 L34 35 L39 37.5 L44 30 L50 26 L57 17 L57 57 L8 57 Z" fill="url(#caLogoFill)"/>
            <path d="M8 47 L14 44 L19 46 L24 40 L29 42.5 L34 35 L39 37.5 L44 30 L50 26 L57 17" stroke="#2FAE69" stroke-width="1.6" opacity="0.92" stroke-linejoin="round" stroke-linecap="round"/>
          </g>
          <g stroke="currentColor" stroke-width="1.7" stroke-linecap="round" opacity="0.5">
            <path d="M32 6.6v4.4"/><path d="M32 53v4.4"/><path d="M6.6 32h4.4"/><path d="M53 32h4.4"/>
          </g>
          <path d="M20.5 43.5 L45 19" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
          <path d="M45.4 18.6 L38.3 19.5 M45.4 18.6 L44.5 25.7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="32" cy="32" r="2.6" fill="currentColor"/>
          <circle cx="32" cy="32" r="5" stroke="currentColor" stroke-width="1.1" opacity="0.42"/>
        </svg>
      </div>
      <div>
        <div class="brand-name">Compound <span class="ascend">Ascend</span></div>
        <div class="brand-sub">Sistema Financiero</div>
      </div>
    </div>
    ${navHTML}
    <div class="sidebar-foot">
      <div class="user-row">
        <div class="avatar">EM</div>
        <div style="flex:1; min-width:0">
          <div class="user-name">Elena Marsh</div>
          <div class="user-mail">Hogar · 2 miembros</div>
        </div>
        <span class="chev" style="color:var(--muted-2)">${svg(I.chev, 1.8)}</span>
      </div>
    </div>`;

  const scrim = document.createElement("div");
  scrim.className = "sidebar-scrim";

  const topbar = document.createElement("div");
  topbar.className = "topbar";
  topbar.innerHTML = `
    <div class="crumbs" style="align-items:center; gap:14px">
      <button class="icon-btn hamburger" aria-label="Menú">${svg(I.menu)}</button>
      <div>
        <div class="crumbs" style="margin-bottom:3px">
          <span class="crumb-mut">${PAGE.crumb || "Resumen"}</span>
          <span class="crumb-sep">/</span>
          <span class="crumb-now">${PAGE.title}</span>
        </div>
        <div class="page-title">${PAGE.titleHTML || PAGE.title}</div>
      </div>
    </div>
    <div class="topbar-actions">
      <div class="search">
        ${svg(I.search)}
        <input placeholder="Buscar cuentas, inversiones…" />
        <span class="kbd">⌘K</span>
      </div>
      <button class="icon-btn" aria-label="Notificaciones">${svg(I.bell)}</button>
      <button class="icon-btn" aria-label="Ajustes">${svg(I.gear)}</button>
      <div class="theme-toggle" id="themeToggle" role="switch" aria-label="Cambiar tema">
        <span class="sun">${svg(I.sun, 2)}</span>
        <span class="moon">${svg(I.moon, 2)}</span>
      </div>
    </div>`;

  const app = document.querySelector(".app");
  const main = document.querySelector(".main");
  app.insertBefore(sidebar, app.firstChild);
  document.body.appendChild(scrim);
  main.insertBefore(topbar, main.firstChild);
  topbar.querySelector(".search svg").style.cssText = "width:14px;height:14px;color:var(--muted)";

  /* Theme */
  const root = document.documentElement;
  const stored = localStorage.getItem("ca-theme");
  if (stored) root.setAttribute("data-theme", stored);
  document.getElementById("themeToggle").addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("ca-theme", next);
  });

  /* Mobile drawer */
  const ham = topbar.querySelector(".hamburger");
  const openD = () => { sidebar.classList.add("open"); scrim.classList.add("open"); };
  const closeD = () => { sidebar.classList.remove("open"); scrim.classList.remove("open"); };
  ham.addEventListener("click", openD);
  scrim.addEventListener("click", closeD);

  /* ---------- Public App API: modal + toast + nav ---------- */
  const modalScrim = document.createElement("div");
  modalScrim.className = "modal-scrim";
  document.body.appendChild(modalScrim);
  modalScrim.addEventListener("click", (e) => { if (e.target === modalScrim) App.closeModal(); });

  const toastWrap = document.createElement("div");
  toastWrap.className = "toast-wrap";
  document.body.appendChild(toastWrap);

  const App = {
    openModal({ title, sub, body, footer, large } = {}) {
      modalScrim.innerHTML = `
        <div class="modal${large ? " lg" : ""}" role="dialog">
          <div class="modal-head">
            <div><div class="modal-title">${title || ""}</div>${sub ? `<div class="modal-sub">${sub}</div>` : ""}</div>
            <button class="modal-x" aria-label="Cerrar">${svg(I.x, 2)}</button>
          </div>
          <div class="modal-body">${body || ""}</div>
          ${footer ? `<div class="modal-foot">${footer}</div>` : ""}
        </div>`;
      modalScrim.querySelector(".modal-x").addEventListener("click", () => App.closeModal());
      requestAnimationFrame(() => modalScrim.classList.add("open"));
      return modalScrim;
    },
    closeModal() { modalScrim.classList.remove("open"); },
    toast(msg) {
      const t = document.createElement("div");
      t.className = "toast";
      t.innerHTML = `<span class="ic">${svg(I.check, 3)}</span>${msg}`;
      toastWrap.appendChild(t);
      requestAnimationFrame(() => t.classList.add("show"));
      setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 220); }, 2600);
    },
    setActiveNav(id) {
      sidebar.querySelectorAll(".nav-item").forEach(a => a.classList.toggle("active", a.dataset.nav === id));
    },
    closeDrawer: closeD,
    icon: (name, w) => svg(I[name], w)
  };
  window.App = App;

  sidebar.querySelectorAll(".nav-item").forEach(a => a.addEventListener("click", closeD));

  /* ---------- AI Coach ---------- */
  const cp = window.COACH || {};
  const greeting = cp.greeting || "Buenos días, Elena. Tus finanzas van <strong>por buen camino</strong> — tu patrimonio subió 3,4% este mes y vas adelantada en tres metas.";
  const insights = cp.insights || [
    { h: "Gasto bajo control", d: "Llevas el 68% del presupuesto de noviembre con 4 días restantes — cómodamente por debajo." },
    { h: "Efectivo inactivo", d: "Tienes $24k en la cuenta corriente al 0,1%. Mover $15k a tu reserva al 4,6% suma ~$690/año." },
  ];
  const chips = cp.chips || ["¿Cómo está mi salud financiera?", "¿Dónde puedo recortar gastos?", "¿Voy bien para jubilarme?", "Analizar un recibo"];

  const fab = document.createElement("button");
  fab.className = "coach-fab";
  fab.innerHTML = `<span class="spark">${svg(I.spark, 0)}</span> Pregúntale a Ascend AI`;

  const panel = document.createElement("div");
  panel.className = "coach-panel";
  panel.innerHTML = `
    <div class="coach-top">
      <span class="spark">${svg(I.spark, 0)}</span>
      <div>
        <div class="coach-title">Ascend AI</div>
        <div class="coach-status">Tu asesor financiero</div>
      </div>
      <button class="coach-x" aria-label="Cerrar">${svg(I.x, 2)}</button>
    </div>
    <div class="coach-body" id="coachBody">
      <div class="coach-msg">
        <span class="ava">${svg(I.spark, 0)}</span>
        <div class="coach-bubble">${greeting}</div>
      </div>
      <div class="coach-msg">
        <span class="ava">${svg(I.spark, 0)}</span>
        <div class="coach-bubble">
          ${insights.map(i => `<div class="coach-insight"><div class="h">${i.h}</div><div class="d">${i.d}</div></div>`).join("")}
        </div>
      </div>
    </div>
    <div class="coach-chips" id="coachChips">
      ${chips.map(c => `<button class="coach-chip">${c}</button>`).join("")}
    </div>
    <div class="coach-input">
      <input placeholder="Pregunta sobre tu dinero…" id="coachInput" />
      <button class="coach-send" aria-label="Enviar">${svg(I.send, 2)}</button>
    </div>`;

  document.body.appendChild(fab);
  document.body.appendChild(panel);
  fab.querySelector(".spark svg").setAttribute("fill", "currentColor");
  fab.querySelector(".spark svg").setAttribute("stroke", "none");
  panel.querySelectorAll(".spark svg, .ava svg").forEach(s => { s.setAttribute("fill","currentColor"); s.setAttribute("stroke","none"); });

  const openC = () => { panel.classList.add("open"); fab.classList.add("hide"); };
  const closeC = () => { panel.classList.remove("open"); fab.classList.remove("hide"); };
  fab.addEventListener("click", openC);
  panel.querySelector(".coach-x").addEventListener("click", closeC);

  const body = panel.querySelector("#coachBody");
  const addMsg = (html, me) => {
    const m = document.createElement("div");
    m.className = "coach-msg" + (me ? " me" : "");
    m.innerHTML = me ? `<div class="coach-bubble">${html}</div>` : `<span class="ava">${svg(I.spark,0)}</span><div class="coach-bubble">${html}</div>`;
    body.appendChild(m);
    if (!me) { const s = m.querySelector(".ava svg"); s.setAttribute("fill","currentColor"); s.setAttribute("stroke","none"); }
    body.scrollTop = body.scrollHeight;
  };
  const reply = (q) => {
    const c = {
      health: "Tu <strong>Puntuación de Salud Financiera es 82/100 — Sólida</strong>. Tu tasa de ahorro (38%) y protección (5 de 7) la impulsan; tu tarjeta al 21% es el mayor lastre. Liquídala y llegarías a ~88.",
      cut: "Tres recortes sencillos: <strong>$84/mes</strong> en suscripciones solapadas, <strong>$110/mes</strong> en restaurantes sobre tu media, y mover el efectivo inactivo a una reserva al 4,6%. Unos <strong>$2.300/año</strong> redirigidos a metas.",
      retire: "Con tu tasa de ahorro del 38% y un retorno del 6,5%, vas <strong>adelantada</strong> — proyectas alcanzar tu meta de $1,8M hacia los 58 años, dos antes.",
      receipt: "Claro — abre la cámara o suelta una imagen y la desgloso, clasifico cada línea y la archivo en el sobre de presupuesto correcto.",
      default: "Buena pregunta. Según tus cuentas, priorizaría redirigir el efectivo inactivo y liquidar la tarjeta de alto interés primero — ¿te preparo un plan?"
    };
    const t = q.toLowerCase();
    if (t.includes("salud")) return c.health;
    if (t.includes("recort") || t.includes("gast")) return c.cut;
    if (t.includes("jubil") || t.includes("camino")) return c.retire;
    if (t.includes("recibo")) return c.receipt;
    return c.default;
  };
  const send = (q) => { if (!q.trim()) return; addMsg(q, true); setTimeout(() => addMsg(reply(q), false), 420); };
  panel.querySelectorAll(".coach-chip").forEach(c => c.addEventListener("click", () => send(c.textContent)));
  const input = panel.querySelector("#coachInput");
  panel.querySelector(".coach-send").addEventListener("click", () => { send(input.value); input.value = ""; });
  input.addEventListener("keydown", e => { if (e.key === "Enter") { send(input.value); input.value = ""; } });

  document.addEventListener("keydown", e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); const s = topbar.querySelector(".search input"); if (s) s.focus(); }
    if (e.key === "Escape") { App.closeModal(); closeC(); }
  });
})();
