import Link from "next/link";

/**
 * El pie de aceptación de las pantallas de entrada y registro.
 *
 * Un solo componente para las cuatro (web y móvil) porque los enlaces tienen que
 * apuntar siempre al mismo lado: si cada pantalla los escribiera por su cuenta, una
 * quedaría sin actualizar el día que cambien las rutas, y sería justo la que revisa
 * la tienda.
 *
 * `voz` existe porque el repositorio habla distinto según la plataforma: la web usa
 * voseo («aceptás») y `src/app/(mobile)` usa es-MX con «tú» («aceptas»). Un solo
 * voseo suelto en una pantalla móvil llena de «tú» se lee como un error de traducción.
 *
 * Los enlaces llevan TEXTO visible a propósito: las tiendas exigen que la política
 * sea alcanzable, y un ícono sin texto no cumple.
 */
export function PieLegal({
  voz = "vos",
  className,
  style,
}: {
  voz?: "vos" | "tu";
  className?: string;
  style?: React.CSSProperties;
}) {
  const verbo = voz === "vos" ? "aceptás" : "aceptas";
  // Subrayado explícito: heredando el color del pie —gris tenue en las cuatro
  // pantallas— los enlaces se leen como texto corrido. Quien revisa la app en la
  // tienda busca un enlace VISIBLE a la política, y uno que no parece enlace no lo es.
  const enlace = { textDecoration: "underline", textUnderlineOffset: 2, color: "inherit" };
  return (
    <p className={className} style={style}>
      Al continuar {verbo} los{" "}
      <Link href="/terminos" style={enlace}>
        Términos
      </Link>{" "}
      y la{" "}
      <Link href="/privacidad" style={enlace}>
        Política de privacidad
      </Link>
      .
    </p>
  );
}
