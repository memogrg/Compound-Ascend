#!/usr/bin/env bash
#
# `supabase start` con reintentos, para el rate limit de ghcr.io en los runners de GitHub.
#
# Los reintentos son la RED, no el arreglo: el arreglo es el registro (ver el `env` del
# workflow) y la caché de imágenes. Esto cubre el caso en que, aun así, un registro público
# tenga un mal minuto.
#
# Espera CRECIENTE y no fija. Con 30 s fijos, la corrida #1741 gastó cinco intentos en cuatro
# minutos contra un limitador que seguía activo: reintentar rápido contra algo que limita por
# tiempo es pedirle que te siga diciendo que no. Doblando la espera —30, 60, 120, 240— el
# último intento cae ocho minutos después del primero, que es cuando una ventana de cuota ya
# ha rotado.
#
# Esto NO enmascara fallos: si se agotan los intentos, el script sale con 1 y el job cae. Un
# error real de configuración falla igual en el primer intento y se reintentaría en vano; a
# cambio, un job que hoy no arranca vuelve a arrancar. El coste es tiempo en el caso malo.
#
# Uso:  scripts/ci/supabase-start.sh [argumentos de `supabase start`…]
set -uo pipefail

INTENTOS="${SUPABASE_START_INTENTOS:-5}"
# Primera espera; se dobla en cada intento fallido.
ESPERA="${SUPABASE_START_ESPERA:-30}"

for i in $(seq 1 "$INTENTOS"); do
  if supabase start "$@"; then
    echo "::notice::supabase start levantó el stack en el intento $i de $INTENTOS"
    exit 0
  fi

  if [ "$i" -eq "$INTENTOS" ]; then
    echo "::error::supabase start falló en los $INTENTOS intentos. Si el log dice 'toomanyrequests', es el limitador de ghcr.io sobre la IP del runner y no este repo."
    exit 1
  fi

  echo "::warning::intento $i de $INTENTOS falló; se reintenta en ${ESPERA}s (la espera se dobla en cada intento)"
  # Dejar contenedores a medio arrancar hace que el siguiente intento falle por otra razón.
  # `if !` y no `|| true`: no hay stack que parar en el primer intento, y eso no es un error.
  if ! supabase stop --no-backup; then
    echo "no había stack que parar"
  fi
  sleep "$ESPERA"
  ESPERA=$((ESPERA * 2))
done
