import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors={ 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS' };
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
 try {
  const url=Deno.env.get('SUPABASE_URL')!, anon=Deno.env.get('SUPABASE_ANON_KEY')!, service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const auth=req.headers.get('Authorization'); if(!auth) throw new Error('Unauthorized');
  const caller=createClient(url,anon,{global:{headers:{Authorization:auth}}}); const {data:{user}}=await caller.auth.getUser(); if(!user) throw new Error('Unauthorized');
  const admin=createClient(url,service); const {data:adminProfile}=await admin.from('profiles').select('role').eq('id',user.id).single(); if(adminProfile?.role!=='admin') throw new Error('Admin access required');
  const {room_number,password}=await req.json(); if(!room_number||!password||password.length<8) throw new Error('Room number and password (minimum 8 characters) are required');
  const {data:profile,error:pe}=await admin.from('profiles').select('id').eq('room_number',String(room_number)).single(); if(pe) throw pe;
  const {error}=await admin.auth.admin.updateUserById(profile.id,{password}); if(error) throw error;
  return new Response(JSON.stringify({success:true}),{headers:{...cors,'Content-Type':'application/json'}});
 }catch(e){return new Response(JSON.stringify({error:e.message||'Request failed'}),{status:400,headers:{...cors,'Content-Type':'application/json'}})}
});
