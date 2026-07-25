import { dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import { FlatCompat } from "@eslint/eslintrc";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// Migración de `next lint` (eliminado en Next 16) a ESLint CLI con flat config. eslint-config-next
// 16 es flat-config nativo, así que sus configs se importan y expanden directo (envolverlas con
// FlatCompat rompe: el validador legacy revienta con la estructura circular del plugin de Next).
// Las reglas propias del repo siguen viviendo en `.eslintrc.json` como ÚNICA fuente de verdad; se
// leen de ahí y se adaptan al formato plano, para no duplicar los overrides de fronteras de módulos.
const baseDir = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: baseDir });
const eslintrc = JSON.parse(readFileSync(new URL("./.eslintrc.json", import.meta.url), "utf8"));

const eslintConfig = [
  // `next lint` ignoraba estos por defecto; en flat config hay que declararlo explícito.
  {
    ignores: [".next/**", "node_modules/**", "mobile-shell/**", "coverage/**", "next-env.d.ts"],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  // Reglas propias sobre TS: van DESPUÉS de next/typescript, que ya registra el plugin
  // @typescript-eslint para estos archivos (en flat config el rule necesita su plugin en scope).
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: eslintrc.rules,
  },
  // Overrides de fronteras de módulos (no-restricted-imports, regla CORE → sin plugin ni extends,
  // así FlatCompat no toca la config de Next). Cada override → un objeto plano { files, rules }.
  ...compat.config({ overrides: eslintrc.overrides }),
  // eslint-config-next 16 activó las reglas del React Compiler (react-hooks 7) y subió otras a
  // error. Adoptarlas implica refactorizar ~45 sitios de patrones que hoy funcionan (setState en
  // efecto de carga, Date.now en render…): es un pase propio, no parte del bump de versión. Se
  // mantienen en el nivel de Next 15 (off/warn). TODO: adoptarlas incrementalmente en su rama.
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/static-components": "off",
      "react-hooks/purity": "off",
      "react/useRef": "off",
      "react-hooks/exhaustive-deps": "warn",
      "import/no-anonymous-default-export": "warn",
    },
  },
  // Los tests usan `any` en mocks/stubs a propósito; `next lint` nunca los revisaba (solo `src`).
  {
    files: ["tests/**/*.ts", "tests/**/*.tsx"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
];

export default eslintConfig;
