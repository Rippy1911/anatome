import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ATTRIBUTION = "Anatomy paths © Hicham El Boussarghini (MIT). Anatome by NextSolutions.";
const EXERCISE_DB_ATTRIBUTION = "Exercise data from free-exercise-db (CC0-1.0, public domain) by yuhonas.";
const EXDB_IMG_BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";
const RATE_LIMIT = 100;

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

function publicBase(req){
  const proto=req.headers.get("x-forwarded-proto")||"https";
  const host=req.headers.get("x-forwarded-host")||req.headers.get("origin")||req.headers.get("referer")||"";
  let h=host;
  try { if(host.startsWith("http")) h=new URL(host).host; } catch { /* keep */ }
  return h ? `${proto}://${h}` : "";
}

// Shared search logic (also imported conceptually by selfTest, which inlines its own copy).
export async function searchExercisesLogic(base44, { q, muscle, equipment, level, limit }){
  const key = String(q||"").trim().toLowerCase();
  const lim = Math.min(Number(limit||20), 50);
  // Load a working set once, then filter in memory (entity has no LIKE operator).
  const all = await base44.asServiceRole.entities.Exercise.list("-created_date", 1000);
  let matches = all;
  if(key) matches = matches.filter((e)=>(e.name_lower||e.name||"").toLowerCase().includes(key));
  if(muscle && muscle!=="any"){
    const m = String(muscle).toLowerCase();
    matches = matches.filter((e)=>(e.anatome_primary_slugs||[]).includes(m) || (e.anatome_secondary_slugs||[]).includes(m));
  }
  if(equipment && equipment!=="any"){
    const eq = String(equipment).toLowerCase();
    matches = matches.filter((e)=>String(e.equipment||"").toLowerCase()===eq);
  }
  if(level && level!=="any"){
    const lv = String(level).toLowerCase();
    matches = matches.filter((e)=>String(e.level||"").toLowerCase()===lv);
  }
  return { total: matches.length, results: matches.slice(0, lim) };
}

function toResult(e, base){
  let imageSrc = e.anatome_imageSrc || null;
  if(base && typeof imageSrc==="string" && imageSrc.startsWith("/")) imageSrc=`${base}${imageSrc}`;
  let imageUrl = (e.images && e.images[0]) || null;
  if(imageUrl && !/^https?:\/\//.test(imageUrl)) imageUrl = `${EXDB_IMG_BASE}${imageUrl}`;
  return {
    id: e.id,
    name: e.name,
    primaryMuscles: e.anatome_primary_slugs || [],
    secondaryMuscles: e.anatome_secondary_slugs || [],
    equipment: e.equipment || null,
    level: e.level || null,
    image_url: imageUrl,
    anatome_imageSrc: imageSrc,
    anatome_layers_payload: e.anatome_layers_payload || [],
  };
}

Deno.serve(async (req)=>{
  const cors={ "Access-Control-Allow-Origin":"*" };
  if(req.method==="OPTIONS") return new Response(null,{headers:{...cors,"Access-Control-Allow-Headers":"*","Access-Control-Allow-Methods":"POST, GET, OPTIONS"}});
  try {
    const base44=createClientFromRequest(req);
    const rl=await checkRateLimit(req,base44);
    if(!rl.allowed){
      return new Response(JSON.stringify({ ok:false, error:"rate_limit_exceeded", message:"Free tier: 100 requests/day per IP. Upgrade via RapidAPI for unlimited.", limit:RATE_LIMIT, used:rl.used, retry_after_seconds:rl.retry_after }), { status:429, headers:{ ...cors, "Content-Type":"application/json", ...rateHeaders(rl), "Retry-After":String(rl.retry_after) } });
    }

    let params = {};
    if(req.method==="POST"){ try { params=await req.json(); } catch { params={}; } }
    else { const q=new URL(req.url).searchParams; params={ q:q.get("q"), muscle:q.get("muscle"), equipment:q.get("equipment"), level:q.get("level"), limit:q.get("limit") }; }

    const { total, results } = await searchExercisesLogic(base44, params);
    const base = publicBase(req);
    const headers={ ...cors, "Content-Type":"application/json", ...rateHeaders(rl) };
    return new Response(JSON.stringify({
      ok:true,
      total_matched: total,
      results: results.map((e)=>toResult(e, base)),
      attribution: ATTRIBUTION,
      exercise_db_attribution: EXERCISE_DB_ATTRIBUTION,
      license: "MIT + CC0-1.0",
      built_by: "NextSolutions — nextsolutions.studio",
      try_also: "AI fitness coach at airon.coach",
    }), { headers });
  } catch(error){
    return Response.json({ ok:false, error:error.message }, { status:500, headers:cors });
  }
});