-- ============================================================
-- SEED · Monedas y categorías de gasto del sistema
-- Idempotente: reemplaza filas de sistema en cada ejecución.
-- ============================================================

-- ---------- Monedas ----------
insert into public.currencies (code, symbol, name) values
  ('CRC', '₡', 'Colón costarricense'),
  ('USD', '$', 'Dólar estadounidense'),
  ('EUR', '€', 'Euro'),
  ('MXN', '$', 'Peso mexicano'),
  ('COP', '$', 'Peso colombiano'),
  ('GBP', '£', 'Libra esterlina')
on conflict (code) do update set symbol = excluded.symbol, name = excluded.name;

-- ---------- Categorías de gasto (sistema) ----------
-- NO DESTRUCTIVO: insertar solo si la key de sistema aún no existe. Antes este
-- bloque hacía `delete ... where is_system`, lo que (tras la migración 0018)
-- podía borrar los 8 grupos nuevos y anular la categorización histórica de las
-- transacciones (FK ON DELETE SET NULL). Ahora es idempotente y aditivo.
insert into public.expense_categories (key, name, default_nature, is_system, sort_order)
select v.key, v.name, v.nature, true, v.ord
from (values
  ('vivienda','Vivienda','esencial',10),
  ('alimentacion','Alimentación','esencial',20),
  ('servicios_hogar','Servicios y hogar','esencial',30),
  ('transporte','Transporte','esencial',40),
  ('automovil','Automóvil','esencial',50),
  ('salud','Salud','proteccion',60),
  ('cuidado_personal','Cuidado personal','estilo_vida',70),
  ('familia','Familia y dependientes','esencial',80),
  ('mascotas','Mascotas','estilo_vida',90),
  ('educacion','Educación','crecimiento',100),
  ('disfrute','Disfrute','estilo_vida',110),
  ('viajes','Viajes','ahorro',120),
  ('tecnologia','Tecnología','ahorro',130),
  ('suscripciones','Suscripciones','estilo_vida',140),
  ('seguros','Seguros','proteccion',150),
  ('impuestos','Impuestos y trámites','financiero',160),
  ('deudas','Deudas','financiero',170),
  ('fondo_emergencia','Fondo de emergencia','ahorro',180),
  ('fondo_paz','Fondo de paz','proteccion',190),
  ('inversiones','Inversiones','inversion',200),
  ('retiro','Retiro','inversion',210),
  ('donaciones','Donaciones','donacion',220),
  ('miscelaneos','Misceláneos','miscelaneo',230)
) as v(key, name, nature, ord)
where not exists (
  select 1 from public.expense_categories e where e.key = v.key and e.is_system
);

-- ---------- Subcategorías (ejemplos representativos de la Biblia) ----------
-- Idempotente: solo crea la subcategoría si su key aún no existe.
insert into public.expense_categories (parent_id, key, name, default_nature, is_system, sort_order)
select c.id, sub.key, sub.name, c.default_nature, true, sub.ord
from public.expense_categories c
join (values
  ('vivienda','vivienda_alquiler','Alquiler',1),
  ('vivienda','vivienda_hipoteca','Hipoteca',2),
  ('vivienda','vivienda_condominio','Condominio',3),
  ('vivienda','vivienda_mantenimiento','Mantenimiento',4),
  ('vivienda','vivienda_reparaciones','Reparaciones',5),
  ('alimentacion','alim_supermercado','Supermercado',1),
  ('alimentacion','alim_feria','Feria',2),
  ('alimentacion','alim_snacks','Snacks',3),
  ('alimentacion','alim_comida_laboral','Comida laboral',4),
  ('alimentacion','alim_comida_rapida','Comida rápida',5),
  ('alimentacion','alim_cafe','Café',6),
  ('alimentacion','alim_delivery','Delivery',7),
  ('automovil','auto_marchamo','Marchamo',1),
  ('automovil','auto_seguro','Seguro',2),
  ('automovil','auto_mantenimiento','Mantenimiento',3),
  ('automovil','auto_llantas','Llantas',4),
  ('automovil','auto_repuestos','Repuestos',5),
  ('automovil','auto_revision','Revisión técnica',6),
  ('automovil','auto_lavado','Lavado',7),
  ('servicios_hogar','serv_luz','Luz',1),
  ('servicios_hogar','serv_agua','Agua',2),
  ('servicios_hogar','serv_internet','Internet',3),
  ('servicios_hogar','serv_celular','Celular',4),
  ('servicios_hogar','serv_limpieza','Limpieza',5)
) as sub(parent_key, key, name, ord)
  on sub.parent_key = c.key
where c.is_system and c.parent_id is null
  and not exists (
    select 1 from public.expense_categories e where e.key = sub.key and e.is_system
  );
