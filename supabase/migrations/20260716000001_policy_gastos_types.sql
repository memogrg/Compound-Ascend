-- Taxonomía de defensa: separar el seguro médico en dos coberturas
-- ("gastos_mayores" esencial / "gastos_menores" opcional) y reclasificar
-- las pólizas médicas existentes a gastos mayores.
-- Orden importa: soltar el CHECK -> reclasificar 'medico' -> re-agregar CHECK.
-- Se mantiene 'medico' en el CHECK por compatibilidad, aunque ya no se ofrezca
-- en el formulario.

alter table public.insurance_policies
  drop constraint if exists insurance_policies_policy_type_check;

-- Reclasificar las pólizas médicas existentes a gastos mayores.
update public.insurance_policies
  set policy_type = 'gastos_mayores'
  where policy_type = 'medico';

alter table public.insurance_policies
  add constraint insurance_policies_policy_type_check
  check (policy_type in (
    'medico','gastos_mayores','gastos_menores','vida','incapacidad','hogar',
    'vehiculo','patrimonial','empresarial','familiar','otro'
  ));
