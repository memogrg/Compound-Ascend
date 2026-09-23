#!/usr/bin/env bash
#
# Caché de las imágenes del stack de Supabase entre corridas de CI.
#
# Por qué existe, aunque el registro ya no sea el problema: mientras el job dependa de
# DESCARGAR trece —o una— imágenes de un registro público, depende de que ese registro
# esté de buenas. La caché de Actions convierte esa dependencia en una copia local.
#
# `cargar <tarball>`   — si el tarball existe, lo mete en el daemon y dice cuánto pesaba.
# `guardar <tarball>`  — exporta las imágenes que el stack tiene EN USO ahora mismo.
#
# Las imágenes se descubren del disco (`docker images`) en vez de escribirlas a mano: la
# lista y los tags los decide la versión del CLI, y una lista hardcodeada se queda vieja en
# silencio en cuanto alguien sube esa versión.
#
# `docker images` y NO `docker ps`, que fue el primer intento y guardaba de menos: `-x`
# excluye servicios de ARRANCAR, pero el CLI descarga igualmente más imágenes de las que
# levanta. En el job de migraciones corría 1 contenedor y se habían descargado 4, así que la
# caché dejaba fuera 3 y la corrida siguiente volvía a bajarlas.
set -uo pipefail

MODO="${1:-}"
TARBALL="${2:-}"

if [ -z "$MODO" ] || [ -z "$TARBALL" ]; then
  echo "uso: $0 cargar|guardar <tarball>" >&2
  exit 2
fi

case "$MODO" in
  cargar)
    if [ ! -f "$TARBALL" ]; then
      echo "::notice::sin caché de imágenes ($TARBALL); esta corrida las descarga y deja la caché lista para la siguiente"
      exit 0
    fi
    TAM=$(du -h "$TARBALL" | cut -f1)
    echo "::notice::cargando imágenes desde la caché ($TAM)"
    INICIO=$(date +%s)
    docker load --input "$TARBALL"
    echo "::notice::imágenes cargadas en $(($(date +%s) - INICIO))s"
    ;;

  guardar)
    # Todas las del stack que hayan acabado en disco, estén corriendo o no.
    mapfile -t IMAGENES < <(
      docker images --format '{{.Repository}}:{{.Tag}}' |
        grep -E '^(public\.ecr\.aws/supabase|ghcr\.io/supabase|supabase)/' |
        grep -v ':<none>$' |
        sort -u
    )
    if [ "${#IMAGENES[@]}" -eq 0 ]; then
      echo "::warning::no hay imágenes del stack en disco; no se guarda caché"
      exit 0
    fi
    echo "::notice::guardando ${#IMAGENES[@]} imágenes: ${IMAGENES[*]}"
    INICIO=$(date +%s)
    mkdir -p "$(dirname "$TARBALL")"
    # Sin comprimir a propósito: actions/cache ya comprime con zstd al subir, y hacerlo
    # dos veces solo añade minutos de CPU para ganar nada.
    docker save --output "$TARBALL" "${IMAGENES[@]}"
    echo "::notice::caché escrita en $(($(date +%s) - INICIO))s · $(du -h "$TARBALL" | cut -f1)"
    ;;

  *)
    echo "modo desconocido: $MODO" >&2
    exit 2
    ;;
esac
