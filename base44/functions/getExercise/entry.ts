import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ATTRIBUTION = "Anatomy paths © Hicham El Boussarghini (MIT). Anatome by NextSolutions.";
const EXERCISE_DB_ATTRIBUTION = "Exercise data from free-exercise-db (CC0-1.0, public domain) by yuhonas.";
const RATE_LIMIT=100;

async function sha256(str){ const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(str)); return Array.from(new Uint8Array(buf)).map((b)=>b.toString(16).padStart(2,"0")).join(""); }
function clientIp(req){ return req.headers.get("cf-connecting-ip")||(req.headers.get("x-forwarded-for")||"").split(",")[0].trim()||"unknown"; }
function utcMidnightUnix(){ const n=new Date(); return Math.floor(Date.UTC(n.getUTCFullYear(),n.getUTCMonth(),n.getUTCDate()+1,0,0,0)/1000); }
async function checkRateLimit(req,base44){
  const proxy=req.headers.get("x-rapidapi-proxy-secret"); const proxyExpected=Deno.env.get("PROXY_SECRET");
  if(proxy && proxyExpected && proxy===proxyExpected) return { allowed:true, source:"rapidapi" };
  const ip_hash=await sha256(clientIp(req)); const date=new Date().toISOString().slice(0,10);
  const existing=await base44.asServiceRole.entities.RateLimit.filter({ ip_hash, date }); const reset=utcMidnightUnix();
  if(existing && existing.length>0){ const rec=existing[0]; const count=rec.count||0;
    if(count>=RATE_LIMIT) return { allowed:false, source:"free", used:count, reset, retry_after:reset-Math.floor(Date.now()/1000) };
    await base44.asServiceRole.entities.RateLimit.update(rec.id,{ count:count+1, last_request_at:new Date().toISOString() }); return { allowed:true, source:"free", remaining:RATE_LIMIT-(count+1), reset }; }
  await base44.asServiceRole.entities.RateLimit.create({ ip_hash, date, count:1, last_request_at:new Date().toISOString() }); return { allowed:true, source:"free", remaining:RATE_LIMIT-1, reset };
}
function rateHeaders(rl){ return { "X-RateLimit-Limit":String(RATE_LIMIT), "X-RateLimit-Remaining":String(rl.remaining!=null?rl.remaining:RATE_LIMIT), "X-RateLimit-Reset":String(rl.reset||utcMidnightUnix()) }; }

function clean(rec){
  if(!rec) return null;
  const { id, created_date, updated_date, created_by_id, ...rest }=rec;
  return { id, ...rest };
}

Deno.serve(async (req)=>{
  const cors={ "Access-Control-Allow-Origin":"*" };
  if(req.method==="OPTIONS") return new Response(null,{headers:{...cors,"Access-Control-Allow-Headers":"*","Access-Control-Allow-Methods":"POST, GET, OPTIONS"}});
  try {
    const base44=createClientFromRequest(req);
    const rl=await checkRateLimit(req,base44);
    if(!rl.allowed){
      return new Response(JSON.stringify({ ok:false, error:"rate_limit_exceeded", message:"Free tier: 100 requests/day per IP. Upgrade via RapidAPI for unlimited.", limit:RATE_LIMIT, used:rl.used, retry_after_seconds:rl.retry_after, rapidapi_url:"https://rapidapi.com/" }), { status:429, headers:{ ...cors, "Content-Type":"application/json", ...rateHeaders(rl), "Retry-After":String(rl.retry_after) } });
    }

    const url=new URL(req.url); const q=url.searchParams;
    const id=q.get("id"); const name=q.get("name"); const random=q.get("random"); const muscle=q.get("muscle");
    const limit=Math.min(Number(q.get("limit")||10),50);
    const meta={ attribution:ATTRIBUTION, exercise_db_attribution:EXERCISE_DB_ATTRIBUTION, license:"MIT + CC0-1.0" };
    const headers={ ...cors, "Content-Type":"application/json", ...rateHeaders(rl) };

    if(id){
      const found=await base44.asServiceRole.entities.Exercise.filter({ ext_id:id }, "", 1);
      const rec=found && found[0];
      return new Response(JSON.stringify({ ok:!!rec, exercise:clean(rec), ...meta }), { status:rec?200:404, headers });
    }

    if(muscle){
      const slug=String(muscle).trim().toLowerCase();
      const byPrimary=await base44.asServiceRole.entities.Exercise.filter({ anatome_primary_slugs:slug }, "", limit);
      let list=byPrimary;
      if(list.length<limit){
        const bySecondary=await base44.asServiceRole.entities.Exercise.filter({ anatome_secondary_slugs:slug }, "", limit);
        const seen=new Set(list.map((e)=>e.id));
        list=list.concat(bySecondary.filter((e)=>!seen.has(e.id))).slice(0,limit);
      }
      return new Response(JSON.stringify({ ok:true, muscle:slug, count:list.length, exercises:list.map(clean), ...meta }), { headers });
    }

    if(random){
      // Sample a random page then pick one.
      const total=await base44.asServiceRole.entities.Exercise.list("-created_date", 1000);
      if(!total.length) return new Response(JSON.stringify({ ok:false, error:"no exercises imported", ...meta }), { status:404, headers });
      const rec=total[Math.floor(Math.random()*total.length)];
      return new Response(JSON.stringify({ ok:true, exercise:clean(rec), ...meta }), { headers });
    }

    if(name){
      const key=String(name).trim().toLowerCase();
      const exact=await base44.asServiceRole.entities.Exercise.filter({ name_lower:key }, "", 1);
      if(exact && exact[0]) return new Response(JSON.stringify({ ok:true, match:"exact", exercise:clean(exact[0]), ...meta }), { headers });
      const all=await base44.asServiceRole.entities.Exercise.list("-created_date", 1000);
      const fuzzy=all.find((e)=>(e.name_lower||"").includes(key)) || all.find((e)=>key.includes(e.name_lower||"___"));
      return new Response(JSON.stringify({ ok:!!fuzzy, match:fuzzy?"fuzzy":"none", exercise:clean(fuzzy), ...meta }), { status:fuzzy?200:404, headers });
    }

    return new Response(JSON.stringify({ ok:false, error:"provide one of: id, name, random=1, muscle", ...meta }), { status:400, headers });
  } catch(error){
    return Response.json({ ok:false, error:error.message }, { status:500, headers:cors });
  }
});