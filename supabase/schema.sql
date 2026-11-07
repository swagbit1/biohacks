create table public.messages (
 id uuid primary key,
 user_id uuid not null references auth.users on delete cascade,
 title text not null,
 recipient text not null default '',
 occasion text not null default '',
 words text not null default '',
 mood text not null,
 source text not null check (source in ('Original recording','Approved synthetic')),
 consent_at timestamptz not null,
 created_at timestamptz not null default now()
);
alter table public.messages enable row level security;
grant select, insert, delete on public.messages to authenticated;
create policy "Read own messages" on public.messages for select to authenticated using (user_id = (select auth.uid()));
create policy "Insert own messages" on public.messages for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Delete own messages" on public.messages for delete to authenticated using (user_id = (select auth.uid()));

insert into storage.buckets (id,name,public,file_size_limit) values ('evervoice','evervoice',false,10485760);
create policy "Read own recordings" on storage.objects for select to authenticated using (bucket_id = 'evervoice' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Upload own recordings" on storage.objects for insert to authenticated with check (bucket_id = 'evervoice' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Delete own recordings" on storage.objects for delete to authenticated using (bucket_id = 'evervoice' and (storage.foldername(name))[1] = (select auth.uid())::text);
