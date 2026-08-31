"use client";

/**
 * EL TELÉFONO DEL HERO — three.js vanilla, sin react-three-fiber.
 *
 * Es una escena sola que se arma una vez y se dibuja en un rAF; envolverla en un reconciliador de
 * React no compraría nada y sumaría dos dependencias grandes al bundle de la landing.
 *
 * `three` viene de node_modules, NUNCA de un CDN: la CSP del sitio es `script-src 'self'`
 * (src/lib/security/headers.ts), así que un importmap a un CDN quedaría bloqueado en producción —
 * y en local funcionaría igual, que es la peor combinación posible.
 *
 * EL ÁNGULO LO MANDA EL TIEMPO, no el scroll. Un ciclo de 26 s: un vaivén corto que deja leer la
 * pantalla y después UNA vuelta completa que muestra la trasera alpine green. La vuelta cierra en
 * −368°, que es −8° más un giro entero: el ciclo empieza donde terminó y no se ve el corte.
 *
 * La escena vive DENTRO de su caja del hero, en el flujo normal de la página. No se superpone al
 * copy ni a los botones: el teléfono es un bloque más de la columna, como en el artboard.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { dibujarPantalla } from "@/components/marketing/phone-3d/screen-texture";

/** Medidas del cuerpo: ancho, alto, grosor, radio de esquina y el bisel del borde. */
const W = 3.04;
const H = 6.3;
const T = 0.36;
const R = 0.54;
const BEV = 0.085;

/**
 * Los hitos del ciclo: [instante 0..1, grados]. Primero un vaivén corto —el teléfono se asoma de un
 * lado y del otro sin llegar a girar— y recién después la vuelta entera.
 *
 * El último hito es −368° y no −360° a propósito: son los −8° del arranque más una vuelta completa,
 * así el final del ciclo coincide exactamente con su principio y el salto no se ve.
 */
const HITOS: readonly (readonly [number, number])[] = [
  [0, -8],
  [0.13, -36],
  [0.26, -8],
  [0.39, -34],
  [0.52, -10],
  [0.76, -188],
  [1, -368],
];

/** Período del flote vertical, en segundos. Distinto al del ciclo para que los dos movimientos no
 *  se sincronicen y se lean como un solo rebote mecánico. */
const FLOTE_SEG = 6.5;

/** Ángulo fijo en reduced-motion: un tres cuartos que muestra frente y canto, sin movimiento. */
const ANGULO_QUIETO = -25;

/** Suavizado de cada tramo: arranca y frena despacio, así el giro no se ve motorizado. */
const suavizar = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** El ángulo en grados para un avance `u` del ciclo (0..1), interpolando entre hitos. */
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

export type Phone3DProps = {
  /** Congela la animación sin desmontar la escena (deja el último frame dibujado). */
  paused?: boolean;
  /** Duración del ciclo completo (vaivén + vuelta), en segundos. */
  cycleSeconds?: number;
};

export function Phone3D({ paused = false, cycleSeconds = 26 }: Phone3DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  // Por ref y no como dependencia del efecto: cambiar el ciclo no tiene por qué desarmar la escena.
  const cicloRef = useRef(cycleSeconds);
  cicloRef.current = cycleSeconds > 0 ? cycleSeconds : 26;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Sin WebGL no hay escena. No se dibuja un teléfono de reemplazo: el contenedor ya reserva el
    // alto y deja la sombra de piso, así que el layout no se mueve (CLS 0) y el hero sigue leyéndose.
    if (typeof WebGLRenderingContext === "undefined") return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      return;
    }

    const consultaMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)");
    let sinMovimiento = consultaMovimiento.matches;
    const alCambiarMovimiento = (e: MediaQueryListEvent) => {
      sinMovimiento = e.matches;
    };
    consultaMovimiento.addEventListener("change", alCambiarMovimiento);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
    camera.position.set(0, 0.15, 13.2);

    // Entorno para los reflejos: sin él, el metal del marco y el vidrio de los lentes se ven planos.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const entorno = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = entorno;

    const luzPrincipal = new THREE.DirectionalLight(0xffffff, 1.1);
    luzPrincipal.position.set(4, 6, 6);
    scene.add(luzPrincipal);
    const luzRelleno = new THREE.DirectionalLight(0xdfe8df, 0.35);
    luzRelleno.position.set(-5, -2, 4);
    scene.add(luzRelleno);

    const frameMat = new THREE.MeshPhysicalMaterial({
      color: 0x8b968a,
      metalness: 0.92,
      roughness: 0.28,
      clearcoat: 0.6,
      clearcoatRoughness: 0.25,
    });
    const backMat = new THREE.MeshPhysicalMaterial({
      color: 0x4e5c4a,
      metalness: 0.12,
      roughness: 0.42,
      clearcoat: 0.55,
      clearcoatRoughness: 0.32,
      sheen: 0.3,
      sheenColor: new THREE.Color(0x9fb59a),
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
    const glintMat = new THREE.MeshBasicMaterial({ color: 0xdfe9f5 });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x101410,
      roughness: 0.55,
      metalness: 0.2,
    });

    const phone = new THREE.Group();
    const rig = new THREE.Group();
    rig.add(phone);
    scene.add(rig);

    /** Silueta de esquinas redondeadas: la base de casi todas las piezas planas del teléfono. */
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

    // Cuerpo: extrusión con bisel. El bisel es lo que hace que el canto atrape la luz al girar —
    // sin él el teléfono se lee como una caja.
    {
      const shape = siluetaRedondeada(W - 2 * BEV, H - 2 * BEV, R - BEV);
      const geo = new THREE.ExtrudeGeometry(shape, {
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
      const shape = siluetaRedondeada(W - 0.1, H - 0.1, R - 0.06);
      const geo = new THREE.ExtrudeGeometry(shape, {
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

    // Marco negro + pantalla.
    let screenTex: THREE.CanvasTexture | null = null;
    {
      const bezShape = siluetaRedondeada(W - 0.14, H - 0.14, R - 0.08);
      const bezGeo = new THREE.ExtrudeGeometry(bezShape, {
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

      const scrShape = siluetaRedondeada(2.84, 6.1, 0.45);
      const scrGeo = new THREE.ShapeGeometry(scrShape, 36);
      // `ShapeGeometry` genera UVs en coordenadas del mundo: hay que remapearlas al 0..1 de la
      // pantalla o la textura sale corrida y a otra escala.
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
      const lienzo = dibujarPantalla();
      if (lienzo) {
        screenTex = new THREE.CanvasTexture(lienzo);
        screenTex.colorSpace = THREE.SRGBColorSpace;
        screenTex.anisotropy = 8;
      }
      const scrMat = new THREE.MeshPhysicalMaterial({
        map: screenTex,
        roughness: 0.22,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.12,
      });
      const scr = new THREE.Mesh(scrGeo, scrMat);
      scr.position.z = T / 2 + 0.006;
      phone.add(scr);
    }

    // Módulo de cámara: la pieza que vende la trasera cuando el teléfono termina de girar.
    {
      const mod = new THREE.Group();
      const pShape = siluetaRedondeada(1.3, 1.3, 0.33);
      const pGeo = new THREE.ExtrudeGeometry(pShape, {
        depth: 0.05,
        bevelEnabled: true,
        bevelThickness: 0.035,
        bevelSize: 0.035,
        bevelSegments: 5,
        curveSegments: 28,
      });
      pGeo.center();
      mod.add(new THREE.Mesh(pGeo, plateauMat));

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
        const iris = new THREE.Mesh(
          new THREE.CircleGeometry(0.1, 32),
          new THREE.MeshPhysicalMaterial({
            color: 0x18233a,
            roughness: 0.1,
            metalness: 0.5,
            envMapIntensity: 2,
          }),
        );
        iris.position.z = 0.095;
        u.add(iris);
        const brillo = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), glintMat);
        brillo.position.set(-0.06, 0.06, 0.115);
        u.add(brillo);
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

    // Botones laterales: volumen y encendido.
    const boton = (largo: number, y: number, lado: 1 | -1): void => {
      const g = new RoundedBoxGeometry(0.11, largo, 0.11, 4, 0.05);
      const b = new THREE.Mesh(g, frameMat);
      b.position.set(lado * (W / 2), y, 0);
      phone.add(b);
    };
    boton(0.3, 1.46, -1);
    boton(0.52, 0.92, -1);
    boton(0.52, 0.3, -1);
    boton(0.86, 0.55, 1);

    // Sombra de contacto: un plano en el piso con un degradado radial. Va en la escena y NO en el
    // rig, así se queda quieta mientras el teléfono gira encima — si girara con él, se leería como
    // una mancha pegada al aparato en vez de como su sombra.
    let sombraTex: THREE.CanvasTexture | null = null;
    {
      const cv = document.createElement("canvas");
      cv.width = 256;
      cv.height = 256;
      const g = cv.getContext("2d");
      if (g) {
        const rad = g.createRadialGradient(128, 128, 10, 128, 128, 120);
        rad.addColorStop(0, "rgba(18,26,18,0.34)");
        rad.addColorStop(0.55, "rgba(18,26,18,0.12)");
        rad.addColorStop(1, "rgba(18,26,18,0)");
        g.fillStyle = rad;
        g.fillRect(0, 0, 256, 256);
        sombraTex = new THREE.CanvasTexture(cv);
        const sombra = new THREE.Mesh(
          new THREE.PlaneGeometry(4.6, 1.6),
          new THREE.MeshBasicMaterial({ map: sombraTex, transparent: true, depthWrite: false }),
        );
        sombra.rotation.x = -Math.PI / 2;
        sombra.position.y = -3.62;
        scene.add(sombra);
      }
    }

    canvas.classList.add("on");

    const clock = new THREE.Clock();
    let rafId = 0;
    const tick = (): void => {
      rafId = requestAnimationFrame(tick);
      if (pausedRef.current) return;

      const t = clock.getElapsedTime();
      const avance = (t % cicloRef.current) / cicloRef.current;
      rig.rotation.y = THREE.MathUtils.degToRad(sinMovimiento ? ANGULO_QUIETO : anguloEn(avance));
      rig.rotation.x = THREE.MathUtils.degToRad(4.5);
      rig.rotation.z = THREE.MathUtils.degToRad(-1.5);
      rig.position.y = sinMovimiento ? 0 : Math.sin((t / FLOTE_SEG) * Math.PI * 2) * 0.09;

      renderer.render(scene, camera);
    };

    const redimensionar = (): void => {
      const cont = canvas.parentElement;
      if (!cont) return;
      const w = cont.clientWidth;
      const h = cont.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      // La cámara no se mueve con el ancho: el `fov` es VERTICAL, así que el alto visible (≈7,07 u)
      // no depende del aspecto, y el cuerpo mide 6,30 u. El teléfono entra siempre, y la caja del
      // hero ya lo acota por CSS — mover la cámara acá solo desincronizaría el encuadre.
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    const ro = new ResizeObserver(redimensionar);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    redimensionar();
    tick();

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      consultaMovimiento.removeEventListener("change", alCambiarMovimiento);
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
      screenTex?.dispose();
      sombraTex?.dispose();
      entorno.dispose();
      pmrem.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="lp-gl" aria-hidden="true" />;
}

export default Phone3D;
