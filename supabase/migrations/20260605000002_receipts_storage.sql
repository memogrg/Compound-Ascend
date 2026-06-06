-- ============================================================
-- 0016 · Storage de recibos (OCR) — bucket privado + RLS por usuario
-- Cada usuario solo accede a su carpeta: receipts/<uid>/...
-- ============================================================
insert into storage.buckets (id, name, public)
  values ('receipts', 'receipts', false)
  on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'receipts_sel_own') then
    create policy "receipts_sel_own" on storage.objects for select to authenticated
      using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'receipts_ins_own') then
    create policy "receipts_ins_own" on storage.objects for insert to authenticated
      with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'receipts_del_own') then
    create policy "receipts_del_own" on storage.objects for delete to authenticated
      using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;
