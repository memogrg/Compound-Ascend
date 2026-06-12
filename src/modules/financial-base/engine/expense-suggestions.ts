/**
 * Sugerencias de subcategorías por grupo (key g_*) según benchmark global de
 * gestión de gastos. Alimentan los chips + el placeholder watermark del modal
 * "Crear nueva subcategoría". No persisten en BD (puro, sin IO).
 */
export const GROUP_SUGGESTIONS: Record<string, string[]> = {
  g_vivienda: [
    "Seguro de hogar",
    "Impuesto predial",
    "Cuota de administración / HOA",
    "Agua",
    "Electricidad",
    "Gas",
    "Internet y TV",
    "Muebles y hogar",
    "Limpieza",
    "Jardinería",
  ],
  g_transporte: [
    "Combustible",
    "Seguro de auto",
    "Transporte público",
    "Parking y peajes",
    "Ride-share / taxi",
    "Lavado",
    "Revisión técnica",
    "Cuota del auto",
  ],
  g_alimentacion: [
    "Café",
    "Delivery",
    "Comida en el trabajo",
    "Snacks y bebidas",
    "Mercado orgánico",
    "Carnicería / panadería",
  ],
  g_salud: [
    "Seguro médico",
    "Dentista",
    "Óptica",
    "Terapia / psicólogo",
    "Suplementos",
    "Análisis y laboratorio",
    "Spa y masajes",
  ],
  g_estilo: [
    "Hobbies",
    "Entretenimiento",
    "Ropa y calzado",
    "Regalos",
    "Mascotas",
    "Eventos y conciertos",
    "Salidas",
    "Cuidado del hogar",
  ],
  g_educacion: [
    "Cursos online",
    "Libros",
    "Material de estudio",
    "Certificaciones",
    "Idiomas",
    "Colegiatura",
    "Talleres",
  ],
};

/**
 * Fusiona el benchmark con "las demás opciones del grupo": nombres de hojas
 * de sistema NO favoritas (desde la BD) ∪ GROUP_SUGGESTIONS[grupo], deduplicado
 * (case-insensitive) y sin las que ya son sobre. El orden prioriza las hojas
 * reales del grupo, luego el benchmark.
 */
export function mergeSuggestions(args: {
  groupKey: string | null;
  nonFavoriteLeafNames: string[];
  envelopeNames: string[];
}): string[] {
  const taken = new Set(args.envelopeNames.map((n) => n.trim().toLowerCase()));
  const out: string[] = [];
  const push = (name: string) => {
    const k = name.trim().toLowerCase();
    if (!k || taken.has(k)) return;
    taken.add(k);
    out.push(name.trim());
  };
  for (const n of args.nonFavoriteLeafNames) push(n);
  for (const n of (args.groupKey && GROUP_SUGGESTIONS[args.groupKey]) || []) push(n);
  return out;
}
