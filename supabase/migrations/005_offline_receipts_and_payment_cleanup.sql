-- Offline receipts, payment cleanup and safe admin payment maintenance.
alter table public.payments add column if not exists payment_method text not null default 'upi';
alter table public.payments add column if not exists receipt_number text;
alter table public.payments add column if not exists admin_note text;

create or replace function public.admin_record_offline_payment(
  target_due_id uuid,
  received_amount numeric,
  payment_mode text,
  receipt_ref text,
  note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  due_row public.dues%rowtype;
  new_payment_id uuid;
  approved_sum numeric(12,2);
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if received_amount is null or received_amount <= 0 then
    raise exception 'Received amount must be greater than zero';
  end if;
  if payment_mode not in ('cash','bank_transfer','upi','cheque','other') then
    raise exception 'Invalid payment mode';
  end if;
  if coalesce(trim(receipt_ref),'') = '' then
    raise exception 'Receipt reference is required';
  end if;

  select * into due_row from public.dues where id = target_due_id for update;
  if not found then raise exception 'Due not found'; end if;
  if due_row.status = 'paid' then raise exception 'This due is already marked paid'; end if;

  insert into public.payments(
    room_number, due_id, amount, utr, status, reviewed_at, reviewed_by,
    payment_method, receipt_number, admin_note
  ) values (
    due_row.room_number, due_row.id, received_amount, receipt_ref, 'approved',
    now(), auth.uid(), payment_mode, receipt_ref, nullif(trim(note),'')
  ) returning id into new_payment_id;

  select coalesce(sum(amount),0) into approved_sum
  from public.payments where due_id = target_due_id and status = 'approved';

  update public.dues
  set status = case when approved_sum >= due_row.amount then 'paid' else 'unpaid' end
  where id = target_due_id;

  return new_payment_id;
end;
$$;

create or replace function public.admin_delete_payment(target_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.payments%rowtype;
  due_total numeric(12,2);
  approved_total numeric(12,2);
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select * into p from public.payments where id = target_payment_id for update;
  if not found then raise exception 'Payment record not found'; end if;

  delete from public.payments where id = target_payment_id;

  select amount into due_total from public.dues where id = p.due_id;
  select coalesce(sum(amount),0) into approved_total
  from public.payments where due_id = p.due_id and status = 'approved';

  update public.dues
  set status = case when approved_total >= due_total then 'paid' else 'unpaid' end
  where id = p.due_id;
end;
$$;

revoke all on function public.admin_record_offline_payment(uuid,numeric,text,text,text) from public, anon;
revoke all on function public.admin_delete_payment(uuid) from public, anon;
grant execute on function public.admin_record_offline_payment(uuid,numeric,text,text,text) to authenticated;
grant execute on function public.admin_delete_payment(uuid) to authenticated;
