import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ATTRIBUTION = "Anatomy paths © Hicham El Boussarghini (MIT). Anatome by NextSolutions.";
const EXERCISE_DB_ATTRIBUTION = "Exercise data from free-exercise-db (CC0-1.0, public domain) by yuhonas.";
const API_PUBLIC = Deno.env.get("PUBLIC_BASE_URL") || "https://api.anatome.dev";
const GIF_PLAYBACK_VERSION = "4";
function exerciseMediaUrl(extId) {
  if (!extId) return null;
  const base = API_PUBLIC.replace(/\/$/, "");
  return `${base}/exerciseGif?id=${encodeURIComponent(extId)}&v=${GIF_PLAYBACK_VERSION}`;
}
// ---- Rate limiting (v1.3 dev-friendly model) ----
// localhost / private IPs / no-referer => unlimited; public IP => 1000/day; public host => 100/day
const IP_DAY_LIMIT=1000; const HOST_DAY_LIMIT=100; const UPGRADE_URL="https://rapidapi.com/anatome/api/anatome";
async function sha256(str){ const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(str)); return Array.from(new Uint8Array(buf)).map((b)=>b.toString(16).padStart(2,"0")).join(""); }
function clientIp(req){ return req.headers.get("cf-connecting-ip")||(req.headers.get("x-forwarded-for")||"").split(",")[0].trim()||"unknown"; }
function isPrivateIp(ip){ if(!ip||ip==="unknown") return true; if(ip==="::1"||ip==="localhost") return true; if(ip.startsWith("127.")||ip.startsWith("192.168.")||ip.startsWith("10.")) return true; const m=ip.match(/^172\.(\d+)\./); if(m){ const o=Number(m[1]); if(o>=16&&o<=31) return true; } return false; }
function referrerHost(req){ const raw=req.headers.get("referer")||req.headers.get("origin")||""; if(!raw) return null; try { return new URL(raw).hostname; } catch { return raw.replace(/^https?:\/\//,"").split("/")[0]||null; } }
function isLocalHost(host){ if(!host) return false; return host==="localhost"||host==="127.0.0.1"||host==="::1"||host.endsWith(".localhost"); }
function nextUtcMidnightUnix(){ const n=new Date(); return Math.floor(Date.UTC(n.getUTCFullYear(),n.getUTCMonth(),n.getUTCDate()+1,0,0,0)/1000); }
async function checkRateLimit(req,base44){
  const proxy=req.headers.get("x-rapidapi-proxy-secret"); if(proxy && Deno.env.get("PROXY_SECRET") && proxy===Deno.env.get("PROXY_SECRET")) return { allowed:true, source:"rapidapi", bypass:true };
  const mcpKey=req.headers.get("x-mcp-trusted-key"); if(mcpKey && Deno.env.get("MCP_TRUSTED_KEY") && mcpKey===Deno.env.get("MCP_TRUSTED_KEY")) return { allowed:true, source:"mcp_trusted", bypass:true };
  const ip=clientIp(req); const host=referrerHost(req);
  if(isPrivateIp(ip)||isLocalHost(host)) return { allowed:true, source:"localhost", bypass:true };
  const reset=nextUtcMidnightUnix(); const reset_at=new Date(reset*1000).toISOString(); const now=new Date(); const date=now.toISOString().slice(0,10);
  const useHost=!!host; const limit=useHost?HOST_DAY_LIMIT:IP_DAY_LIMIT; const key_type=useHost?"host_day":"ip_day";
  let query, createData;
  if(useHost){ const host_hash=await sha256(host); query={ key_type, host_hash, date }; createData={ key_type, host_hash, date }; }
  else { const ip_hash=await sha256(ip); query={ key_type, ip_hash, date }; createData={ key_type, ip_hash, date }; }
  const existing=await base44.asServiceRole.entities.RateLimit.filter(query);
  if(existing && existing.length>0){ const rec=existing[0]; const count=rec.count||0;
    if(count>=limit) return { allowed:false, key_type, limit, used:count, remaining:0, reset, reset_at, retry_after:reset-Math.floor(Date.now()/1000) };
    await base44.asServiceRole.entities.RateLimit.update(rec.id,{ count:count+1, last_request_at:now.toISOString() }); return { allowed:true, source:"free", key_type, limit, used:count+1, remaining:limit-(count+1), reset, reset_at }; }
  await base44.asServiceRole.entities.RateLimit.create({ ...createData, count:1, last_request_at:now.toISOString() }); return { allowed:true, source:"free", key_type, limit, used:1, remaining:limit-1, reset, reset_at };
}
function rateHeaders(rl){ if(rl.bypass) return { "X-RateLimit-Limit":"unlimited", "X-RateLimit-Remaining":"unlimited" }; return { "X-RateLimit-Limit":String(rl.limit||IP_DAY_LIMIT), "X-RateLimit-Remaining":String(rl.remaining!=null?rl.remaining:""), "X-RateLimit-Reset":String(rl.reset||nextUtcMidnightUnix()) }; }
function rateLimitBody(rl){ return { ok:false, error:"rate_limit_exceeded", limit_type:rl.key_type, limit:rl.limit, used:rl.used, reset_at:rl.reset_at, retry_after_seconds:rl.retry_after, upgrade_url:UPGRADE_URL, message:rl.key_type==="host_day" ? `Free tier: ${rl.limit} requests/day per public host. Upgrade via RapidAPI.` : `Free tier: ${rl.limit} requests/day per IP. Upgrade via RapidAPI.` }; }

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
  const mediaUrl = exerciseMediaUrl(e.ext_id);
  return {
    id: e.id,
    ext_id: e.ext_id,
    name: e.name,
    primaryMuscles: e.anatome_primary_slugs || [],
    secondaryMuscles: e.anatome_secondary_slugs || [],
    equipment: e.equipment || null,
    level: e.level || null,
    image_url: mediaUrl,
    gif_url: mediaUrl,
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
      return new Response(JSON.stringify(rateLimitBody(rl)), { status:429, headers:{ ...cors, "Content-Type":"application/json", ...rateHeaders(rl), "Retry-After":String(rl.retry_after) } });
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
      license: "Apache-2.0",
      built_by: "NextSolutions — nextsolutions.studio",
      try_also: "AI fitness coach at airon.coach",
    }), { headers });
  } catch(error){
    return Response.json({ ok:false, error:error.message }, { status:500, headers:cors });
  }
});