-- Block 1 Management: community-safe dashboard totals and payment references.
alter table public.payments add column if not exists reference text;

create or replace function public.get_community_payment_summary(
  target_month date default date_trunc('month', current_date)::date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  month_start date;
  rooms_total integer;
  rooms_paid integer;
  rooms_pending integer;
  collected_total numeric(12,2);
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true
      and role in ('admin', 'resident')
  ) then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  month_start := date_trunc('month', coalesce(target_month, current_date))::date;

  select count(*)::integer into rooms_total
  from public.room_registry where active = true;

  select count(distinct d.room_number)::integer into rooms_paid
  from public.dues d
  where d.due_month = month_start and d.status = 'paid';

  select count(distinct p.room_number)::integer into rooms_pending
  from public.payments p
  join public.dues d on d.id = p.due_id
  where d.due_month = month_start and p.status = 'pending';

  select coalesce(sum(p.amount), 0)::numeric(12,2) into collected_total
  from public.payments p
  join public.dues d on d.id = p.due_id
  where d.due_month = month_start and p.status = 'approved';

  return jsonb_build_object(
    'total_rooms', coalesce(rooms_total, 108),
    'paid_rooms', coalesce(rooms_paid, 0),
    'unpaid_rooms', greatest(coalesce(rooms_total, 108) - coalesce(rooms_paid, 0), 0),
    'pending_rooms', coalesce(rooms_pending, 0),
    'amount_collected', coalesce(collected_total, 0),
    'month', month_start
  );
end;
$$;

revoke all on function public.get_community_payment_summary(date) from public, anon;
grant execute on function public.get_community_payment_summary(date) to authenticated;
