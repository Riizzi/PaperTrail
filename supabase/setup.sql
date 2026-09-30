-- PaperTrail: bucket privado para os anexos (rode uma vez no SQL Editor do Supabase)
-- O acesso é feito só pelo servidor (/api/storage) com links assinados; nenhuma policy pública é necessária.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments',
  'attachments',
  false,
  20971520, -- 20 MB
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
on conflict (id) do nothing;
