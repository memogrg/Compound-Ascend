-- Categoría por defecto (opcional) de un frasco de ahorro. Al gastar del frasco
-- se precarga esta categoría (editable en el momento). Aditiva y nullable: las
-- metas existentes quedan sin categoría por defecto (comportamiento actual).
-- on delete set null: si se borra/fusiona la categoría, el frasco no se rompe.
alter table public.savings_goals
  add column if not exists default_category_id uuid
    references public.expense_categories(id) on delete set null;
