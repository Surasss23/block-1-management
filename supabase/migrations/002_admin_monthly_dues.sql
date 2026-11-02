-- Block 1 Management: secure admin-only monthly dues generator.
-- Safe to run on an existing project. The function is idempotent per room/month.
create or replace function public.generate_monthly_maintenance_for_admin(
  target_month date default date_trunc('month', current_date)::date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  fee numeric(12,2);
  inserted_count integer;
  month_start date;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  month_start := date_trunc('month', coalesce(target_month, current_date))::date;

  select (value #>> '{}')::numeric
    into fee
    from public.settings
    where key = 'monthly_maintenance';

  fee := coalesce(fee, 500);

  if fee <= 0 then
    raise exception 'Monthly maintenance must be greater than zero';
  end if;

  insert into public.dues(room_number, title, description, amount, due_month)
  select p.room_number, 'Monthly maintenance', 'Monthly block maintenance', fee, month_start
  from public.profiles p
  where p.role = 'resident' and p.active = true and p.room_number is not null
  on conflict (room_number, title, due_month) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.generate_monthly_maintenance_for_admin(date) from public, anon;
grant execute on function public.generate_monthly_maintenance_for_admin(date) to authenticated;
