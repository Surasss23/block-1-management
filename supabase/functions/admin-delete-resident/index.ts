import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigins = new Set([
  'https://block-1-management.vercel.app',
  'http://localhost:5173',
]);

function corsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin && allowedOrigins.has(origin) ? origin : 'https://block-1-management.vercel.app',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin);
  if (origin && !allowedOrigins.has(origin)) return json({ error: 'Origin not allowed' }, 403, origin);

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anon = Deno.env.get('SUPABASE_ANON_KEY');
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anon || !service) throw new Error('Server configuration is incomplete');

    const authorization = req.headers.get('Authorization');
    if (!authorization) throw new Error('Unauthorized');

    const caller = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');

    const admin = createClient(url, service);
    const { data: adminProfile, error: profileError } = await admin
      .from('profiles').select('role,active').eq('id', user.id).single();
    if (profileError || adminProfile?.role !== 'admin' || adminProfile?.active !== true) {
      throw new Error('Admin access required');
    }

    const { room_number } = await req.json();
    const room = String(room_number ?? '').trim();
    if (!/^\d{3}$/.test(room)) throw new Error('Invalid room number');

    const { data: resident, error: residentError } = await admin
      .from('profiles').select('id,role,room_number').eq('room_number', room).maybeSingle();
    if (residentError) throw residentError;
    if (!resident || resident.role !== 'resident') throw new Error('Resident account not found');
    if (resident.id === user.id) throw new Error('You cannot delete your own administrator account');

    // Remove child records first because payments restrict deleting linked dues.
    const { error: paymentDeleteError } = await admin.from('payments').delete().eq('room_number', room);
    if (paymentDeleteError) throw paymentDeleteError;
    const { error: dueDeleteError } = await admin.from('dues').delete().eq('room_number', room);
    if (dueDeleteError) throw dueDeleteError;

    const { error: deleteError } = await admin.auth.admin.deleteUser(resident.id);
    if (deleteError) throw deleteError;

    return json({ success: true, room_number: room }, 200, origin);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Request failed' }, 400, origin);
  }
});
