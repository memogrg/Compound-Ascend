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
# Las imágenes se descubren de los contenedores en marcha (`docker ps`) en vez de
# escribirlas a mano: la lista y los tags los decide la versión del CLI, y una lista
# hardcodeada se queda vieja en silencio en cuanto alguien sube esa versión.
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
    # `docker ps` y no `docker images`: interesan las que el stack levantó de verdad, no
    # todo lo que quedó en el disco del runner.
    mapfile -t IMAGENES < <(docker ps --format '{{.Image}}' | sort -u)
    if [ "${#IMAGENES[@]}" -eq 0 ]; then
      echo "::warning::no hay contenedores en marcha; no se guarda caché"
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
