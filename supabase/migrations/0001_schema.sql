-- El Rebost · esquema inicial (PostgreSQL / Supabase)
-- ESTAT: escrit però NO aplicat ni provat contra cap instància. La v0.1 de l'app encara no s'hi connecta.

create table public.stores      (id bigint generated always as identity primary key, user_id uuid not null default auth.uid() references auth.users on delete cascade, name text not null, type text not null, location text, notes text, archived boolean not null default false, unique (user_id, name));
create table public.categories  (id bigint generated always as identity primary key, user_id uuid not null default auth.uid() references auth.users on delete cascade, name text not null, icon text, archived boolean not null default false, unique (user_id, name));
create table public.locations   (id bigint generated always as identity primary key, user_id uuid not null default auth.uid() references auth.users on delete cascade, name text not null, unique (user_id, name));
create table public.products    (id bigint generated always as identity primary key, user_id uuid not null default auth.uid() references auth.users on delete cascade, name text not null, brand text, category_id bigint references public.categories, location_id bigint references public.locations, qty numeric(12,3) not null default 0 check (qty >= 0), unit text not null default 'ud', format text, bought_at date, opened_at date, expiry date, min_qty numeric(12,3), price numeric(10,2), notes text, photo_path text);
create table public.inventory_movements (id bigint generated always as identity primary key, user_id uuid not null default auth.uid() references auth.users on delete cascade, product_id bigint not null references public.products on delete cascade, ts timestamptz not null default now(), delta numeric(12,3) not null, kind text not null, ref text, note text);
-- Evita afegir dues vegades la mateixa línia (recepció o tiquet) a l'inventari.
create unique index inventory_movements_ref_uq on public.inventory_movements (user_id, product_id, ref) where ref is not null;

create table public.purchases (id bigint generated always as identity primary key, user_id uuid not null default auth.uid() references auth.users on delete cascade, store_id bigint references public.stores, date date not null, total numeric(10,2) not null, discount numeric(10,2) not null default 0, status text not null default 'Pendent de revisió', source text not null default 'manual', doc_path text, inventory_added boolean not null default false);
create unique index purchases_dup_uq on public.purchases (user_id, store_id, date, total) where status = 'Revisat'; -- avís de duplicats (l'app permet forçar-ho eliminant-ne la restricció des de la UI)
create table public.purchase_lines (id bigint generated always as identity primary key, user_id uuid not null default auth.uid() references auth.users on delete cascade, purchase_id bigint not null references public.purchases on delete cascade, name text not null, qty numeric(12,3) not null, unit text not null, unit_price numeric(10,4), amount numeric(10,2) not null, category_id bigint references public.categories);

create table public.talkual_cycles (
  id text not null, user_id uuid not null default auth.uid() references auth.users on delete cascade,
  delivery_planned date not null, payment_planned date not null, delivery_real date, payment_real date,
  delivery_status text not null default 'Previst' check (delivery_status in ('Previst','Pendent de confirmar','Confirmat','Rebut','Anul·lat','Incidència')),
  payment_status  text not null default 'Pendent'  check (payment_status in ('Pendent','Pagat','No efectuat','Anul·lat o no aplicable','Incidència')),
  base numeric(10,2) not null default 19.95, discount numeric(10,2) not null default 0, paid_amount numeric(10,2), refund numeric(10,2), refund_date date,
  cancelled_at date, cancel_reason text, note text, reception_applied boolean not null default false,
  primary key (user_id, id)
);
create table public.talkual_extras (id bigint generated always as identity primary key, user_id uuid not null default auth.uid() references auth.users on delete cascade, cycle_id text not null, name text not null, brand text, qty numeric(12,3) not null, unit text not null, unit_price numeric(10,2) not null, discount numeric(10,2) not null default 0, category_id bigint references public.categories, product_id bigint references public.products, foreign key (user_id, cycle_id) references public.talkual_cycles (user_id, id) on delete cascade);
create table public.talkual_box_lines (id bigint generated always as identity primary key, user_id uuid not null default auth.uid() references auth.users on delete cascade, cycle_id text not null, name text not null, qty numeric(12,3) not null, unit text not null, weight_kg numeric(8,3), location_id bigint references public.locations, note text, best_before date, foreign key (user_id, cycle_id) references public.talkual_cycles (user_id, id) on delete cascade);

create table public.budgets (id bigint generated always as identity primary key, user_id uuid not null default auth.uid() references auth.users on delete cascade, category_id bigint references public.categories, amount numeric(10,2) not null, warn1 int not null default 80, warn2 int not null default 100);
create table public.user_settings (user_id uuid primary key default auth.uid() references auth.users on delete cascade, theme text not null default 'auto' check (theme in ('auto','clar','fosc')), data jsonb not null default '{}');

-- Row Level Security: cada usuari només accedeix a les seves files.
do $$ declare t text; begin
  foreach t in array array['stores','categories','locations','products','inventory_movements','purchases','purchase_lines','talkual_cycles','talkual_extras','talkual_box_lines','budgets','user_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s_own" on public.%1$I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop; end $$;

-- Emmagatzematge privat de tiquets: bucket no públic, accés només a la carpeta de cada usuari.
insert into storage.buckets (id, name, public) values ('tiquets', 'tiquets', false) on conflict do nothing;
create policy "tiquets_own" on storage.objects for all using (bucket_id = 'tiquets' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'tiquets' and (storage.foldername(name))[1] = auth.uid()::text);
