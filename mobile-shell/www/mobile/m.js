/* ============================================================
   COMPOUND ASCEND — Mobile shell (iPhone)
   Injects: header, bottom tab bar, "Más" sheet, theme, coach.
   Provides window.App { openModal, closeModal, toast }.
   Each page sets window.PAGE = { id, title, crumb, titleHTML } first.
   ============================================================ */
(function () {
  const PAGE = window.PAGE || { id: "dashboard", title: "Panel", crumb: "Resumen" };

  const I = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    budget: '<path d="M3 7h18M6 7v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7M9 7V5a3 3 0 0 1 6 0v2"/>',
    invest: '<path d="M3 17l5-5 4 4 8-9"/><path d="M14 7h6v6"/>',
    networth: '<path d="M12 3v18M5 8c0-1.7 1.5-3 4-3h6c2.5 0 4 1.3 4 3s-1.5 3-4 3H9c-2.5 0-4 1.3-4 3s1.5 3 4 3h6c2.5 0 4-1.3 4-3"/>',
    debt: '<path d="M3 12c0-4 3.5-7 9-7s9 3 9 7-3.5 7-9 7c-1.6 0-3.1-.2-4.4-.7L3 20l1.4-3.6C3.5 15.2 3 13.7 3 12Z"/><path d="M9 12h6"/>',
    defense: '<path d="M12 2 4 6v6c0 5 3.4 9 8 10 4.6-1 8-5 8-10V6l-8-4Z"/><path d="m9 12 2 2 4-4"/>',
    txn: '<path d="M4 7h13M4 7l3-3M4 7l3 3M20 17H7M20 17l-3-3M20 17l-3 3"/>',
    more: '<circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
    spark: '<path d="M12 3 13.6 8.5 19 10l-5.4 1.5L12 17l-1.6-5.5L5 10l5.4-1.5L12 3Z"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/>',
    check: '<path d="m5 12 5 5 9-11"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    savings: '<path d="M19 7c0-1.7-3.1-3-7-3S5 5.3 5 7m14 0v10c0 1.7-3.1 3-7 3s-7-1.3-7-3V7m14 0c0 1.7-3.1 3-7 3S5 8.7 5 7"/>',
    portfolio: '<path d="M4 7h16v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7Z"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M4 12h16"/>'
  };
  const svg = (p, w) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w||1.8}" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

  const LOGO = `<svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <defs><clipPath id="mLogoClip"><circle cx="32" cy="32" r="20.5"/></clipPath>
    <linearGradient id="mLogoFill" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#2FAE69" stop-opacity="0"/><stop offset="1" stop-color="#2FAE69" stop-opacity="0.32"/></linearGradient></defs>
    <circle cx="32" cy="32" r="26" stroke="currentColor" stroke-width="2.1" opacity="0.95"/>
    <circle cx="32" cy="32" r="21" stroke="currentColor" stroke-width="0.9" opacity="0.28"/>
    <g clip-path="url(#mLogoClip)">
      <path d="M8 47 L14 44 L19 46 L24 40 L29 42.5 L34 35 L39 37.5 L44 30 L50 26 L57 17 L57 57 L8 57 Z" fill="url(#mLogoFill)"/>
      <path d="M8 47 L14 44 L19 46 L24 40 L29 42.5 L34 35 L39 37.5 L44 30 L50 26 L57 17" stroke="#2FAE69" stroke-width="1.6" opacity="0.92" stroke-linejoin="round" stroke-linecap="round"/>
    </g>
    <g stroke="currentColor" stroke-width="1.7" stroke-linecap="round" opacity="0.5"><path d="M32 6.6v4.4"/><path d="M32 53v4.4"/><path d="M6.6 32h4.4"/><path d="M53 32h4.4"/></g>
    <path d="M20.5 43.5 L45 19" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <path d="M45.4 18.6 L38.3 19.5 M45.4 18.6 L44.5 25.7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="32" cy="32" r="2.6" fill="currentColor"/></svg>`;

  /* ---------- Header ---------- */
  const head = document.createElement("header");
  head.className = "m-head";
  head.innerHTML = `
    <div class="m-brand">${LOGO}</div>
    <div class="m-head-titles">
      <div class="m-crumb">${PAGE.crumb || "Resumen"}</div>
      <div class="m-title">${PAGE.titleHTML || PAGE.title}</div>
    </div>
    <button class="m-theme" id="mTheme" aria-label="Cambiar tema">
      <span class="sun">${svg(I.sun, 2)}</span><span class="moon">${svg(I.moon, 2)}</span>
    </button>`;
  const app = document.querySelector(".m-app");
  app.insertBefore(head, app.firstChild);

  /* ---------- Theme ---------- */
  const root = document.documentElement;
  const stored = localStorage.getItem("ca-theme");
  if (stored) root.setAttribute("data-theme", stored);
  document.getElementById("mTheme").addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("ca-theme", next);
  });

  /* ---------- Bottom tab bar ---------- */
  const TABS = [
    { id: "dashboard", name: "Panel", icon: "dashboard", href: "Dashboard.html" },
    { id: "budget", name: "Presupuesto", icon: "budget", href: "Budget.html" },
    { id: "invest", name: "Inversiones", icon: "invest", href: "Investments.html" },
    { id: "networth", name: "Patrimonio", icon: "networth", href: "Networth.html" },
  ];
  const MORE_IDS = ["debts","defense","savings","portfolio","transactions"];
  const moreActive = MORE_IDS.includes(PAGE.id);
  const bar = document.createElement("nav");
  bar.className = "m-tabbar";
  bar.innerHTML = TABS.map(t => `
    <a href="${t.href}" class="${t.id === PAGE.id ? "on" : ""}">
      <span class="ico">${svg(I[t.icon])}</span>${t.name}
    </a>`).join("") + `
    <button id="mMoreBtn" class="${moreActive ? "on" : ""}">
      <span class="ico">${svg(I.more, 0).replace('fill="none" stroke="currentColor"','fill="currentColor" stroke="none"')}</span>Más
    </button>`;
  document.body.appendChild(bar);

  /* ---------- Más sheet ---------- */
  const scrim = document.createElement("div");
  scrim.className = "m-sheet-scrim";
  const sheet = document.createElement("div");
  sheet.className = "m-sheet";
  sheet.innerHTML = `
    <div class="grab"></div>
    <div class="m-sheet-title">Más secciones</div>
    <a href="Debts.html"><span class="si">${svg(I.debt)}</span>Deudas y Préstamos<span class="chev">${svg(I.chev,2)}</span></a>
    <a href="Defense.html"><span class="si">${svg(I.defense)}</span>Defensa Patrimonial<span class="chev">${svg(I.chev,2)}</span></a>
    <a href="Budget.html#transactions"><span class="si">${svg(I.txn)}</span>Transacciones<span class="chev">${svg(I.chev,2)}</span></a>
    <a href="Networth.html#savings"><span class="si">${svg(I.savings)}</span>Ahorros y Emergencia<span class="chev">${svg(I.chev,2)}</span></a>
    <a href="Investments.html#portfolio"><span class="si">${svg(I.portfolio)}</span>Cartera<span class="chev">${svg(I.chev,2)}</span></a>`;
  document.body.appendChild(scrim);
  document.body.appendChild(sheet);
  const openSheet = () => { sheet.classList.add("open"); scrim.classList.add("open"); };
  const closeSheet = () => { sheet.classList.remove("open"); scrim.classList.remove("open"); };
  document.getElementById("mMoreBtn").addEventListener("click", openSheet);
  scrim.addEventListener("click", closeSheet);

  /* ---------- App API: modal + toast ---------- */
  const modalScrim = document.createElement("div");
  modalScrim.className = "modal-scrim";
  document.body.appendChild(modalScrim);
  modalScrim.addEventListener("click", e => { if (e.target === modalScrim) App.closeModal(); });
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
      setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 220); }, 2400);
    }
  };
  window.App = App;

  /* ---------- AI Coach ---------- */
  const cp = window.COACH || {};
  const greeting = cp.greeting || "Buenos días, Elena. Tus finanzas van <strong>por buen camino</strong> — tu patrimonio subió 3,4% este mes.";
  const chips = cp.chips || ["¿Cómo está mi salud financiera?", "¿Dónde puedo recortar gastos?", "¿Voy bien para jubilarme?"];

  const fab = document.createElement("button");
  fab.className = "coach-fab";
  fab.innerHTML = `<span class="spark">${svg(I.spark, 0)}</span> Ascend AI`;
  const panel = document.createElement("div");
  panel.className = "coach-panel";
  panel.innerHTML = `
    <div class="coach-top">
      <span class="spark">${svg(I.spark, 0)}</span>
      <div><div class="coach-title">Ascend AI</div><div class="coach-status">Tu asesor financiero</div></div>
      <button class="coach-x" aria-label="Cerrar">${svg(I.x, 2)}</button>
    </div>
    <div class="coach-body" id="coachBody">
      <div class="coach-msg"><span class="ava">${svg(I.spark, 0)}</span><div class="coach-bubble">${greeting}</div></div>
    </div>
    <div class="coach-chips">${chips.map(c => `<button class="coach-chip">${c}</button>`).join("")}</div>
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
  const reply = q => {
    const c = {
      health: "Tu <strong>Puntuación de Salud Financiera es 82/100 — Sólida</strong>. Liquidar la tarjeta al 21% te llevaría a ~88.",
      cut: "Tres recortes sencillos: <strong>$84/mes</strong> en suscripciones, <strong>$110/mes</strong> en restaurantes y mover efectivo inactivo al 4,6%. Unos <strong>$2.300/año</strong>.",
      retire: "Con tu tasa de ahorro del 38%, vas <strong>adelantada</strong> — proyectas tu meta de $1,8M hacia los 58 años.",
      default: "Buena pregunta. Priorizaría liquidar la tarjeta de alto interés y redirigir el efectivo inactivo — ¿te preparo un plan?"
    };
    const t = q.toLowerCase();
    if (t.includes("salud")) return c.health;
    if (t.includes("recort") || t.includes("gast")) return c.cut;
    if (t.includes("jubil")) return c.retire;
    return c.default;
  };
  const send = q => { if (!q.trim()) return; addMsg(q, true); setTimeout(() => addMsg(reply(q), false), 400); };
  panel.querySelectorAll(".coach-chip").forEach(c => c.addEventListener("click", () => send(c.textContent)));
  const input = panel.querySelector("#coachInput");
  panel.querySelector(".coach-send").addEventListener("click", () => { send(input.value); input.value = ""; });
  input.addEventListener("keydown", e => { if (e.key === "Enter") { send(input.value); input.value = ""; } });

  document.addEventListener("keydown", e => { if (e.key === "Escape") { App.closeModal(); closeC(); closeSheet(); } });
})();
