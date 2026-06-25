-- Endurece el bucket privado `receipts` a nivel de Storage:
--   · file_size_limit = 6 MB (antes NULL = sin límite)
--   · allowed_mime_types = solo imágenes (antes NULL = cualquier tipo)
--
-- La isolación entre usuarios YA está cubierta por las políticas RLS existentes
-- (receipts_sel_own / receipts_ins_own / receipts_del_own, que exigen
-- storage.foldername(name)[1] = auth.uid()) y el bucket ya era privado
-- (public = false). Esta migración solo añade el límite de tamaño/MIME para que
-- el control no dependa únicamente de la validación del cliente. Idempotente.
update storage.buckets
set file_size_limit = 6291456, -- 6 MB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
where id = 'receipts';
