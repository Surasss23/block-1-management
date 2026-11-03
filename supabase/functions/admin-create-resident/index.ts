import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigins = new Set([
  'https://block-1-management.vercel.app',
  'http://localhost:5173',
]);

function corsHeaders(origin: string | null) {
  const allowed = origin && allowedOrigins.has(origin) ? origin : 'https://block-1-management.vercel.app';
  return {
    'Access-Control-Allow-Origin': allowed,
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

  let createdUserId: string | null = null;
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anon = Deno.env.get('SUPABASE_ANON_KEY');
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anon || !service) throw new Error('Server configuration is incomplete');

    const authorization = req.headers.get('Authorization');
    if (!authorization) throw new Error('Unauthorized');

    const caller = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: userError } = await caller.auth.getUser();
    if (userError || !user) throw new Error('Unauthorized');

    const admin = createClient(url, service);
    const { data: adminProfile, error: adminError } = await admin
      .from('profiles').select('role, active').eq('id', user.id).single();
    if (adminError || adminProfile?.role !== 'admin' || adminProfile?.active !== true) {
      throw new Error('Admin access required');
    }

    const body = await req.json();
    const roomNumber = String(body.room_number ?? '').trim();
    const fullName = String(body.full_name ?? '').trim();
    const digits = String(body.phone ?? '').replace(/\D/g, '');
    const password = String(body.password ?? '');

    const mobile = digits.startsWith('91') && digits.length === 12 ? digits.slice(2)
      : digits.startsWith('0') && digits.length === 11 ? digits.slice(1) : digits;
    if (!/^[1-9]\d{2}$/.test(roomNumber)) throw new Error('Enter a valid room number');
    if (!fullName || fullName.length > 100) throw new Error('Enter a valid resident name');
    if (!/^[6-9]\d{9}$/.test(mobile)) throw new Error('Enter a valid 10-digit Indian mobile number');
    if (password.length < 8 || password.length > 72) throw new Error('Password must be 8–72 characters');

    const phone = '+91' + mobile;
    const email = mobile + '@block1.example';

    const { data: room, error: roomError } = await admin
      .from('room_registry').select('room_number').eq('room_number', roomNumber).eq('active', true).maybeSingle();
    if (roomError) throw roomError;
    if (!room) throw new Error('This room number is not in the active room registry');

    const { data: existingRoom, error: existingRoomError } = await admin
      .from('profiles').select('id').eq('room_number', roomNumber).maybeSingle();
    if (existingRoomError) throw existingRoomError;
    if (existingRoom) throw new Error('This room already has an account');

    const { data: existingPhone, error: existingPhoneError } = await admin
      .from('profiles').select('id').eq('phone', phone).maybeSingle();
    if (existingPhoneError) throw existingPhoneError;
    if (existingPhone) throw new Error('This mobile number is already registered');

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, room_number: roomNumber, login_method: 'mobile_password' },
    });
    if (createError) throw createError;
    createdUserId = created.user.id;

    const { error: profileError } = await admin.from('profiles').insert({
      id: created.user.id,
      room_number: roomNumber,
      full_name: fullName,
      phone,
      role: 'resident',
      active: true,
    });
    if (profileError) throw profileError;

    return json({ success: true, user_id: created.user.id, room_number: roomNumber }, 200, origin);
  } catch (error) {
    if (createdUserId) {
      const url = Deno.env.get('SUPABASE_URL');
      const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (url && service) {
        const admin = createClient(url, service);
        await admin.auth.admin.deleteUser(createdUserId).catch(() => undefined);
      }
    }
    return json({ error: error instanceof Error ? error.message : 'Request failed' }, 400, origin);
  }
});
