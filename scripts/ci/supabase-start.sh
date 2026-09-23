#!/usr/bin/env bash
#
# `supabase start` con reintentos, para el rate limit de ghcr.io en los runners de GitHub.
#
# El límite es INTERMITENTE y PARCIAL: en la misma corrida, unas imágenes bajan («Status:
# Downloaded newer image for ghcr.io/supabase/storage-api») y otras rebotan con
# `toomanyrequests`. El CLI de Supabase reintenta UNA vez con 8 s de espera y después se
# rinde, así que basta con que una sola imagen tenga mala suerte para tumbar el job.
#
# Cada imagen que sí baja se queda en la caché local del daemon, de modo que cada intento
# arranca más cerca del final que el anterior. Por eso reintentar converge en vez de repetir
# el mismo trabajo.
#
# Esto NO enmascara fallos: si se agotan los intentos, el script sale con 1 y el job cae. Un
# error real de migración o de configuración falla igual en el primer intento… y sí, se
# reintentaría cuatro veces más antes de reportarlo; a cambio, un job que hoy no arranca
# nunca vuelve a arrancar. El coste es tiempo en el caso malo; el beneficio, un CI que
# existe.
#
# Uso:  scripts/ci/supabase-start.sh [argumentos de `supabase start`…]
set -uo pipefail

INTENTOS="${SUPABASE_START_INTENTOS:-5}"
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

  echo "::warning::intento $i de $INTENTOS falló; se reintenta en ${ESPERA}s. Las imágenes ya descargadas quedan en caché."
  # Dejar contenedores a medio arrancar hace que el siguiente intento falle por otra razón.
  # `if !` y no `|| true`: no hay stack que parar en el primer intento, y eso no es un error.
  if ! supabase stop --no-backup; then
    echo "no había stack que parar"
  fi
  sleep "$ESPERA"
done
