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
  -- Approval remains the admin's verification decision. Correcting the
  -- recorded received amount does not silently reverse that decision.
end;
$$;

revoke all on function public.admin_correct_payment_amount(uuid, numeric) from public, anon;
grant execute on function public.admin_correct_payment_amount(uuid, numeric) to authenticated;
