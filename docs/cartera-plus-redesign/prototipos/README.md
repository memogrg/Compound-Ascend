# Prototipos de aprobación (fase de diseño)

Páginas HTML autocontenidas (se abren en cualquier navegador; ECharts se carga desde cdnjs). Son artefactos de decisión, no código de producción: en producción los gráficos de nivel 1 se hacen con Recharts 3 y los de nivel 2 con ECharts 6 modular, con los mismos tokens.

| Archivo | Qué es | Artifact |
| --- | --- | --- |
| `01-shell.html` | Shell de navegación A/B/C (escritorio y móvil, claro y oscuro) | https://claude.ai/artifact/A4nqpvEJTH5co3sGUgWaH8 |
| `02-dev-ui.html` | Las 8 primitivas y el lenguaje de gráficos (`/dev/ui`) | https://claude.ai/artifact/NuWuoNDAnW3gvfQw6zrfFV |
| `03-hoy.html` | Panel Hoy A/B/C sobre el shell recomendado | https://claude.ai/artifact/Mbhw3WTFdXFqWNiSYYt8Gk |
| `tokens.css` | Tokens del design system + tokens nuevos de gráfico y motion (claro/oscuro), listos para `globals.css` | — |

Datos: cuenta demo Familia Ramírez (Supabase prod, solo lectura), agosto 2026 tratado como mes en curso (día 16) porque la resiembra del 1 de septiembre dejó el mes real vacío.

Paleta de gráfico validada con el validador de la skill dataviz (ΔE ≥ 8 en pares adyacentes para protan/deutan/tritan, contraste ≥ 3:1):
- claro: `#378451 #3a6ea5 #c48a2e #7b5ea7 #c34f4b #0f9aa8`
- oscuro: `#3f9560 #5a8ccb #c4862c #9b7cc8 #d46460 #28a2b0`
