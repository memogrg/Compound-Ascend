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
delete from public.expense_categories where is_system;

insert into public.expense_categories (key, name, default_nature, is_system, sort_order) values
  ('vivienda','Vivienda','esencial',true,10),
  ('alimentacion','Alimentación','esencial',true,20),
  ('servicios_hogar','Servicios y hogar','esencial',true,30),
  ('transporte','Transporte','esencial',true,40),
  ('automovil','Automóvil','esencial',true,50),
  ('salud','Salud','proteccion',true,60),
  ('cuidado_personal','Cuidado personal','estilo_vida',true,70),
  ('familia','Familia y dependientes','esencial',true,80),
  ('mascotas','Mascotas','estilo_vida',true,90),
  ('educacion','Educación','crecimiento',true,100),
  ('disfrute','Disfrute','estilo_vida',true,110),
  ('viajes','Viajes','ahorro',true,120),
  ('tecnologia','Tecnología','ahorro',true,130),
  ('suscripciones','Suscripciones','estilo_vida',true,140),
  ('seguros','Seguros','proteccion',true,150),
  ('impuestos','Impuestos y trámites','financiero',true,160),
  ('deudas','Deudas','financiero',true,170),
  ('fondo_emergencia','Fondo de emergencia','ahorro',true,180),
  ('fondo_paz','Fondo de paz','proteccion',true,190),
  ('inversiones','Inversiones','inversion',true,200),
  ('retiro','Retiro','inversion',true,210),
  ('donaciones','Donaciones','donacion',true,220),
  ('miscelaneos','Misceláneos','miscelaneo',true,230);

-- ---------- Subcategorías (ejemplos representativos de la Biblia) ----------
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
where c.is_system and c.parent_id is null;
