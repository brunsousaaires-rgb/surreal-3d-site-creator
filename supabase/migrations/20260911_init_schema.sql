-- ============================================================
-- Estância Imperial Sports — schema inicial
-- Aplicado no projeto Supabase via MCP (mcp__Supabase__apply_migration)
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  role text not null default 'customer' check (role in ('customer','admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

create policy "profiles_update_own_or_admin"
  on public.profiles for update
  using (id = auth.uid() or public.is_admin());

-- auto-cria profile ao registrar usuário; primeiro usuário vira admin
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_first boolean;
begin
  select not exists (select 1 from public.profiles) into is_first;
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone',
    case when is_first then 'admin' else 'customer' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- courts ----------
create table public.courts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  modality text not null check (modality in ('volei_praia','futevolei','beach_tennis','volei_quadra')),
  description text not null default '',
  image_url text,
  price_per_hour numeric(10,2) not null default 0,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.courts enable row level security;

create policy "courts_select_active_public"
  on public.courts for select
  using (is_active = true or public.is_admin());

create policy "courts_admin_write"
  on public.courts for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- business_hours ----------
create table public.business_hours (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references public.courts(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  open_time time not null,
  close_time time not null
);

alter table public.business_hours enable row level security;

create policy "business_hours_select_public"
  on public.business_hours for select
  using (true);

create policy "business_hours_admin_write"
  on public.business_hours for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- bookings ----------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references public.courts(id),
  customer_id uuid references public.profiles(id),
  customer_name text not null,
  customer_phone text,
  booking_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled','completed')),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','refunded')),
  payment_method text check (payment_method in ('pix','dinheiro','cartao')),
  total_price numeric(10,2) not null default 0,
  notes text,
  confirmed_by uuid references public.profiles(id),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (court_id, booking_date, start_time)
);

alter table public.bookings enable row level security;

create policy "bookings_select_own_or_admin"
  on public.bookings for select
  using (customer_id = auth.uid() or public.is_admin());

create policy "bookings_insert_own"
  on public.bookings for insert
  with check (customer_id = auth.uid() or public.is_admin());

create policy "bookings_update_own_or_admin"
  on public.bookings for update
  using (customer_id = auth.uid() or public.is_admin());

create policy "bookings_delete_admin"
  on public.bookings for delete
  using (public.is_admin());

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

-- ---------- blocked_slots ----------
create table public.blocked_slots (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references public.courts(id) on delete cascade,
  blocked_date date not null,
  start_time time not null,
  end_time time not null,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.blocked_slots enable row level security;

create policy "blocked_slots_select_public"
  on public.blocked_slots for select
  using (true);

create policy "blocked_slots_admin_write"
  on public.blocked_slots for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- indexes ----------
create index bookings_court_date_idx on public.bookings (court_id, booking_date);
create index bookings_customer_idx on public.bookings (customer_id);
create index blocked_slots_court_date_idx on public.blocked_slots (court_id, blocked_date);

-- ---------- seed: quadras ----------
insert into public.courts (name, modality, description, price_per_hour, sort_order) values
  ('Quadra 1 - Vôlei de Praia', 'volei_praia', 'Quadra oficial de areia para vôlei de praia, iluminação noturna.', 120.00, 1),
  ('Quadra 2 - Futevôlei', 'futevolei', 'Quadra de areia para futevôlei, dimensões oficiais.', 100.00, 2),
  ('Quadra 3 - Beach Tennis', 'beach_tennis', 'Quadra de beach tennis com rede profissional.', 110.00, 3);

insert into public.business_hours (court_id, weekday, open_time, close_time)
select c.id, w.weekday, '08:00', '22:00'
from public.courts c
cross join (select generate_series(0,6) as weekday) w;
