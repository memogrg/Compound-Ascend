import Link from "next/link";
import { LandingFx } from "@/components/marketing/landing-fx";
import "./landing.css";

/** Isotipo "C+" de la landing (autocontenido; no depende del shell del app). */
function LpMark() {
  return (
    <div className="mk" aria-hidden="true">
      <svg viewBox="0 0 64 64" fill="none">
        <path
          d="M45 18.5 A 19 19 0 1 0 45 45.5"
          stroke="var(--canvas)"
          strokeWidth="7"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M46 26 V38 M40 32 H52"
          stroke="var(--accent)"
          strokeWidth="4.6"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function SparkSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3 13.6 8.5 19 10l-5.4 1.5L12 17l-1.6-5.5L5 10l5.4-1.5L12 3Z" />
    </svg>
  );
}

function StrokeSvg({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Landing pública de CARTERA+ (port fiel de "Landing CARTERA.html" del handoff v2). */
export function Landing() {
  return (
    <div className="lp">
      <LandingFx />

      <header id="lp-hdr">
        <div className="wrap hd">
          <div className="lp-brand">
            <LpMark />
            <div className="nm">
              CARTERA<span className="p">+</span>
            </div>
          </div>
          <Link href="/login" className="btn btn-ghost">
            Iniciar sesión
          </Link>
        </div>
      </header>

      {/* ===== HERO ===== */}
      <section className="hero">
        <div className="wrap hero-in">
          <div className="reveal in" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <span className="h-eyebrow">
              <span className="dot" />
              Tu asesor financiero con IA
            </span>
            <h1>
              Tu dinero,
              <br />
              <span className="g">con dirección.</span>
            </h1>
            <p className="lp-sub">
              CARTERA+ es tu asesor financiero con IA. Ordena tu dinero, elimina tus deudas, haz
              crecer tu patrimonio y protege lo que ya lograste — un paso a la vez.
            </p>
            <div className="cta-row">
              <Link href="/signup" className="btn btn-pri btn-lg btn-block">
                Empezar gratis
              </Link>
              <Link href="/login" className="btn btn-ghost btn-lg btn-block">
                Ya tengo cuenta
              </Link>
            </div>
            <div className="trust">
              <StrokeSvg>
                <path d="M12 2 4 6v6c0 5 3.4 9 8 10 4.6-1 8-5 8-10V6l-8-4Z" />
                <path d="m9 12 2 2 4-4" />
              </StrokeSvg>
              Gratis para empezar · Sin tarjeta · Tus datos son solo tuyos.
            </div>
          </div>

          {/* mockup de teléfono (CSS + SVG, sin imágenes) */}
          <div className="phone-wrap reveal in">
            <div className="phone">
              <div className="notch" />
              <div className="phone-scr">
                <div className="mini-top">
                  <span className="l">Centro de mando</span>
                  <span className="cur">₡ CRC</span>
                </div>
                <div className="ring-card">
                  <div className="ring">
                    <svg width="82" height="82" viewBox="0 0 42 42" aria-hidden="true">
                      <circle
                        cx="21"
                        cy="21"
                        r="15.9"
                        fill="none"
                        stroke="var(--border)"
                        strokeWidth="4"
                      />
                      <circle
                        cx="21"
                        cy="21"
                        r="15.9"
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeDasharray="78 100"
                        strokeDashoffset="25"
                        transform="rotate(-90 21 21)"
                      />
                    </svg>
                    <div className="cc">
                      <div className="n">78</div>
                      <div className="t">Salud</div>
                    </div>
                  </div>
                  <div className="rc-r">
                    <div className="lb">Patrimonio neto</div>
                    <div className="nw">₡18,450,200</div>
                    <div className="dl">▲ 4.2% este mes</div>
                  </div>
                </div>
                <div className="mini-bars">
                  <div className="mb">
                    <span className="k">Ahorro</span>
                    <div className="tr">
                      <div className="fl" style={{ width: "64%", background: "var(--s1)" }} />
                    </div>
                    <span className="v">64%</span>
                  </div>
                  <div className="mb">
                    <span className="k">Deuda</span>
                    <div className="tr">
                      <div className="fl" style={{ width: "28%", background: "var(--s3)" }} />
                    </div>
                    <span className="v">28%</span>
                  </div>
                  <div className="mb">
                    <span className="k">Inversión</span>
                    <div className="tr">
                      <div className="fl" style={{ width: "52%", background: "var(--s2)" }} />
                    </div>
                    <span className="v">52%</span>
                  </div>
                </div>
                <div className="mini-fab">
                  <span className="sp">
                    <SparkSvg />
                  </span>
                  Pregúntale a My Agent C+
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== MANIFESTO ===== */}
      <div className="band band-manifesto">
        <div className="wrap reveal">
          <p>
            No buscamos perfección contable, buscamos <span className="em">dirección</span>. Si tu
            patrimonio sube y tus decisiones mejoran, estás ganando.
          </p>
        </div>
      </div>

      {/* ===== ESCALERA ===== */}
      <section className="sec" id="como-funciona">
        <div className="wrap">
          <div className="sec-head reveal">
            <span className="overline">La escalera financiera</span>
            <h2>Tres movimientos que cambian tu vida financiera.</h2>
          </div>
          <div className="ladder">
            <div className="step reveal">
              <span className="num">01</span>
              <div className="ic" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                <StrokeSvg>
                  <path d="M3 7h18M6 7v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7M9 7V5a3 3 0 0 1 6 0v2" />
                </StrokeSvg>
              </div>
              <div>
                <h3>Ordena</h3>
                <p>
                  Toma el control de tus ingresos, gastos y deudas. Claridad total de a dónde va
                  cada colón.
                </p>
              </div>
            </div>
            <div className="step reveal">
              <span className="num">02</span>
              <div
                className="ic"
                style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
              >
                <StrokeSvg>
                  <path d="M3 17l6-6 4 4 8-9" />
                  <path d="M14 6h6v6" />
                </StrokeSvg>
              </div>
              <div>
                <h3>Haz crecer</h3>
                <p>Convierte tus ahorros en patrimonio. Invierte con un plan, no con miedo.</p>
              </div>
            </div>
            <div className="step reveal">
              <span className="num">03</span>
              <div
                className="ic"
                style={{
                  background: "color-mix(in srgb, var(--s4) 18%, transparent)",
                  color: "var(--s4)",
                }}
              >
                <StrokeSvg>
                  <path d="M12 2 4 6v6c0 5 3.4 9 8 10 4.6-1 8-5 8-10V6l-8-4Z" />
                </StrokeSvg>
              </div>
              <div>
                <h3>Protege</h3>
                <p>Blinda lo que ya lograste para que un imprevisto no borre años de avance.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== QUÉ HACE POR TI (bento) ===== */}
      <div className="band">
        <section className="sec" style={{ border: 0 }}>
          <div className="wrap">
            <div className="sec-head reveal">
              <span className="overline">Qué hace por ti</span>
              <h2>Todo tu dinero, en un solo lugar inteligente.</h2>
            </div>
            <div className="bento">
              <div className="feat wide reveal">
                <div
                  className="ic"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                >
                  <StrokeSvg>
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <path d="M3 10h18M8 15h5" />
                  </StrokeSvg>
                </div>
                <h3>Base financiera clara</h3>
                <p>Presupuesto por &quot;frascos y sobres&quot;, ingresos y gastos siempre al día.</p>
              </div>
              <div className="feat reveal">
                <div
                  className="ic"
                  style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
                >
                  <StrokeSvg>
                    <path d="M3 12c0-4 3.5-7 9-7s9 3 9 7-3.5 7-9 7c-1.5 0-3-.2-4.3-.6L3 20l1.3-3.5C3.5 15.2 3 13.7 3 12Z" />
                    <path d="M9 12h6" />
                  </StrokeSvg>
                </div>
                <h3>Sal de deudas más rápido</h3>
                <p>Estrategia avalancha o bola de nieve y cuánto te ahorras pagando de más.</p>
              </div>
              <div className="feat reveal">
                <div
                  className="ic"
                  style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
                >
                  <StrokeSvg>
                    <path d="M3 17l6-6 4 4 8-9" />
                    <path d="M14 6h6v6" />
                  </StrokeSvg>
                </div>
                <h3>Invierte con cabeza</h3>
                <p>Portafolio, precios en vivo y calculadora de interés compuesto.</p>
              </div>
              <div className="feat reveal">
                <div
                  className="ic"
                  style={{
                    background: "color-mix(in srgb, var(--s4) 18%, transparent)",
                    color: "var(--s4)",
                  }}
                >
                  <StrokeSvg>
                    <path d="M12 3v18M6 8c0-1.7 1.5-3 4-3h4c2.2 0 4 1.3 4 3s-1.8 3-4 3h-4c-2.2 0-4 1.3-4 3s1.8 3 4 3h4c2.5 0 4-1.3 4-3" />
                  </StrokeSvg>
                </div>
                <h3>Patrimonio y libertad</h3>
                <p>Tu patrimonio neto y qué tan cerca estás de la libertad financiera.</p>
              </div>
              <div className="feat wide reveal">
                <div
                  className="ic"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                >
                  <StrokeSvg>
                    <path d="M12 2 4 6v6c0 5 3.4 9 8 10 4.6-1 8-5 8-10V6l-8-4Z" />
                    <path d="M9 12l2 2 4-4" />
                  </StrokeSvg>
                </div>
                <h3>Protección patrimonial</h3>
                <p>Detecta tus brechas de seguros antes de que sea tarde.</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ===== MY AGENT C+ ===== */}
      <section className="sec">
        <div className="wrap">
          <div className="agent reveal">
            <div className="agent-copy">
              <span className="spark-badge">
                <span className="sp">
                  <SparkSvg />
                </span>
                My Agent C+
              </span>
              <h2>My Agent C+: tu asesor financiero, 24/7.</h2>
              <p>
                Pregúntale lo que sea sobre tu dinero, registra gastos con una foto de tu recibo y
                recibe tu próxima mejor decisión cada mes. Nunca ejecuta nada sin tu permiso.
              </p>
            </div>
            <div className="chat">
              <div className="cm me">
                <div className="bub">¿Cómo está mi salud financiera?</div>
              </div>
              <div className="cm">
                <span className="av">
                  <SparkSvg />
                </span>
                <div className="bub">
                  Vas <b>bien encaminado</b>: tu salud financiera es <b>78/100</b>. Tu ahorro sube y
                  tu deuda baja. El único punto a cuidar es tu tarjeta al 24% — si le abonas ₡45,000
                  extra, la liquidas 8 meses antes. ¿Quieres que te arme el plan?
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== MÁS QUE DINERO ===== */}
      <div className="band">
        <section className="sec" style={{ border: 0 }}>
          <div className="wrap">
            <div className="sec-head reveal" style={{ maxWidth: 680 }}>
              <span className="overline">Más que dinero</span>
              <h2>Esto no es solo dinero. Es la vida que quieres construir.</h2>
              <p>
                Cada decisión ordenada hoy es una versión más libre de ti mañana. CARTERA+ te
                acompaña a cambiar hábitos, ganar calma y avanzar hacia tus metas — sin culpa, a tu
                ritmo, con un plan que se siente tuyo.
              </p>
            </div>
            <div className="dev-cards">
              <div className="devc reveal">
                <div className="ic">
                  <StrokeSvg>
                    <path d="M12 21s-7-4.5-9.5-9C1 9 2.5 5.5 6 5.5c2 0 3.2 1.2 4 2.3.8-1.1 2-2.3 4-2.3 3.5 0 5 3.5 3.5 6.5C19 16.5 12 21 12 21Z" />
                  </StrokeSvg>
                </div>
                <h3>Menos ansiedad financiera.</h3>
              </div>
              <div className="devc reveal">
                <div className="ic">
                  <StrokeSvg>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </StrokeSvg>
                </div>
                <h3>Más control cada mes.</h3>
              </div>
              <div className="devc reveal">
                <div className="ic">
                  <StrokeSvg>
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </StrokeSvg>
                </div>
                <h3>Un futuro que sí puedes ver.</h3>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ===== PRIVACIDAD ===== */}
      <section className="sec">
        <div className="wrap">
          <div className="privacy reveal">
            <div className="ic">
              <StrokeSvg>
                <path d="M12 2 4 6v6c0 5 3.4 9 8 10 4.6-1 8-5 8-10V6l-8-4Z" />
                <path d="M9 12l2 2 4-4" />
              </StrokeSvg>
            </div>
            <p>
              Tus datos financieros están protegidos y solo tú puedes acceder a ellos. Nada se
              comparte ni se ejecuta sin tu confirmación.
            </p>
          </div>
        </div>
      </section>

      {/* ===== CTA FINAL ===== */}
      <div className="final">
        <div className="wrap final-in reveal">
          <h2>Empieza hoy tu ascenso financiero.</h2>
          <div className="cta-row">
            <Link href="/signup" className="btn btn-pri btn-lg btn-block">
              Crear mi cuenta gratis
            </Link>
            <a href="#como-funciona" className="lnk">
              o explora cómo funciona
            </a>
          </div>
        </div>
      </div>

      {/* ===== FOOTER ===== */}
      <footer>
        <div className="wrap ft">
          <div className="lp-brand">
            <LpMark />
            <div className="nm">
              CARTERA<span className="p">+</span>
            </div>
          </div>
          <div className="ft-links">
            <Link href="/login">Iniciar sesión</Link>
          </div>
          <div className="ft-meta">
            Hecho para Costa Rica y Latinoamérica · © {new Date().getFullYear()}
          </div>
        </div>
      </footer>
    </div>
  );
}
