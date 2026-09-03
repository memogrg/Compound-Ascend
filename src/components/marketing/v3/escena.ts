// @ts-nocheck
/**
 * Escena 3D del teléfono del hero, portada del prototipo.
 *
 * Va con `@ts-nocheck` a propósito: son 700 líneas de JavaScript de escena
 * escritas contra la API de three, sin tipos. Tiparlas a mano introduciría más
 * riesgo del que quita —cada aserción es una oportunidad de equivocarse en algo
 * que ya está verificado corriendo— y no hay lógica de negocio acá: si algo se
 * rompe, se ve en pantalla al instante. El resto del port sí pasa por el
 * compilador.
 *
 * Diferencias con el prototipo, todas de la misma familia: three cambió el
 * manejo de color en r152. `outputEncoding`/`texture.encoding` con
 * `sRGBEncoding` pasaron a `outputColorSpace`/`texture.colorSpace` con
 * `SRGBColorSpace`. Sin esto la escena se ve lavada.
 */
import * as THREE from "three";

export function montarTelefono(op) {
  op = op || {};
  const stage = op.stage,
    cv = op.canvas;
  const TEMA = op.tema || "claro"; // 'claro' | 'oscuro'
  const TELON = op.telon !== false; // telón de papel dentro de la escena
  const DIST = op.distancia || 13.8; // distancia de la cámara
  const capL = { textContent: "" },
    capFps = { textContent: "" },
    diag = { textContent: "" };
  function bail(w) {
    stage.setAttribute("data-mode", "static");
    cv.style.display = "none";
    if (op.alFallar) op.alFallar(w);
  }

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mem = navigator.deviceMemory;
  if (typeof THREE === "undefined") return bail("three.js no cargó");
  if (!document.createElement("canvas").getContext("webgl2"))
    return bail("sin WebGL2 → imagen estática");
  if (mem !== undefined && mem < 4) return bail("deviceMemory " + mem + "GB → imagen estática");

  /* ── medidas y ciclo: los del componente de producción ── */
  const W = 3.04,
    H = 6.3,
    T = 0.36,
    R = 0.54,
    BEV = 0.085;
  /* El teléfono YA NO DA LA VUELTA. Oscila alrededor de un tres cuartos suave y la pantalla
   nunca deja de verse: el rango vive entre −29° y +9°, así que el frente siempre mira a la
   cámara y el canto izquierdo se asoma lo justo para que el aparato se lea como un volumen
   y no como una foto pegada.

   Son dos senos de períodos que no encajan (13 s y 8,3 s) en vez de una lista de hitos: el
   movimiento no se repite a ojo, no tiene arranques ni frenadas visibles, y no hay un
   instante en que el aparato «llegue» a ningún lado. Un objeto sostenido en la mano se
   mueve así; una animación con hitos se nota. */
  const CENTRO = -10,
    AMP_1 = 15,
    AMP_2 = 7,
    PER_1 = 13,
    PER_2 = 8.3;
  const FLOTE_SEG = 6.5,
    ANGULO_QUIETO = -18;
  function anguloEn(t) {
    return (
      CENTRO +
      AMP_1 * Math.sin((t * Math.PI * 2) / PER_1) +
      AMP_2 * Math.sin((t * Math.PI * 2) / PER_2 + 1.1)
    );
  }
  /* El cabeceo también respira, muy poco: sin esto el vaivén se lee como un giro de tocadiscos. */
  function cabeceoEn(t) {
    return 4.5 + 2.2 * Math.sin((t * Math.PI * 2) / 10.5 + 0.6);
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: cv,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
  } catch (e) {
    return bail("no se pudo crear el contexto WebGL");
  }
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(DPR);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  camera.position.set(0, 0.15, DIST);

  /* Entorno de estudio. El componente usa RoomEnvironment (un addon que no viene
   en el build UMD), así que acá va un equirectangular procedural con la misma
   idea: claro arriba, oscuro abajo y dos cajas de luz que dibujan el filo. */
  (function () {
    const e = document.createElement("canvas");
    e.width = 256;
    e.height = 128;
    const c = e.getContext("2d");
    const g = c.createLinearGradient(0, 0, 0, 128);
    if (TEMA === "oscuro") {
      /* Estudio nocturno: la luz baja de arriba y el suelo casi no devuelve nada,
       así el aluminio dibuja un filo brillante contra el fondo oscuro. */
      g.addColorStop(0, "#cfd8d2");
      g.addColorStop(0.38, "#4a5a52");
      g.addColorStop(0.7, "#14201b");
      g.addColorStop(1, "#070d0a");
    } else {
      g.addColorStop(0, "#e9e6dd");
      g.addColorStop(0.42, "#8e8a80");
      g.addColorStop(0.72, "#3b3934");
      g.addColorStop(1, "#1d1c18");
    }
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 128);
    c.fillStyle = "rgba(255,255,255,1)";
    c.fillRect(0, 14, 150, 11);
    c.fillStyle = "rgba(255,255,255,.8)";
    c.fillRect(170, 20, 86, 7);
    c.fillStyle = "rgba(244,242,236,.45)";
    c.fillRect(0, 52, 256, 5);
    c.fillStyle = "rgba(55,132,81,.30)";
    c.beginPath();
    c.ellipse(62, 100, 54, 12, 0, 0, 7);
    c.fill();
    const tex = new THREE.CanvasTexture(e);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    const pm = new THREE.PMREMGenerator(renderer);
    pm.compileEquirectangularShader();
    scene.environment = pm.fromEquirectangular(tex).texture;
    tex.dispose();
    pm.dispose();
  })();

  const luzPrincipal = new THREE.DirectionalLight(0xffffff, 1.1);
  luzPrincipal.position.set(4, 6, 6);
  scene.add(luzPrincipal);
  const luzRelleno = new THREE.DirectionalLight(0xdfe8df, 0.35);
  luzRelleno.position.set(-5, -2, 4);
  scene.add(luzRelleno);
  /* Luz de contra, fría y desde atrás a la izquierda. Es el aporte más grande al realismo:
   dibuja un filo encendido en el canto de aluminio que separa el aparato del fondo. Sin
   ella el teléfono se funde con el crema y se lee como un dibujo. */
  const luzFilo = new THREE.DirectionalLight(0xe8f0ff, 0.85);
  luzFilo.position.set(-6, 3, -5);
  scene.add(luzFilo);
  /* Un rebote cálido bajísimo desde el piso, para que la parte baja no quede muerta. */
  const luzPiso = new THREE.DirectionalLight(0xfff2df, 0.18);
  luzPiso.position.set(1, -6, 2);
  scene.add(luzPiso);

  /* micro-rugosidad: un valor constante es la firma del CGI */
  function mapaRugosidad(amp, veta, rep) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d"),
      img = g.createImageData(256, 256),
      d = img.data;
    for (let i = 0; i < 65536; i++) {
      const y = (i / 256) | 0;
      const v = Math.max(
        0,
        Math.min(255, 128 + (Math.random() - 0.5) * amp * 255 + Math.sin(y * veta) * amp * 90),
      );
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
      d[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rep, rep * 2);
    return t;
  }

  /* materiales del componente de producción (sin `sheen`, que en r128 es un Color) */
  const frameMat = new THREE.MeshPhysicalMaterial({
    color: 0x8b968a,
    metalness: 0.92,
    roughness: 0.28,
    clearcoat: 0.6,
    clearcoatRoughness: 0.25,
    roughnessMap: mapaRugosidad(0.2, 2.6, 3),
  });
  const backMat = new THREE.MeshPhysicalMaterial({
    color: 0x4e5c4a,
    metalness: 0.12,
    roughness: 0.42,
    clearcoat: 0.55,
    clearcoatRoughness: 0.32,
    roughnessMap: mapaRugosidad(0.13, 0.8, 2),
  });
  const plateauMat = new THREE.MeshPhysicalMaterial({
    color: 0x475545,
    metalness: 0.14,
    roughness: 0.48,
    clearcoat: 0.4,
    clearcoatRoughness: 0.4,
  });
  const ringMat = new THREE.MeshPhysicalMaterial({
    color: 0xb9c4b4,
    metalness: 0.95,
    roughness: 0.22,
    clearcoat: 0.8,
    clearcoatRoughness: 0.2,
  });
  const lensGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0a1018,
    metalness: 0.2,
    roughness: 0.04,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 3,
  });
  const lensInnerMat = new THREE.MeshPhysicalMaterial({
    color: 0x0a0c14,
    metalness: 0.4,
    roughness: 0.15,
    envMapIntensity: 1.2,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x101410,
    roughness: 0.55,
    metalness: 0.2,
  });

  const phone = new THREE.Group(),
    rig = new THREE.Group();
  rig.add(phone);
  scene.add(rig);

  /* Textura del objetivo: se dibuja una vez y la comparten los tres lentes. */
  let _lenteTex = null;
  function texturaLente() {
    if (_lenteTex) return _lenteTex;
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d"),
      C = 128;

    // pozo del barril: casi negro al centro, apenas más claro en el borde
    const pozo = g.createRadialGradient(C, C, 4, C, C, 126);
    pozo.addColorStop(0, "#020406");
    pozo.addColorStop(0.55, "#070b12");
    pozo.addColorStop(0.88, "#121a26");
    pozo.addColorStop(1, "#1c2534");
    g.fillStyle = pozo;
    g.beginPath();
    g.arc(C, C, 126, 0, 7);
    g.fill();

    // anillos concéntricos: es lo que da la sensación de PROFUNDIDAD
    [118, 104, 92, 74, 58, 40].forEach(function (r, i) {
      g.strokeStyle = i % 2 ? "rgba(140,170,200,.10)" : "rgba(0,0,0,.55)";
      g.lineWidth = i % 2 ? 1.2 : 2.4;
      g.beginPath();
      g.arc(C, C, r, 0, 7);
      g.stroke();
    });

    // recubrimiento antirreflejo: verde de un lado, violeta del otro
    const verde = g.createRadialGradient(96, 104, 2, 96, 104, 74);
    verde.addColorStop(0, "rgba(92,190,140,.30)");
    verde.addColorStop(1, "rgba(92,190,140,0)");
    g.fillStyle = verde;
    g.beginPath();
    g.arc(C, C, 122, 0, 7);
    g.fill();
    const violeta = g.createRadialGradient(168, 158, 2, 168, 158, 62);
    violeta.addColorStop(0, "rgba(150,120,210,.22)");
    violeta.addColorStop(1, "rgba(150,120,210,0)");
    g.fillStyle = violeta;
    g.beginPath();
    g.arc(C, C, 122, 0, 7);
    g.fill();

    // reflejo: pequeño, alargado y descentrado — no un punto en el medio
    g.save();
    g.translate(92, 88);
    g.rotate(-0.6);
    const brillo = g.createRadialGradient(0, 0, 0, 0, 0, 26);
    brillo.addColorStop(0, "rgba(255,255,255,.92)");
    brillo.addColorStop(0.35, "rgba(226,238,255,.35)");
    brillo.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = brillo;
    g.beginPath();
    g.ellipse(0, 0, 26, 12, 0, 0, 7);
    g.fill();
    g.restore();
    // y un segundo reflejo diminuto, el de la fuente secundaria
    const b2 = g.createRadialGradient(158, 176, 0, 158, 176, 9);
    b2.addColorStop(0, "rgba(255,255,255,.55)");
    b2.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = b2;
    g.beginPath();
    g.arc(158, 176, 9, 0, 7);
    g.fill();

    // recorte circular limpio
    g.globalCompositeOperation = "destination-in";
    g.beginPath();
    g.arc(C, C, 126, 0, 7);
    g.fill();
    g.globalCompositeOperation = "source-over";

    _lenteTex = new THREE.CanvasTexture(c);
    _lenteTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    _lenteTex.colorSpace = THREE.SRGBColorSpace;
    return _lenteTex;
  }

  function siluetaRedondeada(w, h, r) {
    const s = new THREE.Shape(),
      x = -w / 2,
      y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
    s.lineTo(x + w, y + h - r);
    s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
    s.lineTo(x + r, y + h);
    s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(x, y + r);
    s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
    return s;
  }
  /* RoundedBoxGeometry tampoco está en el UMD: para los botones basta una
   extrusión de la misma silueta redondeada, que además es coherente. */
  function cajaRedondeada(w, h, d, r) {
    const g = new THREE.ExtrudeGeometry(siluetaRedondeada(w, h, r), {
      depth: d - 0.02,
      bevelEnabled: true,
      bevelThickness: 0.01,
      bevelSize: 0.01,
      bevelSegments: 2,
      curveSegments: 12,
    });
    g.center();
    return g;
  }

  /* cuerpo */
  (function () {
    const geo = new THREE.ExtrudeGeometry(siluetaRedondeada(W - 2 * BEV, H - 2 * BEV, R - BEV), {
      depth: T - 2 * BEV,
      bevelEnabled: true,
      bevelThickness: BEV,
      bevelSize: BEV,
      bevelSegments: 7,
      curveSegments: 36,
    });
    geo.center();
    phone.add(new THREE.Mesh(geo, frameMat));
  })();
  /* trasera alpine green */
  (function () {
    const geo = new THREE.ExtrudeGeometry(siluetaRedondeada(W - 0.1, H - 0.1, R - 0.06), {
      depth: 0.012,
      bevelEnabled: false,
      curveSegments: 36,
    });
    geo.center();
    const v = new THREE.Mesh(geo, backMat);
    v.position.z = -(T / 2 - 0.02);
    v.rotation.y = Math.PI;
    phone.add(v);
  })();

  /* ── pantalla ── */
  /* 2× y no 3×: la pantalla ocupa como mucho ~350 px de ancho en la vitrina, así
   que a 1080 de textura ya sobra resolución. 3× eran 22 MB por re-subida. */
  /* Supermuestreo adaptativo. Antes era 2 fijo. Ahora, en equipos con pantalla densa y
   memoria de sobra, la pantalla se dibuja a 3× (1620×3480) y el texto queda nítido incluso
   con el aparato inclinado; en el resto se queda en 2× para no pagar 22 MB por re-subida.
   El redibujado solo ocurre en los primeros segundos de cada panel, así que el costo es
   acotado — fue el lazo de realimentación de aquel bug, ya corregido. */
  /* ══ LA PANTALLA DEL TELÉFONO ═══════════════════════════════════════════════
   Se dibuja en el MISMO sistema de coordenadas que `phone-3d/screen-texture.ts`
   —284×610— y el lienzo real se escala con un `setTransform`. Así el diseño que
   ya funciona en la página en vivo (tarjetas blancas sobre papel, anillo, barras
   de color, curva con área, barra de navegación) se porta sin recalcular una
   sola coordenada, y sube de resolución con solo cambiar `SS`.

   TODAS las cifras son las de la cuenta de demostración Familia Ramírez, las
   mismas que aparecen escritas en la página. Los porcentajes son razones entre
   dos de esas cifras (fondo 1.520.000/3.500.000 = 43%, sobre 160.400/250.000 =
   64%, patrimonio 25,5M→34,4M = +34,9%). Nada inventado para que cuadre bonito.
   ══════════════════════════════════════════════════════════════════════════ */
  const SS =
    Math.min(window.devicePixelRatio || 1, 3) >= 2 && (navigator.deviceMemory || 4) >= 8 ? 3 : 2;
  const PW = 284,
    PH = 610; // espacio lógico de diseño
  const SW = 540,
    SH = 1160; // el mapeo UV de la geometría sigue igual
  const ESC = (SW * SS) / PW; // 540·SS px de ancho repartidos en 284 unidades

  const sc = document.createElement("canvas");
  sc.width = SW * SS;
  sc.height = SH * SS;
  const sx = sc.getContext("2d");
  sx.setTransform(ESC, 0, 0, ESC, 0, 0);

  const PANELS = ["Centro de mando", "Tus deudas", "My Agent C+"];

  /* Paleta: la del design system v2, la misma del producto. */
  const VERDE = "#378451",
    AGUA = "#2b7d6a",
    AMBAR = "#b07a2e",
    ROJO = "#c34f4b";
  const TINTA = "#1e1c16",
    MUTE = "#625e57",
    TENUE = "#8b877e";
  const PAPEL = "#f7f6f2",
    LINEA = "#eceae3",
    RIEL = "#eeece5";

  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function fu(px, peso) {
    return (
      (peso || 400) + " " + px + 'px Manrope, -apple-system, "Helvetica Neue", Arial, sans-serif'
    );
  }
  function fm(px, peso) {
    return (peso || 400) + " " + px + 'px "Space Mono", ui-monospace, monospace';
  }
  function TX(s, x, y, px, color, peso, mono) {
    sx.fillStyle = color;
    sx.font = mono ? fm(px, peso) : fu(px, peso);
    sx.fillText(s, x, y);
  }
  function TD(s, x, y, px, color, peso, mono) {
    // alineado a la derecha
    sx.textAlign = "right";
    TX(s, x, y, px, color, peso, mono);
    sx.textAlign = "left";
  }
  function tarjeta(y, h) {
    sx.fillStyle = "#fff";
    rr(sx, 16, y, 252, h, 13);
    sx.fill();
    sx.strokeStyle = LINEA;
    sx.lineWidth = 1;
    rr(sx, 16, y, 252, h, 13);
    sx.stroke();
  }
  function barra(x, y, w, pct, color, alto) {
    const a = alto || 4.5;
    sx.fillStyle = RIEL;
    rr(sx, x, y, w, a, a / 2);
    sx.fill();
    if (pct > 0) {
      sx.fillStyle = color;
      rr(sx, x, y, w * Math.min(1, pct), a, a / 2);
      sx.fill();
    }
  }
  /* Curva con relleno degradado: es lo que hace que un gráfico se vea de producto
   caro y no de hoja de cálculo. */
  function curva(pts, x0, y0, w, h, color, base, prog) {
    const n = pts.length,
      lim = Math.max(2, Math.ceil(n * Math.min(1, prog)));
    const px = function (i) {
      return x0 + (w * i) / (n - 1);
    };
    const py = function (i) {
      return y0 + h - h * pts[i];
    };
    sx.beginPath();
    for (let i = 0; i < lim; i++) {
      i ? sx.lineTo(px(i), py(i)) : sx.moveTo(px(i), py(i));
    }
    const g = sx.createLinearGradient(0, y0, 0, base);
    g.addColorStop(0, color.replace("rgb", "rgba").replace(")", ",.22)"));
    g.addColorStop(1, color.replace("rgb", "rgba").replace(")", ",0)"));
    sx.save();
    sx.lineTo(px(lim - 1), base);
    sx.lineTo(x0, base);
    sx.closePath();
    sx.fillStyle = g;
    sx.fill();
    sx.restore();
    sx.beginPath();
    for (let j = 0; j < lim; j++) {
      j ? sx.lineTo(px(j), py(j)) : sx.moveTo(px(j), py(j));
    }
    sx.strokeStyle = color;
    sx.lineWidth = 2;
    sx.lineJoin = "round";
    sx.lineCap = "round";
    sx.stroke();
  }
  function navegador(activo) {
    sx.fillStyle = "#fff";
    rr(sx, 16, 556, 252, 34, 11);
    sx.fill();
    sx.strokeStyle = LINEA;
    sx.lineWidth = 1;
    rr(sx, 16, 556, 252, 34, 11);
    sx.stroke();
    for (let i = 0; i < 4; i++) {
      sx.fillStyle = i === activo ? VERDE : "#dcd9d0";
      rr(sx, 44 + i * 56, 566, 14, 14, 4.5);
      sx.fill();
    }
  }
  function cabecera(titulo) {
    TX(titulo, 16, 56, 12.5, TINTA, 600);
    sx.fillStyle = "#fff";
    rr(sx, 222, 44, 46, 16, 8);
    sx.fill();
    sx.strokeStyle = "#e7e4dc";
    sx.lineWidth = 1;
    rr(sx, 222, 44, 46, 16, 8);
    sx.stroke();
    TX("₡ CRC", 231, 55.5, 9, MUTE);
  }

  /* La ISLA DINÁMICA, portada de screen-texture.ts con sus coordenadas originales. */
  function dibujarIsla() {
    sx.fillStyle = "#000";
    rr(sx, 94, 10, 96, 26, 13);
    sx.fill();
    const lente = sx.createRadialGradient(172, 22, 1, 172, 23, 5.5);
    lente.addColorStop(0, "#3a4a6b");
    lente.addColorStop(0.5, "#10131c");
    lente.addColorStop(1, "#000");
    sx.fillStyle = lente;
    sx.beginPath();
    sx.arc(172, 23, 5, 0, Math.PI * 2);
    sx.fill();
  }

  /* ── panel 0 · CENTRO DE MANDO ── */
  function panelMando(t) {
    cabecera("Centro de mando");

    /* anillo del fondo de emergencia: 43% y en ÁMBAR, porque está por debajo de la
     meta — el color dice el estado sin una palabra */
    tarjeta(70, 88);
    const pct = 0.43 * Math.min(1, Math.max(0, t * 1.3));
    sx.strokeStyle = "#e9e7e0";
    sx.lineWidth = 6.5;
    sx.beginPath();
    sx.arc(60, 114, 24, 0, Math.PI * 2);
    sx.stroke();
    sx.strokeStyle = AMBAR;
    sx.lineCap = "round";
    sx.beginPath();
    sx.arc(60, 114, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
    sx.stroke();
    sx.lineCap = "butt";
    sx.textAlign = "center";
    TX("43%", 60, 118, 15, TINTA, 700);
    TX("fondo", 60, 128, 6.5, MUTE);
    sx.textAlign = "left";
    const kpi = function (y, et, va, color) {
      TX(et, 100, y, 9.5, MUTE);
      TD(va, 258, y, 9.5, color || TINTA, 700, true);
    };
    kpi(96, "Disponible hoy", "₡1.354.594");
    kpi(114, "Comprometido", "₡755.417");
    kpi(132, "Libre al mes", "+₡173.920", VERDE);

    /* sobres */
    tarjeta(168, 96);
    const sobre = function (y, et, val, pct2, color) {
      TX(et, 28, y, 9.5, MUTE);
      TD(val, 256, y, 9.5, TINTA, 700, true);
      barra(28, y + 5, 228, pct2 * Math.min(1, Math.max(0, (t - 0.15) * 1.5)), color);
    };
    sobre(186, "Supermercado y feria", "64%", 0.64, VERDE);
    sobre(214, "Fondo de emergencia", "43%", 0.43, AMBAR);
    sobre(242, "Ahorro del mes", "₡296.403", 0.78, AGUA);

    /* el consejo del asesor */
    tarjeta(276, 66);
    sx.fillStyle = VERDE;
    sx.beginPath();
    sx.arc(37, 297, 9, 0, Math.PI * 2);
    sx.fill();
    sx.textAlign = "center";
    TX("C+", 37, 300, 8, "#fff", 700);
    sx.textAlign = "left";
    sx.fillStyle = "#eef4ef";
    rr(sx, 52, 286, 204, 46, 10);
    sx.fill();
    TX("Atacá el préstamo del vehículo", 60, 302, 9, "#2a352d");
    TX("(13,5%): es el que más te cuesta.", 60, 316, 9, "#2a352d");

    /* patrimonio neto + curva */
    tarjeta(354, 84);
    TX("Patrimonio neto", 28, 372, 9.5, MUTE);
    TD("+34,9%", 256, 372, 9.5, VERDE, 700, true);
    TX("₡34.400.000", 28, 393, 15, TINTA, 700, true);
    curva(
      [0.05, 0.12, 0.1, 0.22, 0.28, 0.24, 0.4, 0.52, 0.66, 0.78, 0.92, 1],
      28,
      402,
      228,
      28,
      "rgb(55,132,81)",
      432,
      (t - 0.3) * 1.6,
    );
    navegador(0);
  }

  /* ── panel 1 · TUS DEUDAS ── */
  function panelDeudas(t) {
    cabecera("Tus deudas");

    tarjeta(70, 76);
    TX("Deuda total", 28, 90, 9.5, MUTE);
    TX("₡32.166.147", 28, 114, 21, TINTA, 700, true);
    sx.fillStyle = "rgba(55,132,81,.12)";
    rr(sx, 28, 124, 130, 18, 9);
    sx.fill();
    TX("Libre de deudas · jul 2030", 38, 136, 8.5, "#2c6e43", 700);

    TX("ORDEN DE ATAQUE · AVALANCHA", 28, 172, 8, TENUE, 700, true);

    const fila = function (y, n, nombre, tasa, activa) {
      tarjeta(y, 40);
      sx.fillStyle = activa ? VERDE : "#e6e4dd";
      rr(sx, 28, y + 11, 18, 18, 6);
      sx.fill();
      sx.textAlign = "center";
      TX(n, 37, y + 24, 9.5, activa ? "#fff" : MUTE, 700, true);
      sx.textAlign = "left";
      TX(nombre, 54, y + 24, 9.5, TINTA, 600);
      sx.fillStyle = activa ? "rgba(195,79,75,.12)" : "#f2f1ec";
      rr(sx, 214, y + 12, 42, 16, 8);
      sx.fill();
      sx.textAlign = "center";
      TX(tasa, 235, y + 23, 8.5, activa ? ROJO : MUTE, 700, true);
      sx.textAlign = "left";
    };
    fila(182, "1", "Préstamo vehículo — BCR", "13,5%", true);
    fila(230, "2", "Hipoteca casa — BAC", "10,5%", false);

    tarjeta(292, 146);
    TX("Te ahorra en intereses", 28, 312, 9.5, MUTE);
    TX("₡5.303.319", 28, 336, 19, VERDE, 700, true);
    /* la deuda bajando hasta cero: la curva más importante de la app */
    curva(
      [1, 0.94, 0.86, 0.79, 0.7, 0.62, 0.52, 0.41, 0.3, 0.19, 0.09, 0],
      28,
      350,
      228,
      58,
      "rgb(55,132,81)",
      414,
      t * 1.5,
    );
    TX("Hoy", 28, 428, 8, TENUE, 400, true);
    TD("jul 2030", 256, 428, 8, TENUE, 400, true);

    tarjeta(454, 70);
    TX("Pagos mensuales", 28, 472, 9.5, MUTE);
    TD("₡620.680", 256, 472, 9.5, TINTA, 700, true);
    barra(28, 478, 228, 0.38 * Math.min(1, t * 1.4), VERDE);
    TX("Ratio de deuda", 28, 502, 9.5, MUTE);
    TD("32% · saludable", 256, 502, 9.5, VERDE, 700);
    barra(28, 508, 228, 0.32 * Math.min(1, t * 1.4), AGUA);
    navegador(2);
  }

  /* ── panel 2 · MY AGENT C+ ── */
  function panelAsesor(t) {
    cabecera("My Agent C+");

    /* burbuja del usuario */
    sx.fillStyle = VERDE;
    rr(sx, 76, 74, 192, 44, 12);
    sx.fill();
    TX("¿Abono ₡300.000 al carro o", 88, 92, 9.5, "#fff");
    TX("al fondo de emergencia?", 88, 106, 9.5, "#fff");

    /* respuesta */
    sx.fillStyle = VERDE;
    sx.beginPath();
    sx.arc(27, 140, 9, 0, Math.PI * 2);
    sx.fill();
    sx.textAlign = "center";
    TX("C+", 27, 143, 8, "#fff", 700);
    sx.textAlign = "left";
    sx.fillStyle = "#fff";
    rr(sx, 42, 128, 226, 96, 12);
    sx.fill();
    sx.strokeStyle = LINEA;
    sx.lineWidth = 1;
    rr(sx, 42, 128, 226, 96, 12);
    sx.stroke();
    [
      "Al fondo, y te digo por qué con",
      "tus números. El vehículo está al",
      "13,5%: te ahorrás ~₡40.500 al año.",
      "Pero tu fondo cubre menos de dos",
      "meses — y la salida sería la tarjeta",
      "al 45%.",
    ].forEach(function (l, i) {
      TX(l, 54, 148 + i * 13, 9, TINTA);
    });

    /* la propuesta, que entra después */
    sx.globalAlpha = Math.min(1, Math.max(0, (t - 0.45) * 3));
    sx.fillStyle = "#f2f7f2";
    rr(sx, 42, 236, 226, 92, 12);
    sx.fill();
    sx.setLineDash([5, 4]);
    sx.strokeStyle = "#cfd8cc";
    sx.lineWidth = 1;
    rr(sx, 42, 236, 226, 92, 12);
    sx.stroke();
    sx.setLineDash([]);
    TX("PENDIENTE DE TU CONFIRMACIÓN", 54, 254, 7.5, "#2c6e43", 700, true);
    TX("Aporte al fondo de emergencia", 54, 272, 10.5, TINTA, 600);
    TX("₡300.000 · hoy · Ahorro BAC", 54, 288, 9, MUTE, 700, true);
    sx.fillStyle = VERDE;
    rr(sx, 54, 298, 62, 20, 10);
    sx.fill();
    sx.textAlign = "center";
    TX("Confirmar", 85, 311, 8.5, "#fff", 600);
    sx.textAlign = "left";
    sx.strokeStyle = "#d6d2c8";
    rr(sx, 122, 298, 46, 20, 10);
    sx.stroke();
    sx.textAlign = "center";
    TX("Editar", 145, 311, 8.5, TINTA, 600);
    sx.textAlign = "left";
    sx.globalAlpha = 1;

    /* efecto del aporte sobre el fondo */
    tarjeta(346, 76);
    TX("Fondo de emergencia", 28, 364, 9.5, MUTE);
    TD("₡1.520.000 / ₡3.500.000", 256, 364, 9, TINTA, 700, true);
    barra(28, 372, 228, 0.43, AMBAR, 5.5);
    sx.globalAlpha = Math.min(1, Math.max(0, (t - 0.7) * 3));
    barra(28, 372, 228 * 0.52, 0.43 + 0.086, VERDE, 5.5);
    TX("Con el aporte", 28, 398, 9, MUTE);
    /* 1.520.000/(3.500.000/3) = 1,3 meses; con el aporte 1.820.000 → 1,6. Derivado, no inventado. */
    TD("1,3 → 1,6 meses de cobertura", 256, 398, 9, VERDE, 700);
    sx.globalAlpha = 1;

    /* barra de escritura */
    sx.fillStyle = "#fff";
    rr(sx, 16, 470, 252, 30, 15);
    sx.fill();
    sx.strokeStyle = LINEA;
    sx.lineWidth = 1;
    rr(sx, 16, 470, 252, 30, 15);
    sx.stroke();
    TX("Escribile a tu asesor…", 32, 489, 9, "#a5a19a");
    sx.fillStyle = VERDE;
    sx.beginPath();
    sx.arc(248, 485, 11, 0, Math.PI * 2);
    sx.fill();
    navegador(1);
  }

  function drawPanel(p, t) {
    sx.fillStyle = PAPEL;
    sx.fillRect(0, 0, PW, PH);
    if (p === 0) panelMando(t);
    else if (p === 1) panelDeudas(t);
    else panelAsesor(t);

    /* viñeta suave: un panel real no es un blanco parejo de borde a borde */
    const vg = sx.createRadialGradient(
      PW * 0.5,
      PH * 0.42,
      PW * 0.25,
      PW * 0.5,
      PH * 0.5,
      PH * 0.62,
    );
    vg.addColorStop(0, "rgba(255,255,255,0)");
    vg.addColorStop(0.72, "rgba(24,22,18,.020)");
    vg.addColorStop(1, "rgba(24,22,18,.055)");
    sx.fillStyle = vg;
    sx.fillRect(0, 0, PW, PH);

    /* filete del vidrio: el panel está hundido un pelo respecto del marco.
     El radio es el de la geometría (.45 u de 2,84 = 45 unidades de este espacio). */
    sx.strokeStyle = "rgba(8,10,14,.34)";
    sx.lineWidth = 1.6;
    rr(sx, 0.8, 0.8, PW - 1.6, PH - 1.6, 45);
    sx.stroke();
    sx.strokeStyle = "rgba(255,255,255,.30)";
    sx.lineWidth = 0.8;
    rr(sx, 2.2, 2.2, PW - 4.4, PH - 4.4, 43.6);
    sx.stroke();

    dibujarIsla();
  }

  let screenTex = null,
    sheenMesh = null,
    barraMesh = null,
    sombraMesh = null;
  (function () {
    const bezGeo = new THREE.ExtrudeGeometry(siluetaRedondeada(W - 0.14, H - 0.14, R - 0.08), {
      depth: 0.008,
      bevelEnabled: false,
      curveSegments: 36,
    });
    bezGeo.center();
    const bezel = new THREE.Mesh(
      bezGeo,
      new THREE.MeshStandardMaterial({ color: 0x060707, roughness: 0.4, metalness: 0.1 }),
    );
    bezel.position.z = T / 2 + 0.001;
    phone.add(bezel);

    const scrGeo = new THREE.ShapeGeometry(siluetaRedondeada(2.84, 6.1, 0.45), 72);
    const uv = scrGeo.attributes.uv,
      pos = scrGeo.attributes.position;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, (pos.getX(i) + 1.42) / 2.84, (pos.getY(i) + 3.05) / 6.1);
    uv.needsUpdate = true;

    screenTex = new THREE.CanvasTexture(sc);
    screenTex.colorSpace = THREE.SRGBColorSpace;
    screenTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    /* Mipmaps SÍ. Los había quitado por costo, pero el costo real era el lazo de
     realimentación del reloj de panel, ya corregido: ahora la textura se sube
     un puñado de veces, no en cada cuadro. Sin mipmaps, 1080 px de textura
     reducidos a ~350 en pantalla se alían y el texto sale con dientes.
     Trilineal + anisotropía = letras suaves a cualquier ángulo. */
    screenTex.generateMipmaps = true;
    screenTex.minFilter = THREE.LinearMipmapLinearFilter;
    screenTex.magFilter = THREE.LinearFilter;
    /* Sin iluminar: un panel encendido EMITE. Con material físico las luces lo
     lavan y el texto deja de leerse. El reflejo vive en las dos capas de arriba. */
    const scr = new THREE.Mesh(
      scrGeo,
      new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }),
    );
    scr.position.z = T / 2 + 0.006;
    phone.add(scr);

    /* huellas + velo, con opacidad por ángulo */
    const hc = document.createElement("canvas");
    hc.width = 256;
    hc.height = 512;
    const hg = hc.getContext("2d");
    const lg = hg.createLinearGradient(0, 0, 256, 512);
    lg.addColorStop(0, "rgba(255,255,255,0)");
    lg.addColorStop(0.32, "rgba(255,255,255,.62)");
    lg.addColorStop(0.44, "rgba(255,255,255,.08)");
    lg.addColorStop(0.6, "rgba(255,255,255,.38)");
    lg.addColorStop(0.76, "rgba(255,255,255,0)");
    hg.fillStyle = lg;
    hg.fillRect(0, 0, 256, 512);
    for (let k = 0; k < 30; k++) {
      const hx = 26 + Math.random() * 200,
        hy = 50 + Math.random() * 420,
        rad = 12 + Math.random() * 26;
      const sg = hg.createRadialGradient(hx, hy, 0, hx, hy, rad);
      sg.addColorStop(0, "rgba(255,255,255,.09)");
      sg.addColorStop(0.7, "rgba(255,255,255,.03)");
      sg.addColorStop(1, "rgba(255,255,255,0)");
      hg.fillStyle = sg;
      hg.beginPath();
      hg.ellipse(hx, hy, rad, rad * 0.72, Math.random() * 3, 0, 7);
      hg.fill();
    }
    sheenMesh = new THREE.Mesh(
      scrGeo.clone(),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(hc),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    sheenMesh.position.z = T / 2 + 0.0075;
    phone.add(sheenMesh);

    /* barra de estudio: se refleja y BARRE según el ángulo, no según el reloj */
    const bc = document.createElement("canvas");
    bc.width = 64;
    bc.height = 512;
    const bg = bc.getContext("2d");
    const bl = bg.createLinearGradient(0, 0, 0, 512);
    bl.addColorStop(0, "rgba(255,255,255,0)");
    bl.addColorStop(0.3, "rgba(255,255,255,0)");
    bl.addColorStop(0.4, "rgba(255,255,255,.30)");
    bl.addColorStop(0.455, "rgba(255,255,255,.92)");
    bl.addColorStop(0.5, "rgba(255,255,255,1)");
    bl.addColorStop(0.545, "rgba(255,255,255,.92)");
    bl.addColorStop(0.6, "rgba(255,255,255,.30)");
    bl.addColorStop(0.7, "rgba(255,255,255,0)");
    bl.addColorStop(1, "rgba(255,255,255,0)");
    bg.fillStyle = bl;
    bg.fillRect(0, 0, 64, 512);
    const barraTex = new THREE.CanvasTexture(bc);
    barraTex.wrapS = barraTex.wrapT = THREE.RepeatWrapping;
    barraMesh = new THREE.Mesh(
      scrGeo.clone(),
      new THREE.MeshBasicMaterial({
        map: barraTex,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    barraMesh.position.z = T / 2 + 0.008;
    phone.add(barraMesh);
  })();

  /* módulo de cámara — del componente de producción */
  (function () {
    const mod = new THREE.Group();
    const pGeo = new THREE.ExtrudeGeometry(siluetaRedondeada(1.3, 1.3, 0.33), {
      depth: 0.05,
      bevelEnabled: true,
      bevelThickness: 0.035,
      bevelSize: 0.035,
      bevelSegments: 5,
      curveSegments: 28,
    });
    pGeo.center();
    mod.add(new THREE.Mesh(pGeo, plateauMat));
    function lente(x, y) {
      const u = new THREE.Group();
      const aro = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.28, 0.085, 48), ringMat);
      aro.rotation.x = Math.PI / 2;
      u.add(aro);
      const barril = new THREE.Mesh(
        new THREE.CylinderGeometry(0.215, 0.215, 0.06, 48),
        lensInnerMat,
      );
      barril.rotation.x = Math.PI / 2;
      barril.position.z = 0.035;
      u.add(barril);
      const vidrio = new THREE.Mesh(
        new THREE.SphereGeometry(0.19, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2),
        lensGlassMat,
      );
      vidrio.rotation.x = -Math.PI / 2;
      vidrio.scale.z = 0.42;
      vidrio.position.z = 0.052;
      u.add(vidrio);
      /* El iris era un disco liso con un punto celeste encima, y eso es lo que se
       leía como plástico. Un objetivo real tiene: barril casi negro, ANILLOS
       concéntricos que dan profundidad, un tinte de RECUBRIMIENTO (verde y
       violeta, de las capas antirreflejo) y un reflejo chico y nítido — no un
       punto grande y plano en el centro. */
      const iris = new THREE.Mesh(
        new THREE.CircleGeometry(0.135, 48),
        new THREE.MeshBasicMaterial({ map: texturaLente(), transparent: true, toneMapped: false }),
      );
      iris.position.z = 0.092;
      u.add(iris);
      u.position.set(x, y, 0.055);
      return u;
    }
    mod.add(lente(-0.3, 0.3));
    mod.add(lente(-0.3, -0.3));
    mod.add(lente(0.3, 0));
    const flash = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.085, 0.03, 32),
      new THREE.MeshPhysicalMaterial({
        color: 0xf3e9bd,
        roughness: 0.4,
        metalness: 0.1,
        clearcoat: 0.5,
        emissive: new THREE.Color(0x776a33),
        emissiveIntensity: 0.05,
      }),
    );
    flash.rotation.x = Math.PI / 2;
    flash.position.set(0.3, 0.44, 0.045);
    mod.add(flash);
    const lidar = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.03, 32), lensInnerMat);
    lidar.rotation.x = Math.PI / 2;
    lidar.position.set(0.3, -0.44, 0.045);
    mod.add(lidar);
    const mic = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 16), darkMat);
    mic.rotation.x = Math.PI / 2;
    mic.position.set(0.52, 0.44, 0.04);
    mod.add(mic);
    mod.position.set(0.72, 2.3, -(T / 2));
    mod.rotation.y = Math.PI;
    phone.add(mod);
  })();

  /* botones laterales */
  (function () {
    function boton(largo, y, lado) {
      const b = new THREE.Mesh(cajaRedondeada(0.11, largo, 0.11, 0.045), frameMat);
      b.position.set(lado * (W / 2), y, 0);
      phone.add(b);
    }
    boton(0.3, 1.46, -1);
    boton(0.52, 0.92, -1);
    boton(0.52, 0.3, -1);
    boton(0.86, 0.55, 1);
  })();

  /* sombra de contacto (en la escena, no en el rig) */
  (function () {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    const rad = g.createRadialGradient(128, 128, 10, 128, 128, 120);
    const s0 = TEMA === "oscuro" ? 0.5 : 0.34,
      s1 = TEMA === "oscuro" ? 0.18 : 0.12;
    rad.addColorStop(0, "rgba(18,26,18," + s0 + ")");
    rad.addColorStop(0.55, "rgba(18,26,18," + s1 + ")");
    rad.addColorStop(1, "rgba(18,26,18,0)");
    g.fillStyle = rad;
    g.fillRect(0, 0, 256, 256);
    const s = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 1.6),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(c),
        transparent: true,
        opacity: 1,
        depthWrite: false,
      }),
    );
    s.rotation.x = -Math.PI / 2;
    s.position.y = -3.62;
    scene.add(s);
    sombraMesh = s;
  })();

  /* telón de papel dentro de la escena — opcional: sin él el lienzo queda transparente
   y el teléfono flota sobre el fondo de la página, sin caja que lo encierre. */
  if (TELON)
    (function () {
      const c = document.createElement("canvas");
      c.width = c.height = 512;
      const g = c.getContext("2d");
      const rg = g.createRadialGradient(256, 96, 30, 256, 300, 460);
      rg.addColorStop(0, "#fbfaf6");
      rg.addColorStop(0.46, "#f4f2ec");
      rg.addColorStop(1, "#e6e2d8");
      g.fillStyle = rg;
      g.fillRect(0, 0, 512, 512);
      g.strokeStyle = "rgba(30,28,22,.05)";
      g.lineWidth = 1;
      for (let gx = 0; gx <= 512; gx += 32) {
        g.beginPath();
        g.moveTo(gx + 0.5, 0);
        g.lineTo(gx + 0.5, 512);
        g.stroke();
        g.beginPath();
        g.moveTo(0, gx + 0.5);
        g.lineTo(512, gx + 0.5);
        g.stroke();
      }
      const fade = g.createRadialGradient(256, 250, 60, 256, 256, 300);
      fade.addColorStop(0, "rgba(244,242,236,0)");
      fade.addColorStop(1, "rgba(240,237,229,.9)");
      g.fillStyle = fade;
      g.fillRect(0, 0, 512, 512);
      const telon = new THREE.Mesh(
        new THREE.PlaneGeometry(70, 70),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false }),
      );
      telon.position.z = -18;
      scene.add(telon);
    })();

  function resize() {
    const w = stage.clientWidth,
      h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize);

  const pt = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener(
    "pointermove",
    function (e) {
      const r = stage.getBoundingClientRect();
      pt.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      pt.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    },
    { passive: true },
  );
  window.addEventListener(
    "deviceorientation",
    function (e) {
      if (e.gamma == null) return;
      pt.tx = Math.max(-1, Math.min(1, e.gamma / 26));
      pt.ty = Math.max(-1, Math.min(1, ((e.beta || 40) - 40) / 26));
    },
    { passive: true },
  );

  let running = true,
    panel = 0,
    panelT = 0,
    redibujar = true,
    ultimoDibujo = 0;
  new IntersectionObserver(
    function (en) {
      running = en[0].isIntersecting;
    },
    { threshold: 0.02 },
  ).observe(stage);

  /* El canvas 2D dibuja con la fuente que HAYA en ese momento: si Sora y Manrope
   todavía no cargaron, el texto sale en la de reemplazo y ya no se corrige solo.
   Por eso se fuerza un redibujado cuando terminan de cargar. */
  if (document.fonts && document.fonts.ready)
    document.fonts.ready.then(function () {
      redibujar = true;
    });

  // Solo `t0` es constante: marca el arranque del ciclo. Las otras cuatro se
  // reasignan en cada cuadro, así que van aparte y con `let`.
  const t0 = performance.now();
  let tPrev = t0,
    frames = 0,
    fpsT = performance.now(),
    judged = false;
  function tick(now) {
    requestAnimationFrame(tick);
    if (!running) {
      fpsT = now;
      frames = 0;
      return;
    }
    const t = (now - t0) / 1000;
    // Delta REAL. Antes esto avanzaba 1/60 por cuadro: al caer los fps el reloj
    // del panel se congelaba, la condición "sigo en la animación de entrada"
    // nunca terminaba, y el lienzo se re-subía en cada cuadro. Cuanto más lento
    // iba, más trabajo se daba. Un lazo de realimentación de manual.
    const dt = Math.min(0.1, (now - tPrev) / 1000);
    tPrev = now;

    frames++;
    if (now - fpsT > 900) {
      const fps = (frames * 1000) / (now - fpsT);
      frames = 0;
      fpsT = now;
      capFps.textContent = Math.round(fps) + " fps";
      if (!judged && t > 2.4) {
        judged = true;
        if (fps < 45) {
          renderer.setPixelRatio(1);
          sheenMesh.visible = false;
          barraMesh.visible = false;
          diag.textContent = "menos de 45 fps → dpr 1, sin reflejos de cristal";
        } else
          diag.textContent =
            "WebGL2 · " +
            Math.round(fps) +
            " fps · dpr " +
            DPR +
            " · teléfono de producción" +
            (mem ? " · " + mem + "GB" : "");
      }
    }

    const ang = reduced ? ANGULO_QUIETO : anguloEn(t);
    pt.x += (pt.tx - pt.x) * 0.045;
    pt.y += (pt.ty - pt.y) * 0.045;
    rig.rotation.y = THREE.MathUtils.degToRad(ang) + pt.x * 0.16;
    rig.rotation.x = THREE.MathUtils.degToRad(reduced ? 4.5 : cabeceoEn(t)) - pt.y * 0.09;
    rig.rotation.z = THREE.MathUtils.degToRad(-1.5);
    rig.position.y = reduced ? 0 : Math.sin((t / FLOTE_SEG) * Math.PI * 2) * 0.09;

    /* Con la vuelta entera el ángulo barría 360°; ahora vive en unos 38°, así que los mismos
     multiplicadores dejaban el cristal apagado. Se suben para que el reflejo siga BARRIENDO
     de verdad dentro del rango corto — es lo que delata que hay vidrio y no una calcomanía. */
    const frente = Math.max(0, Math.cos(rig.rotation.y));
    const oblicuo = frente * Math.abs(Math.sin(rig.rotation.y));
    sheenMesh.material.opacity = 0.02 * frente + 0.3 * oblicuo;
    barraMesh.material.map.offset.y = -rig.rotation.y * 1.9 + 0.16;
    barraMesh.material.map.repeat.y = 1.35;
    barraMesh.material.opacity = 0.07 * frente + 0.85 * oblicuo;

    /* La sombra se corre con la inclinación. Una sombra clavada mientras el objeto se mueve
     es de las cosas que el ojo detecta sin saber por qué. */
    if (sombraMesh) {
      sombraMesh.position.x = -Math.sin(rig.rotation.y) * 0.55;
      sombraMesh.material.opacity = 0.78 + 0.22 * frente;
    }

    if (!reduced) {
      camera.position.x = Math.sin(t * 0.27) * 0.16 + Math.sin(t * 0.61) * 0.07;
      camera.position.y = 0.15 + Math.cos(t * 0.34) * 0.12 + Math.sin(t * 0.83) * 0.05;
      camera.lookAt(0, 0.05, 0);
    }

    panelT += dt;
    if (panelT > 7) {
      panelT = 0;
      panel = (panel + 1) % 3;
      capL.textContent = PANELS[panel];
      redibujar = true;
    }
    if (redibujar || panelT < 2.2) {
      if (now - ultimoDibujo > 50) {
        drawPanel(panel, (panelT / 7) * 3);
        screenTex.needsUpdate = true;
        ultimoDibujo = now;
        redibujar = false;
      }
    }

    /* Sonda para la verificación automatizada del prototipo: deja a la vista el ángulo real y
     el supermuestreo elegido. Sale cuando esto pase al repo. */

    renderer.render(scene, camera);
  }
  requestAnimationFrame(tick);
}
