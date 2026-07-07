/* Compound Ascend — Landing interactions */
(function () {
  const root = document.documentElement;

  /* Theme */
  const stored = localStorage.getItem("ca-theme");
  if (stored) root.setAttribute("data-theme", stored);
  function toggleTheme() {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("ca-theme", next);
  }
  document.querySelectorAll("[data-theme-toggle]").forEach(b => b.addEventListener("click", toggleTheme));

  /* Navbar scrolled state */
  const nav = document.querySelector(".nav");
  const onScroll = () => { if (nav) nav.classList.toggle("scrolled", window.scrollY > 8); };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* Mobile menu */
  const mmenu = document.getElementById("mmenu");
  document.querySelectorAll("[data-menu-open]").forEach(b => b.addEventListener("click", () => mmenu.classList.add("open")));
  document.querySelectorAll("[data-menu-close]").forEach(b => b.addEventListener("click", () => mmenu.classList.remove("open")));
  if (mmenu) mmenu.querySelectorAll("a").forEach(a => a.addEventListener("click", () => mmenu.classList.remove("open")));

  /* Smooth-scroll for in-page anchors */
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener("click", e => {
      const id = a.getAttribute("href");
      if (id.length < 2) return;
      const el = document.querySelector(id);
      if (el) { e.preventDefault(); window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 72, behavior: "smooth" }); }
    });
  });

  /* Reveal on scroll — resilient (works even where IntersectionObserver is flaky) */
  function revealCheck() {
    const h = window.innerHeight || document.documentElement.clientHeight;
    document.querySelectorAll(".reveal-up:not(.in)").forEach(el => {
      if (el.getBoundingClientRect().top < h * 0.92) el.classList.add("in");
    });
  }
  revealCheck();
  window.addEventListener("scroll", revealCheck, { passive: true });
  window.addEventListener("resize", revealCheck, { passive: true });
  window.addEventListener("load", () => { revealCheck(); requestAnimationFrame(revealCheck); });
  requestAnimationFrame(revealCheck);

  /* Pricing toggle */
  const bswitch = document.getElementById("bswitch");
  let annual = true;
  function renderPrices() {
    document.querySelectorAll("[data-m]").forEach(el => {
      el.textContent = annual ? el.dataset.a : el.dataset.m;
    });
    document.querySelectorAll("[data-per]").forEach(el => { el.textContent = annual ? "/año" : "/mes"; });
    document.querySelectorAll("[data-alt]").forEach(el => { el.style.display = annual ? "" : "none"; });
    const o1 = document.getElementById("optM"), o2 = document.getElementById("optA");
    if (o1 && o2) { o1.classList.toggle("on", !annual); o2.classList.toggle("on", annual); }
    if (bswitch) bswitch.classList.toggle("annual", annual);
  }
  if (bswitch) bswitch.addEventListener("click", () => { annual = !annual; renderPrices(); });
  renderPrices();

  /* Problem: tidy scatter on view */
  const scatter = document.getElementById("scatter");
  if (scatter) {
    const io2 = new IntersectionObserver(es => {
      es.forEach(e => { if (e.isIntersecting) { setTimeout(() => scatter.classList.add("tidy"), 350); io2.unobserve(e.target); } });
    }, { threshold: 0.4 });
    io2.observe(scatter);
  }

  /* Ascend AI chat chips */
  const chatBody = document.getElementById("chatBody");
  const replies = {
    invertir: "Con <strong>$100 al mes</strong> al 8% anual durante 10 años acumularías ≈ <strong>$18.300</strong> — de los cuales $6.300 son interés compuesto que trabajó por ti.",
    deuda: "Empieza por la de <strong>mayor tasa</strong> (tu tarjeta al 21,5%). Cada ₡1.000 ahí rinde más que en cualquier otra. Mantén los mínimos en las demás.",
    flujo: "Detecté <strong>₡38.000</strong> en suscripciones solapadas y delivery sobre tu promedio. Reasignarlos mejora tu flujo de este mes sin tocar tus metas."
  };
  function addMsg(html, me) {
    if (!chatBody) return;
    const m = document.createElement("div");
    m.className = "chat-msg " + (me ? "me" : "ai");
    m.innerHTML = me ? `<div class="chat-bub">${html}</div>`
      : `<span class="av"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 13.6 8.5 19 10l-5.4 1.5L12 17l-1.6-5.5L5 10l5.4-1.5L12 3Z"/></svg></span><div class="chat-bub">${html}</div>`;
    chatBody.appendChild(m);
    chatBody.scrollTop = chatBody.scrollHeight;
  }
  document.querySelectorAll(".chat-chip").forEach(c => c.addEventListener("click", () => {
    addMsg(c.textContent, true);
    const key = c.dataset.k;
    setTimeout(() => addMsg(replies[key] || "Déjame analizar tus números y te propongo un plan concreto en segundos.", false), 480);
  }));

  /* Animate compound vision chart line draw when in view */
  const vline = document.getElementById("visionLine");
  if (vline) {
    try {
      const len = vline.getTotalLength();
      vline.style.strokeDasharray = len;
      vline.style.strokeDashoffset = len;
      const io3 = new IntersectionObserver(es => {
        es.forEach(e => {
          if (e.isIntersecting) {
            vline.style.transition = "stroke-dashoffset 1.8s cubic-bezier(.3,.6,.2,1)";
            requestAnimationFrame(() => { vline.style.strokeDashoffset = "0"; });
            io3.unobserve(e.target);
          }
        });
      }, { threshold: 0.3 });
      io3.observe(vline);
    } catch (e) {}
  }

  /* Contact form (no <form>) */
  const send = document.getElementById("contactSend");
  if (send) send.addEventListener("click", () => {
    send.textContent = "¡Mensaje enviado!";
    send.disabled = true;
    setTimeout(() => { send.innerHTML = 'Hablar con AI Tech Umbrella'; send.disabled = false; }, 2600);
  });
})();
