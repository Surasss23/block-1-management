-- Add an explicit transaction date for offline payments.
-- Run migration 005 first, then this migration in Supabase SQL Editor.
create or replace function public.admin_record_offline_payment(
  target_due_id uuid,
  received_amount numeric,
  payment_mode text,
  receipt_ref text,
  note text,
  received_on date
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
  if received_on is null or received_on > current_date then
    raise exception 'Enter a valid payment date (not in the future)';
  end if;

  select * into due_row from public.dues where id = target_due_id for update;
  if not found then raise exception 'Due not found'; end if;
  if due_row.status = 'paid' then raise exception 'This due is already marked paid'; end if;

  insert into public.payments(
    room_number, due_id, amount, utr, status, created_at, reviewed_at, reviewed_by,
    payment_method, receipt_number, admin_note
  ) values (
    due_row.room_number, due_row.id, received_amount, receipt_ref, 'approved',
    received_on::timestamp at time zone 'Asia/Kolkata', now(), auth.uid(),
    payment_mode, receipt_ref, nullif(trim(note),'')
  ) returning id into new_payment_id;

  select coalesce(sum(amount),0) into approved_sum
  from public.payments where due_id = target_due_id and status = 'approved';

  update public.dues
  set status = case when approved_sum >= due_row.amount then 'paid' else 'unpaid' end
  where id = target_due_id;

  return new_payment_id;
end;
$$;

revoke all on function public.admin_record_offline_payment(uuid,numeric,text,text,text,date) from public, anon;
grant execute on function public.admin_record_offline_payment(uuid,numeric,text,text,text,date) to authenticated;
