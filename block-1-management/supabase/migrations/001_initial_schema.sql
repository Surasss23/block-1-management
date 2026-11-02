-- Block 1 Management: initial schema. Run in Supabase SQL Editor as project owner.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 room_number text unique,
 full_name text not null default '',
 phone text unique not null,
 role text not null default 'resident' check (role in ('admin','resident')),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.dues (
 id uuid primary key default gen_random_uuid(),
 room_number text not null references public.profiles(room_number) on update cascade on delete cascade,
 title text not null,
 description text,
 amount numeric(12,2) not null check(amount >= 0),
 due_month date not null,
 status text not null default 'unpaid' check(status in ('unpaid','paid','waived')),
 created_at timestamptz not null default now(),
 unique(room_number,title,due_month)
);
create table if not exists public.payments (
 id uuid primary key default gen_random_uuid(),
 room_number text not null references public.profiles(room_number) on update cascade on delete cascade,
 due_id uuid not null references public.dues(id) on delete restrict,
 amount numeric(12,2) not null check(amount > 0),
 utr text not null unique,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid references public.profiles(id)
);
create table if not exists public.notices (
 id uuid primary key default gen_random_uuid(), title text not null, description text not null,
 image_url text, amount numeric(12,2), published boolean not null default true,
 created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.expenses (
 id uuid primary key default gen_random_uuid(), title text not null, description text,
 amount numeric(12,2) not null check(amount >= 0), expense_date date not null default current_date,
 receipt_url text, created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.contacts (
 id uuid primary key default gen_random_uuid(), name text not null, role_label text not null,
 phone text not null, kind text not null default 'general', sort_order int not null default 0,
 active boolean not null default true
);
create table if not exists public.settings (
 key text primary key, value jsonb not null, updated_at timestamptz not null default now()
);
insert into public.settings(key,value) values ('monthly_maintenance','500'::jsonb),('upi_id','""'::jsonb)
on conflict(key) do nothing;

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and active=true);
$$;
create or replace function public.current_room() returns text language sql stable security definer set search_path=public as $$
 select room_number from public.profiles where id=auth.uid() and active=true;
$$;

alter table public.profiles enable row level security;
alter table public.dues enable row level security;
alter table public.payments enable row level security;
alter table public.notices enable row level security;
alter table public.expenses enable row level security;
alter table public.contacts enable row level security;
alter table public.settings enable row level security;

create policy "profile self or admin read" on public.profiles for select using (id=auth.uid() or public.is_admin());
create policy "admin manages profiles" on public.profiles for all using(public.is_admin()) with check(public.is_admin());
create policy "resident reads own dues" on public.dues for select using(room_number=public.current_room() or public.is_admin());
create policy "admin manages dues" on public.dues for all using(public.is_admin()) with check(public.is_admin());
create policy "resident reads own payments" on public.payments for select using(room_number=public.current_room() or public.is_admin());
create policy "resident submits own payment" on public.payments for insert with check(room_number=public.current_room() and status='pending' and exists(select 1 from public.dues d where d.id=due_id and d.room_number=public.current_room() and d.status='unpaid' and d.amount=amount));
create policy "admin reviews payments" on public.payments for update using(public.is_admin()) with check(public.is_admin());
create policy "published notices visible" on public.notices for select using(published=true or public.is_admin());
create policy "admin manages notices" on public.notices for all using(public.is_admin()) with check(public.is_admin());
create policy "admin manages expenses" on public.expenses for all using(public.is_admin()) with check(public.is_admin());
create policy "active contacts visible" on public.contacts for select using(active=true or public.is_admin());
create policy "admin manages contacts" on public.contacts for all using(public.is_admin()) with check(public.is_admin());
create policy "settings visible to authenticated" on public.settings for select to authenticated using(true);
create policy "admin manages settings" on public.settings for all using(public.is_admin()) with check(public.is_admin());

-- Only an approved payment settles its linked due. Approval remains an explicit admin action.
create or replace function public.settle_due_after_approval() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status='approved' and old.status is distinct from new.status then
   update public.dues set status='paid' where id=new.due_id and room_number=new.room_number and status='unpaid';
   new.reviewed_at=coalesce(new.reviewed_at,now());
   new.reviewed_by=auth.uid();
 end if;
 return new;
end; $$;
create trigger payment_approval_settles_due before update of status on public.payments for each row execute function public.settle_due_after_approval();

-- Idempotent monthly maintenance generation. Run via Supabase Cron on day 1.
create or replace function public.generate_monthly_maintenance(target_month date default date_trunc('month',current_date)::date)
returns integer language plpgsql security definer set search_path=public as $$
declare fee numeric(12,2); inserted_count integer;
begin
 select (value #>> '{}')::numeric into fee from public.settings where key='monthly_maintenance';
 fee:=coalesce(fee,500);
 insert into public.dues(room_number,title,description,amount,due_month)
 select room_number,'Monthly maintenance', 'Monthly block maintenance',fee,date_trunc('month',target_month)::date
 from public.profiles where role='resident' and active=true
 on conflict(room_number,title,due_month) do nothing;
 get diagnostics inserted_count=row_count;
 return inserted_count;
end; $$;
revoke all on function public.generate_monthly_maintenance(date) from public, anon, authenticated;
-- Schedule after enabling pg_cron in Supabase: select cron.schedule('block1-monthly-dues','0 0 1 * *', $$select public.generate_monthly_maintenance();$$);

-- Create the 108 room numbers in advance as a room registry; residents are linked when provisioned.
create table if not exists public.room_registry(room_number text primary key, active boolean not null default true);
insert into public.room_registry(room_number)
select floor(n/100)::int::text||lpad((n%100)::text,2,'0') from generate_series(101,112) n
on conflict do nothing;
insert into public.room_registry(room_number)
select floor(n/100)::int::text||lpad((n%100)::text,2,'0') from generate_series(201,212) n
on conflict do nothing;
insert into public.room_registry(room_number)
select floor(n/100)::int::text||lpad((n%100)::text,2,'0') from generate_series(301,312) n
on conflict do nothing;
insert into public.room_registry(room_number)
select floor(n/100)::int::text||lpad((n%100)::text,2,'0') from generate_series(401,412) n
on conflict do nothing;
insert into public.room_registry(room_number)
select floor(n/100)::int::text||lpad((n%100)::text,2,'0') from generate_series(501,512) n
on conflict do nothing;
insert into public.room_registry(room_number)
select floor(n/100)::int::text||lpad((n%100)::text,2,'0') from generate_series(601,612) n
on conflict do nothing;
insert into public.room_registry(room_number)
select floor(n/100)::int::text||lpad((n%100)::text,2,'0') from generate_series(701,712) n
on conflict do nothing;
insert into public.room_registry(room_number)
select floor(n/100)::int::text||lpad((n%100)::text,2,'0') from generate_series(801,812) n
on conflict do nothing;
insert into public.room_registry(room_number)
select floor(n/100)::int::text||lpad((n%100)::text,2,'0') from generate_series(901,912) n
on conflict do nothing;
alter table public.room_registry enable row level security;
create policy "admin reads room registry" on public.room_registry for select using(public.is_admin());
create policy "admin manages room registry" on public.room_registry for all using(public.is_admin()) with check(public.is_admin());
create unique index if not exists one_active_payment_per_due on public.payments(due_id) where status in ('pending','approved');
