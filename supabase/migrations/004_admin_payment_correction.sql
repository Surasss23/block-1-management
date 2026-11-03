-- Block 1 Management: admin correction of received payment amounts.
create or replace function public.admin_correct_payment_amount(
  payment_id uuid,
  corrected_amount numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_row public.payments%rowtype;
  due_amount numeric(12,2);
  approved_total numeric(12,2);
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if corrected_amount is null or corrected_amount <= 0 then
    raise exception 'Received amount must be greater than zero';
  end if;

  select * into payment_row
  from public.payments
  where id = payment_id
  for update;

  if not found then
    raise exception 'Payment record not found';
  end if;

  update public.payments
  set amount = corrected_amount
  where id = payment_id;

  select amount into due_amount
  from public.dues
  where id = payment_row.due_id;

  select coalesce(sum(amount), 0) into approved_total
  from public.payments
  where due_id = payment_row.due_id and status = 'approved';

  update public.dues
  set status = case when approved_total >= due_amount then 'paid' else 'unpaid' end
  where id = payment_row.due_id;
end;
$$;

revoke all on function public.admin_correct_payment_amount(uuid, numeric) from public, anon;
grant execute on function public.admin_correct_payment_amount(uuid, numeric) to authenticated;
