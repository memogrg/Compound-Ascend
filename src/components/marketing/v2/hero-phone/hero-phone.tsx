"use client";

/**
 * EL TELÉFONO DEL HERO v2 — three.js vanilla, sin react-three-fiber.
 *
 * Hereda la geometría, los materiales y el ciclo de giro del componente de producción
 * (`marketing/phone-3d/phone-3d.tsx`) y le suma lo que salió del prototipo de la Fase 3:
 *
 *  · Escenario CLARO. El teléfono flota sobre papel crema dentro de la escena, no sobre negro.
 *    Las luces bajaron de golpe respecto del prototipo oscuro: con las de antes el aluminio se
 *    quemaba y el aparato se leía como un maniquí hueco.
 *  · Objetivos de cámara con textura procedural — barril con anillos concéntricos, tinte de
 *    recubrimiento antirreflejo y un reflejo chico y descentrado. El punto celeste centrado del
 *    componente viejo es exactamente lo que hacía que los lentes parecieran plástico.
 *  · Micro-rugosidad en el marco y la trasera: un `roughness` constante es la firma del CGI.
 *  · Dos capas de cristal encima de la pantalla —huellas y barra de estudio— con opacidad regida
 *    por el ÁNGULO, no por el reloj: el reflejo barre cuando el teléfono gira, como pasaría de
 *    verdad.
 *  · Mipmaps + anisotropía en la textura de pantalla. Sin ellos, 1080 px de textura reducidos a
 *    ~350 en pantalla se alían y el texto sale con dientes.
 *
 * `three` viene de node_modules, NUNCA de un CDN: la CSP del sitio es `script-src 'self'`
 * (src/lib/security/headers.ts), así que un importmap a un CDN quedaría bloqueado en producción.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { crearLienzo, PANELES, SEG_POR_PANEL } from "./panels";

/** Medidas del cuerpo: ancho, alto, grosor, radio de esquina y bisel del canto. */
const W = 3.04;
const H = 6.3;
const T = 0.36;
const R = 0.54;
const BEV = 0.085;

/** Hitos del ciclo: [instante 0..1, grados]. Vaivén corto y después UNA vuelta entera. El último
 *  hito es −368° = −8° + 360°, así el final del ciclo coincide con su principio y no se ve el corte. */
const HITOS: readonly (readonly [number, number])[] = [
  [0, -8],
  [0.13, -36],
  [0.26, -8],
  [0.39, -34],
  [0.52, -10],
  [0.76, -188],
  [1, -368],
];

const FLOTE_SEG = 6.5;
const ANGULO_QUIETO = -25;
const CICLO = 26;

const suavizar = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function anguloEn(u: number): number {
  for (let i = 1; i < HITOS.length; i += 1) {
    const previo = HITOS[i - 1];
    const actual = HITOS[i];
    if (!previo || !actual) break;
    if (u <= actual[0]) {
      const [t0, a0] = previo;
      const [t1, a1] = actual;
      return a0 + (a1 - a0) * suavizar((u - t0) / (t1 - t0));
    }
  }
  return HITOS[HITOS.length - 1]?.[1] ?? ANGULO_QUIETO;
}

/** Silueta de esquinas redondeadas: la base de casi todas las piezas planas. */
function siluetaRedondeada(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
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

export function HeroPhone() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = canvas?.parentElement;
    if (!canvas || !stage) return;

    // ── Compuerta del 3D ────────────────────────────────────────────────────────────────────────
    // Si el equipo no da, no se dibuja nada: la tarjeta estática que ya está en el DOM se queda,
    // el alto no cambia y el hero se lee igual. Es la misma regla del presupuesto de performance.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (!document.createElement("canvas").getContext("webgl2")) return;
    if (mem !== undefined && mem < 4) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      return;
    }

    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(DPR);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
    camera.position.set(0, 0.15, 13.8);

    // Piezas a liberar al desmontar que no cuelgan de la escena.
    const texturas: THREE.Texture[] = [];

    // ── Entorno de estudio ──────────────────────────────────────────────────────────────────────
    // Un equirectangular dibujado a mano: claro arriba, oscuro abajo, dos cajas de luz que dibujan
    // el filo del marco y un rebote verde bajo. Es lo que hace que el aluminio parezca metal.
    const pmrem = new THREE.PMREMGenerator(renderer);
    {
      const e = document.createElement("canvas");
      e.width = 256;
      e.height = 128;
      const c = e.getContext("2d");
      if (c) {
        const g = c.createLinearGradient(0, 0, 0, 128);
        g.addColorStop(0, "#e9e6dd");
        g.addColorStop(0.42, "#8e8a80");
        g.addColorStop(0.72, "#3b3934");
        g.addColorStop(1, "#1d1c18");
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
        c.ellipse(62, 100, 54, 12, 0, 0, Math.PI * 2);
        c.fill();
      }
      const tex = new THREE.CanvasTexture(e);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      pmrem.compileEquirectangularShader();
      scene.environment = pmrem.fromEquirectangular(tex).texture;
      tex.dispose();
    }

    const luzPrincipal = new THREE.DirectionalLight(0xffffff, 1.1);
    luzPrincipal.position.set(4, 6, 6);
    scene.add(luzPrincipal);
    const luzRelleno = new THREE.DirectionalLight(0xdfe8df, 0.35);
    luzRelleno.position.set(-5, -2, 4);
    scene.add(luzRelleno);

    /** Micro-rugosidad: sin esto el marco tiene un brillo perfectamente parejo y se ve renderizado. */
    function mapaRugosidad(amp: number, veta: number, rep: number): THREE.CanvasTexture | null {
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 256;
      const g = c.getContext("2d");
      if (!g) return null;
      const img = g.createImageData(256, 256);
      const d = img.data;
      for (let i = 0; i < 65536; i += 1) {
        const y = (i / 256) | 0;
        const v = Math.max(
          0,
          Math.min(255, 128 + (Math.random() - 0.5) * amp * 255 + Math.sin(y * veta) * amp * 90),
        );
        d[i * 4] = v;
        d[i * 4 + 1] = v;
        d[i * 4 + 2] = v;
        d[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      const t = new THREE.CanvasTexture(c);
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rep, rep * 2);
      texturas.push(t);
      return t;
    }

    /**
     * La textura del objetivo. Se dibuja una vez y la comparten los tres lentes.
     *
     * Un objetivo real tiene barril casi negro, ANILLOS concéntricos que dan profundidad, tinte de
     * las capas antirreflejo (verde de un lado, violeta del otro) y un reflejo chico, alargado y
     * FUERA de eje. Un punto claro en el centro se lee como un LED, no como vidrio.
     */
    function texturaLente(): THREE.CanvasTexture | null {
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 256;
      const g = c.getContext("2d");
      if (!g) return null;
      const C = 128;
      const TAU = Math.PI * 2;

      const pozo = g.createRadialGradient(C, C, 4, C, C, 126);
      pozo.addColorStop(0, "#020406");
      pozo.addColorStop(0.55, "#070b12");
      pozo.addColorStop(0.88, "#121a26");
      pozo.addColorStop(1, "#1c2534");
      g.fillStyle = pozo;
      g.beginPath();
      g.arc(C, C, 126, 0, TAU);
      g.fill();

      [118, 104, 92, 74, 58, 40].forEach((r, i) => {
        g.strokeStyle = i % 2 ? "rgba(140,170,200,.10)" : "rgba(0,0,0,.55)";
        g.lineWidth = i % 2 ? 1.2 : 2.4;
        g.beginPath();
        g.arc(C, C, r, 0, TAU);
        g.stroke();
      });

      const verde = g.createRadialGradient(96, 104, 2, 96, 104, 74);
      verde.addColorStop(0, "rgba(92,190,140,.30)");
      verde.addColorStop(1, "rgba(92,190,140,0)");
      g.fillStyle = verde;
      g.beginPath();
      g.arc(C, C, 122, 0, TAU);
      g.fill();
      const violeta = g.createRadialGradient(168, 158, 2, 168, 158, 62);
      violeta.addColorStop(0, "rgba(150,120,210,.22)");
      violeta.addColorStop(1, "rgba(150,120,210,0)");
      g.fillStyle = violeta;
      g.beginPath();
      g.arc(C, C, 122, 0, TAU);
      g.fill();

      g.save();
      g.translate(92, 88);
      g.rotate(-0.6);
      const brillo = g.createRadialGradient(0, 0, 0, 0, 0, 26);
      brillo.addColorStop(0, "rgba(255,255,255,.92)");
      brillo.addColorStop(0.35, "rgba(226,238,255,.35)");
      brillo.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = brillo;
      g.beginPath();
      g.ellipse(0, 0, 26, 12, 0, 0, TAU);
      g.fill();
      g.restore();

      const b2 = g.createRadialGradient(158, 176, 0, 158, 176, 9);
      b2.addColorStop(0, "rgba(255,255,255,.55)");
      b2.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = b2;
      g.beginPath();
      g.arc(158, 176, 9, 0, TAU);
      g.fill();

      g.globalCompositeOperation = "destination-in";
      g.beginPath();
      g.arc(C, C, 126, 0, TAU);
      g.fill();
      g.globalCompositeOperation = "source-over";

      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = maxAniso;
      texturas.push(t);
      return t;
    }

    // ── Materiales ──────────────────────────────────────────────────────────────────────────────
    const rugMarco = mapaRugosidad(0.2, 2.6, 3);
    const rugTrasera = mapaRugosidad(0.13, 0.8, 2);
    const frameMat = new THREE.MeshPhysicalMaterial({
      color: 0x8b968a,
      metalness: 0.92,
      roughness: 0.28,
      clearcoat: 0.6,
      clearcoatRoughness: 0.25,
      roughnessMap: rugMarco,
    });
    const backMat = new THREE.MeshPhysicalMaterial({
      color: 0x4e5c4a,
      metalness: 0.12,
      roughness: 0.42,
      clearcoat: 0.55,
      clearcoatRoughness: 0.32,
      sheen: 0.3,
      sheenColor: new THREE.Color(0x9fb59a),
      roughnessMap: rugTrasera,
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

    const phone = new THREE.Group();
    const rig = new THREE.Group();
    rig.add(phone);
    scene.add(rig);

    // Cuerpo: extrusión con bisel. El bisel es lo que hace que el canto atrape la luz al girar.
    {
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
    }

    // Trasera de vidrio alpine green.
    {
      const geo = new THREE.ExtrudeGeometry(siluetaRedondeada(W - 0.1, H - 0.1, R - 0.06), {
        depth: 0.012,
        bevelEnabled: false,
        curveSegments: 36,
      });
      geo.center();
      const vidrio = new THREE.Mesh(geo, backMat);
      vidrio.position.z = -(T / 2 - 0.02);
      vidrio.rotation.y = Math.PI;
      phone.add(vidrio);
    }

    // ── Pantalla: marco negro, panel emisivo y las dos capas de cristal ─────────────────────────
    const lienzo = crearLienzo();
    let screenTex: THREE.CanvasTexture | null = null;
    let sheenMat: THREE.MeshBasicMaterial | null = null;
    let barraMat: THREE.MeshBasicMaterial | null = null;
    {
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

      const scrGeo = new THREE.ShapeGeometry(siluetaRedondeada(2.84, 6.1, 0.45), 36);
      // `ShapeGeometry` genera UVs en coordenadas del mundo: hay que remapearlas al 0..1 o la
      // textura sale corrida y a otra escala.
      {
        const uv = scrGeo.attributes.uv;
        const pos = scrGeo.attributes.position;
        if (uv && pos) {
          for (let i = 0; i < uv.count; i += 1) {
            uv.setXY(i, (pos.getX(i) + 1.42) / 2.84, (pos.getY(i) + 3.05) / 6.1);
          }
          uv.needsUpdate = true;
        }
      }

      if (lienzo) {
        screenTex = new THREE.CanvasTexture(lienzo.canvas);
        screenTex.colorSpace = THREE.SRGBColorSpace;
        screenTex.anisotropy = maxAniso;
        // Mipmaps SÍ: sin ellos, 1080 px de textura reducidos a ~350 en pantalla se alían y el
        // texto sale con dientes. Trilineal + anisotropía = letras suaves a cualquier ángulo.
        screenTex.generateMipmaps = true;
        screenTex.minFilter = THREE.LinearMipmapLinearFilter;
        screenTex.magFilter = THREE.LinearFilter;
      }
      // Sin iluminar: un panel encendido EMITE. Con material físico las luces lo lavan y el texto
      // deja de leerse. El reflejo vive en las dos capas de arriba, no en el panel.
      const scr = new THREE.Mesh(
        scrGeo,
        new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }),
      );
      scr.position.z = T / 2 + 0.006;
      phone.add(scr);

      // Huellas y velo del cristal.
      {
        const hc = document.createElement("canvas");
        hc.width = 256;
        hc.height = 512;
        const hg = hc.getContext("2d");
        if (hg) {
          const lg = hg.createLinearGradient(0, 0, 256, 512);
          lg.addColorStop(0, "rgba(255,255,255,0)");
          lg.addColorStop(0.32, "rgba(255,255,255,.62)");
          lg.addColorStop(0.44, "rgba(255,255,255,.08)");
          lg.addColorStop(0.6, "rgba(255,255,255,.38)");
          lg.addColorStop(0.76, "rgba(255,255,255,0)");
          hg.fillStyle = lg;
          hg.fillRect(0, 0, 256, 512);
          for (let k = 0; k < 30; k += 1) {
            const hx = 26 + Math.random() * 200;
            const hy = 50 + Math.random() * 420;
            const rad = 12 + Math.random() * 26;
            const sg = hg.createRadialGradient(hx, hy, 0, hx, hy, rad);
            sg.addColorStop(0, "rgba(255,255,255,.09)");
            sg.addColorStop(0.7, "rgba(255,255,255,.03)");
            sg.addColorStop(1, "rgba(255,255,255,0)");
            hg.fillStyle = sg;
            hg.beginPath();
            hg.ellipse(hx, hy, rad, rad * 0.72, Math.random() * 3, 0, Math.PI * 2);
            hg.fill();
          }
        }
        const hTex = new THREE.CanvasTexture(hc);
        texturas.push(hTex);
        sheenMat = new THREE.MeshBasicMaterial({
          map: hTex,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const sheen = new THREE.Mesh(scrGeo.clone(), sheenMat);
        sheen.position.z = T / 2 + 0.0075;
        phone.add(sheen);
      }

      // Barra de estudio: se refleja y BARRE según el ángulo, no según el reloj.
      {
        const bc = document.createElement("canvas");
        bc.width = 64;
        bc.height = 512;
        const bg = bc.getContext("2d");
        if (bg) {
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
        }
        const barraTex = new THREE.CanvasTexture(bc);
        barraTex.wrapS = THREE.RepeatWrapping;
        barraTex.wrapT = THREE.RepeatWrapping;
        texturas.push(barraTex);
        barraMat = new THREE.MeshBasicMaterial({
          map: barraTex,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const barra = new THREE.Mesh(scrGeo.clone(), barraMat);
        barra.position.z = T / 2 + 0.008;
        phone.add(barra);
      }
    }

    // ── Módulo de cámara ───────────────────────────────────────────────────────────────────────
    {
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

      const irisTex = texturaLente();
      const irisMat = new THREE.MeshBasicMaterial({
        map: irisTex,
        transparent: true,
        toneMapped: false,
      });

      const lente = (x: number, y: number): THREE.Group => {
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
        const iris = new THREE.Mesh(new THREE.CircleGeometry(0.135, 48), irisMat);
        iris.position.z = 0.092;
        u.add(iris);
        u.position.set(x, y, 0.055);
        return u;
      };
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

      const lidar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.065, 0.03, 32),
        lensInnerMat,
      );
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
    }

    // Botones laterales.
    {
      const boton = (largo: number, y: number, lado: 1 | -1): void => {
        const b = new THREE.Mesh(new RoundedBoxGeometry(0.11, largo, 0.11, 4, 0.05), frameMat);
        b.position.set(lado * (W / 2), y, 0);
        phone.add(b);
      };
      boton(0.3, 1.46, -1);
      boton(0.52, 0.92, -1);
      boton(0.52, 0.3, -1);
      boton(0.86, 0.55, 1);
    }

    // Sombra de contacto. Va en la escena y NO en el rig: si girara con el teléfono se leería como
    // una mancha pegada al aparato en vez de como su sombra.
    {
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 256;
      const g = c.getContext("2d");
      if (g) {
        const rad = g.createRadialGradient(128, 128, 10, 128, 128, 120);
        rad.addColorStop(0, "rgba(18,26,18,.34)");
        rad.addColorStop(0.55, "rgba(18,26,18,.12)");
        rad.addColorStop(1, "rgba(18,26,18,0)");
        g.fillStyle = rad;
        g.fillRect(0, 0, 256, 256);
      }
      const tex = new THREE.CanvasTexture(c);
      texturas.push(tex);
      const s = new THREE.Mesh(
        new THREE.PlaneGeometry(4.6, 1.6),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
      );
      s.rotation.x = -Math.PI / 2;
      s.position.y = -3.62;
      scene.add(s);
    }

    // Telón de papel DENTRO de la escena. En CSS quedaba por encima del teléfono en algunos
    // navegadores; acá además recibe la sombra y la cuadrícula se deforma con la perspectiva.
    {
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 512;
      const g = c.getContext("2d");
      if (g) {
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
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      texturas.push(tex);
      const telon = new THREE.Mesh(
        new THREE.PlaneGeometry(70, 70),
        new THREE.MeshBasicMaterial({ map: tex, depthWrite: false }),
      );
      telon.position.z = -18;
      scene.add(telon);
    }

    // ── Encuadre y entradas ────────────────────────────────────────────────────────────────────
    const redimensionar = (): void => {
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(redimensionar);
    ro.observe(stage);
    redimensionar();

    // Paralaje de mano: el encuadre responde al puntero (o a la inclinación del teléfono). Es un
    // desvío chico a propósito — de más se vuelve mareo.
    const pt = { x: 0, y: 0, tx: 0, ty: 0 };
    const alMover = (e: PointerEvent): void => {
      const r = stage.getBoundingClientRect();
      pt.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      pt.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    const alInclinar = (e: DeviceOrientationEvent): void => {
      if (e.gamma == null) return;
      pt.tx = Math.max(-1, Math.min(1, e.gamma / 26));
      pt.ty = Math.max(-1, Math.min(1, ((e.beta ?? 40) - 40) / 26));
    };
    window.addEventListener("pointermove", alMover, { passive: true });
    window.addEventListener("deviceorientation", alInclinar, { passive: true });

    // Fuera de vista no se dibuja: el hero deja de gastar batería en cuanto el visitante baja.
    let visible = true;
    const io = new IntersectionObserver(
      (en) => {
        visible = en[0]?.isIntersecting ?? true;
      },
      { threshold: 0.02 },
    );
    io.observe(stage);

    // El canvas 2D usa la fuente que HAYA en ese momento: si Sora y Manrope todavía no cargaron,
    // el texto sale en la de reemplazo y ya no se corrige solo. Por eso se fuerza un redibujado.
    let redibujar = true;
    if (document.fonts?.ready) {
      void document.fonts.ready.then(() => {
        redibujar = true;
      });
    }

    stage.dataset.gl = "on";

    // ── Bucle ──────────────────────────────────────────────────────────────────────────────────
    const t0 = performance.now();
    let tPrev = t0;
    let frames = 0;
    let fpsT = t0;
    let juzgado = false;
    let panel = 0;
    let panelT = 0;
    let ultimoDibujo = 0;
    let rafId = 0;

    const tick = (now: number): void => {
      rafId = requestAnimationFrame(tick);
      if (!visible) {
        fpsT = now;
        frames = 0;
        tPrev = now;
        return;
      }
      const t = (now - t0) / 1000;
      // Delta REAL, no 1/60 por cuadro. Con el paso fijo, al caer los fps el reloj del panel se
      // congelaba, la condición «sigo en la animación de entrada» nunca terminaba y el lienzo se
      // re-subía en cada cuadro: cuanto más lento iba, más trabajo se daba.
      const dt = Math.min(0.1, (now - tPrev) / 1000);
      tPrev = now;

      frames += 1;
      if (now - fpsT > 900) {
        const fps = (frames * 1000) / (now - fpsT);
        frames = 0;
        fpsT = now;
        // Una sola medición, pasados los primeros segundos: si el equipo no llega a 45 fps se baja
        // a dpr 1 y se apagan las dos capas de cristal, que es lo más caro de la escena.
        if (!juzgado && t > 2.4) {
          juzgado = true;
          if (fps < 45) {
            renderer.setPixelRatio(1);
            if (sheenMat) sheenMat.visible = false;
            if (barraMat) barraMat.visible = false;
            redimensionar();
          }
        }
      }

      const avance = (t % CICLO) / CICLO;
      const ang = reduced ? ANGULO_QUIETO : anguloEn(avance);
      pt.x += (pt.tx - pt.x) * 0.045;
      pt.y += (pt.ty - pt.y) * 0.045;
      rig.rotation.y = THREE.MathUtils.degToRad(ang) + pt.x * 0.16;
      rig.rotation.x = THREE.MathUtils.degToRad(4.5) - pt.y * 0.09;
      rig.rotation.z = THREE.MathUtils.degToRad(-1.5);
      rig.position.y = reduced ? 0 : Math.sin((t / FLOTE_SEG) * Math.PI * 2) * 0.09;

      const frente = Math.max(0, Math.cos(rig.rotation.y));
      const oblicuo = frente * Math.abs(Math.sin(rig.rotation.y));
      if (sheenMat) sheenMat.opacity = 0.012 * frente + 0.14 * oblicuo;
      if (barraMat?.map) {
        barraMat.map.offset.y = -rig.rotation.y * 0.62 + 0.18;
        barraMat.map.repeat.y = 1.35;
        barraMat.opacity = 0.05 * frente + 0.4 * oblicuo;
      }

      if (!reduced) {
        camera.position.x = Math.sin(t * 0.27) * 0.16 + Math.sin(t * 0.61) * 0.07;
        camera.position.y = 0.15 + Math.cos(t * 0.34) * 0.12 + Math.sin(t * 0.83) * 0.05;
        camera.lookAt(0, 0.05, 0);
      }

      if (lienzo && screenTex) {
        panelT += dt;
        if (panelT > SEG_POR_PANEL) {
          panelT = 0;
          panel = (panel + 1) % PANELES.length;
          redibujar = true;
        }
        // Solo se redibuja mientras algo se mueve dentro del panel. Después la textura se queda
        // quieta y no se vuelve a subir a la GPU.
        if ((redibujar || panelT < 2.2) && now - ultimoDibujo > 50) {
          lienzo.dibujar(panel, (panelT / SEG_POR_PANEL) * 3);
          screenTex.needsUpdate = true;
          ultimoDibujo = now;
          redibujar = false;
        }
      }

      renderer.render(scene, camera);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", alMover);
      window.removeEventListener("deviceorientation", alInclinar);
      delete stage.dataset.gl;
      // Cada geometría y material se libera una sola vez aunque estén compartidos entre mallas.
      const geos = new Set<THREE.BufferGeometry>();
      const mats = new Set<THREE.Material>();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) geos.add(m.geometry);
        if (m.material) {
          if (Array.isArray(m.material)) m.material.forEach((x) => mats.add(x));
          else mats.add(m.material);
        }
      });
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      texturas.forEach((t) => t.dispose());
      screenTex?.dispose();
      scene.environment?.dispose();
      pmrem.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="v2-gl" aria-hidden="true" />;
}

export default HeroPhone;
