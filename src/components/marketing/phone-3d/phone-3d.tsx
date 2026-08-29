"use client";

/**
 * EL TELÉFONO DEL HERO — three.js vanilla, sin react-three-fiber.
 *
 * Es una escena sola que se arma una vez y se dibuja en un rAF; envolverla en un reconciliador de
 * React no compraría nada y sumaría dos dependencias grandes al bundle de la landing.
 *
 * `three` viene de node_modules, NUNCA de un CDN: la CSP del sitio es `script-src 'self'`
 * (src/lib/security/headers.ts), así que el importmap a jsdelivr del diseño original quedaría
 * bloqueado en producción — y en local funcionaría igual, que es la peor combinación posible.
 *
 * LO QUE MANDA EL ÁNGULO ES EL SCROLL. El hero es un track alto con la escena `sticky` adentro; al
 * atravesarlo, el teléfono gira de −8° a −180° y termina mostrando la trasera alpine green. El
 * vaivén por tiempo solo existe arriba de todo (`1 − heroP*3`), para que la pieza no se vea muerta
 * antes de que el usuario empiece a bajar.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { subscribeHeroProgress } from "@/components/marketing/hero-progress";
import { dibujarPantalla } from "@/components/marketing/phone-3d/screen-texture";

/** Medidas del cuerpo: ancho, alto, grosor, radio de esquina y el bisel del borde. */
const W = 3.04;
const H = 6.3;
const T = 0.36;
const R = 0.54;
const BEV = 0.085;

/** Período del vaivén de giro, en segundos. Solo se nota arriba del hero. */
const IDLE_GIRO_SEG = 9;
/** Período del flote vertical, en segundos. Deliberadamente distinto al de giro: si coincidieran,
 *  los dos movimientos se sincronizarían y se leerían como un solo rebote mecánico. */
const IDLE_FLOTE_SEG = 6.5;

/** Ángulo fijo en reduced-motion: un tres cuartos que muestra frente y canto, sin movimiento. */
const ANGULO_QUIETO = -25;

export type Phone3DProps = {
  /** Congela la animación sin desmontar la escena (deja el último frame dibujado). */
  paused?: boolean;
};

export function Phone3D({ paused = false }: Phone3DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

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

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
    camera.position.set(0, 0.1, 13.4);

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

    let heroP = 0;
    const desuscribir = subscribeHeroProgress((p) => {
      heroP = p;
    });

    /** El ángulo del teléfono en grados: el scroll manda, el tiempo solo mece arriba de todo. */
    const anguloEn = (t: number): number => {
      const porScroll = -8 - heroP * 172;
      const vaiven = Math.sin((t / IDLE_GIRO_SEG) * Math.PI * 2) * 9 * Math.max(0, 1 - heroP * 3);
      return porScroll + vaiven;
    };

    canvas.classList.add("on");

    const clock = new THREE.Clock();
    let rafId = 0;
    const tick = (): void => {
      rafId = requestAnimationFrame(tick);
      if (pausedRef.current) return;

      const t = clock.getElapsedTime();
      rig.rotation.y = THREE.MathUtils.degToRad(sinMovimiento ? ANGULO_QUIETO : anguloEn(t));
      rig.rotation.x = THREE.MathUtils.degToRad(4.5);
      rig.rotation.z = THREE.MathUtils.degToRad(-1.5);
      rig.position.y = sinMovimiento ? 0 : Math.sin((t / IDLE_FLOTE_SEG) * Math.PI * 2) * 0.09;

      // El teléfono asoma desde abajo del copy a medida que arranca el recorrido, y crece un pelo.
      const subida = Math.min(1, heroP / 0.45);
      const suave = 1 - Math.pow(1 - subida, 3);
      rig.position.y += -3.15 * (1 - suave);
      rig.scale.setScalar(0.92 + suave * 0.07);

      renderer.render(scene, camera);
    };

    const redimensionar = (): void => {
      const cont = canvas.parentElement;
      if (!cont) return;
      const w = cont.clientWidth;
      const h = cont.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      // En pantallas angostas la cámara se aleja: si no, el teléfono se sale por los costados.
      camera.position.z = w < 560 ? 15.2 : 13.4;
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
      desuscribir();
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
      entorno.dispose();
      pmrem.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="lp-gl" aria-hidden="true" />;
}

export default Phone3D;
