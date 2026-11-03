# Block 1 Management

A responsive residential maintenance portal starter for 108 rooms (101–112 through 901–912), with resident/admin authentication, private resident dues, UPI QR handoff, UTR submission, admin payment review, notices, expenses and a basic PDF report.

## Stack
- React + Vite + Tailwind-ready CSS
- Supabase Auth + Postgres + Row Level Security
- Supabase Edge Functions for privileged user creation/password resets
- UPI intent QR (not a payment gateway)
- jsPDF for report downloads
- Vercel hosting and GitHub source control

## 1. Create Supabase project
1. Create a free project at https://supabase.com.
2. Open **SQL Editor** and run `supabase/migrations/001_initial_schema.sql`.
3. For an existing installation, also run `supabase/migrations/002_admin_monthly_dues.sql` to enable the admin-only monthly dues button.
3. In **Authentication → Providers → Phone**, enable phone/password sign-in as supported by your project configuration. Normalize mobile numbers to E.164 (for India, e.g. `+919876543210`). If Supabase requires an SMS provider for your chosen phone auth configuration, configure it; password sign-in does not mean SMS OTP is automatically sent.
4. In **Project Settings → API**, copy Project URL and anon/public key. Never expose the service-role key in frontend code.
5. Create a private bootstrap admin: use Supabase Dashboard → Authentication → Users to create an auth user with a confirmed phone/password. Then run this SQL with that user's auth UUID:

```sql
insert into public.profiles(id, room_number, full_name, phone, role)
values ('AUTH_USER_UUID', null, 'Block Administrator', '+919876543210', 'admin');
```

The admin is not assigned a room. Replace values with actual details. Keep the bootstrap SQL private.

## 2. Configure the website
1. Copy `.env.example` to `.env`.
2. Fill in `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_UPI_ID`, and `VITE_UPI_NAME`.
3. Install and run:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Build check: `npm run build`.

## 3. Deploy privileged Edge Functions
From a terminal with Supabase CLI installed and linked to your project:

```bash
supabase functions deploy admin-create-resident
supabase functions deploy admin-reset-password
```

The Supabase platform injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` into deployed functions. Never add the service-role key to `.env` or Vercel frontend variables.

The resident-creation function validates the caller's admin role and creates both the Auth user and profile. The password-reset function also requires an admin caller.

## 4. Monthly dues automation
Enable the `pg_cron` extension in Supabase Database → Extensions. Then run this once in SQL Editor:

```sql
select cron.schedule(
  'block1-monthly-dues',
  '0 0 1 * *',
  $$select public.generate_monthly_maintenance();$$
);
```

This runs at 00:00 UTC on the first day of each month. If you want India midnight, use `30 18 1 * *` (18:30 UTC on the previous UTC date; verify timezone behavior and schedule expression for your desired calendar boundary). The function is idempotent for each room/month. To generate the current month's dues immediately, run:

```sql
select public.generate_monthly_maintenance(date_trunc('month', current_date)::date);
```

## 5. UPI payment workflow
The QR contains a UPI payment intent with the configured payee VPA, exact due amount, INR currency and a note such as `101 November 2026 500`. It opens a compatible UPI app when scanned. It does **not** confirm money reached the account. The resident submits the UTR; admin must compare it against the actual bank/UPI statement and approve. Approval settles the linked due. Never approve based only on a screenshot or the resident-entered UTR.

## 6. Deploy to GitHub and Vercel
1. Create a GitHub repository and push this folder.
2. In Vercel, import the GitHub repository.
3. Set the same four `VITE_...` variables in Vercel Project Settings → Environment Variables.
4. Build command: `npm run build`; output directory: `dist`.
5. Deploy. Every push to the connected branch triggers a new deployment.

## Important implementation notes / next build items
This repository is a working foundation, not yet the complete management product described in the project brief. The resident sign-in, private dues read, UPI QR intent, UTR submission, admin review, notices/expense read views and basic PDF export are wired to Supabase. Before using it for real collections, finish and test these remaining admin workflows:
- Add/edit/deactivate residents UI that calls `admin-create-resident`; add a secure edit/profile function and password reset UI.
- Admin UI to create dues for all residents, selected rooms or custom room lists; the database supports dues but the bulk-charge interface is not included yet.
- Admin create/edit/delete notice, contact and expense forms, and Supabase Storage bucket policies for images/receipts.
- Improve PDF export into a proper month-specific ledger with paid/unpaid rows, per-room totals, expense line items, and month-specific collection totals. The current export is a basic summary.
- Use month-specific paid-room statistics (not lifetime approved payment counts) and account for partial payments/overpayments if those will be allowed.
- Add audit logs, rate limits, admin MFA, backup/restore process, and test RLS with separate resident accounts before production.

## Security checklist
- RLS is enabled on the core tables. Residents can read only their own dues and payments; payment inserts must match their own unpaid due and exact amount.
- Only admins can review payments and manage notices, expenses, contacts, settings, and profiles.
- Do not put a Supabase service-role key in frontend variables.
- Admin approval is required to mark a due paid. UTR uniqueness and one active payment per due prevent basic duplicate submissions.
- Run test cases with two separate resident accounts and confirm room A cannot query room B's dues/payments.

## Suggested acceptance tests
1. Resident 101 logs in and cannot read resident 102's dues.
2. Resident 101 submits an exact due amount and unique UTR; it appears pending to admin.
3. Resident cannot change status to approved or submit payment for another room.
4. Admin approves; the due becomes paid and the resident no longer sees it as outstanding.
5. Admin rejects; the due remains unpaid and the resident can submit a new UTR.
6. Run monthly generation twice for the same month; each active room receives exactly one monthly due.
7. Check PDF totals against the database before relying on reports.


## Current admin workflows
The admin portal now includes bulk dues creation for all active resident accounts or selected rooms, publishing/deleting notices, recording expenses, updating monthly maintenance and UPI settings, and resetting a resident password through the protected Edge Function. The **Generate monthly maintenance** action uses the admin-only function in migration 002. It inserts one monthly maintenance due per active resident and is safe to run again for the same month without duplicating charges.

For an existing deployment, run `supabase/migrations/002_admin_monthly_dues.sql` in the Supabase SQL Editor once before using that button. The regular custom-charge form remains available separately.


### Resident payment status and community dashboard
Migration `003_community_dashboard_and_payment_reference.sql` adds a payment reference column and a security-definer aggregate function that returns only community-wide monthly totals (room counts and approved collection), not other residents' personal records. The resident dashboard uses these aggregates alongside the resident's own paid amount. A pending payment request locks the matching due from another submission until an admin approves or rejects it. The portal tells residents to allow up to 12 hours for review; this is a stated review window, not an automatic 12-hour approval or unlock.


### Admin payment corrections and resident deletion
Run `supabase/migrations/004_admin_payment_correction.sql` once to enable the protected admin action for correcting a recorded payment amount. The action changes the recorded amount but does not silently reverse an admin's approved/rejected decision. Deploy `supabase/functions/admin-delete-resident` from the Supabase Dashboard Edge Functions editor before using the Delete action in Residents. Deleting a resident permanently deletes that resident's payment history and dues before removing their Auth account; the room remains in the room registry and can be assigned to a new resident later. Confirm the room carefully before deletion.
