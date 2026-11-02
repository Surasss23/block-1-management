import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors={ 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS' };
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
 try {
  const url=Deno.env.get('SUPABASE_URL')!, anon=Deno.env.get('SUPABASE_ANON_KEY')!, service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const auth=req.headers.get('Authorization'); if(!auth) throw new Error('Unauthorized');
  const caller=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:{user}}=await caller.auth.getUser(); if(!user) throw new Error('Unauthorized');
  const admin=createClient(url,service); const {data:adminProfile}=await admin.from('profiles').select('role').eq('id',user.id).single();
  if(adminProfile?.role!=='admin') throw new Error('Admin access required');
  const {room_number,full_name,phone,password}=await req.json();
  if(!room_number||!full_name||!phone||!password||password.length<8) throw new Error('Room, name, phone and password (minimum 8 characters) are required');
  const {data:room}=await admin.from('room_registry').select('room_number').eq('room_number',String(room_number)).single(); if(!room) throw new Error('Invalid room number');
  const {data:created,error}=await admin.auth.admin.createUser({phone, password, phone_confirm:true, user_metadata:{full_name,room_number:String(room_number)}}); if(error) throw error;
  const {error:profileError}=await admin.from('profiles').insert({id:created.user.id,room_number:String(room_number),full_name,phone,role:'resident'});
  if(profileError){await admin.auth.admin.deleteUser(created.user.id);throw profileError;}
  return new Response(JSON.stringify({success:true,user_id:created.user.id}),{headers:{...cors,'Content-Type':'application/json'}});
 }catch(e){return new Response(JSON.stringify({error:e.message||'Request failed'}),{status:400,headers:{...cors,'Content-Type':'application/json'}})}
});
