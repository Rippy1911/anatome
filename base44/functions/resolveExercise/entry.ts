import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const MUSCLES = ["abs","adductors","ankles","biceps","calves","chest","deltoids","feet","forearm","gluteal","hamstring","hands","hair","head","knees","lower-back","neck","obliques","quadriceps","tibialis","trapezius","triceps","upper-back"];
const PALETTE = { primary:"#DC2626", secondary:"#F59E0B", accessory:"#FCD34D", accessoryOpacity:0.5 };
const ATTRIBUTION = "Anatomy paths © Hicham El Boussarghini (MIT). Anatome by NextSolutions.";

const PREFERRED_EQUIPMENT=["barbell","dumbbell","bodyweight","body only"];
function equipmentPrefixBonus(nameLower){ for(let i=0;i<PREFERRED_EQUIPMENT.length;i++){ if(nameLower.startsWith(PREFERRED_EQUIPMENT[i]+" ")) return (PREFERRED_EQUIPMENT.length-i)*15; } return 0; }
function scoreExerciseNameMatch(nameLower,key){
  if(!nameLower||!key) return 0;
  if(nameLower===key) return 10000;
  const keyWords=key.split(/\s+/);
  for(const equip of PREFERRED_EQUIPMENT){
    const ideal=`${equip} ${key}`;
    if(nameLower===ideal||nameLower.startsWith(`${ideal} `)||nameLower.startsWith(`${ideal} -`)) return 9500-nameLower.length+equipmentPrefixBonus(nameLower);
  }
  const words=nameLower.split(/\s+/);
  if(words.length>=keyWords.length&&words.slice(-keyWords.length).join(" ")===key){
    return 8000-(words.length-keyWords.length)*200+equipmentPrefixBonus(nameLower);
  }
  const idx=nameLower.indexOf(key);
  if(idx>=0){ const suffixLen=nameLower.slice(idx+key.length).length; return 3000-nameLower.length-suffixLen*5+equipmentPrefixBonus(nameLower); }
  if(key.includes(nameLower)) return 500+nameLower.length;
  return 0;
}
function findBestInList(all,key){
  let best=null,bestScore=0;
  for(const e of all){ const s=scoreExerciseNameMatch(e.name_lower||"",key); if(s>bestScore){ bestScore=s; best=e; } }
  return bestScore>0?best:null;
}

// ExerciseDB entity: fuzzy name match -> build layers from mapped slugs.
async function resolveFromDb(base44, exerciseRaw){
  const key=String(exerciseRaw||"").trim().toLowerCase().replace(/\s+/g," ");
  if(!key) return null;
  let rec=null;
  const exact=await base44.asServiceRole.entities.Exercise.filter({ name_lower:key }, "", 1);
  if(exact && exact[0]) rec=exact[0];
  if(!rec){
    const all=await base44.asServiceRole.entities.Exercise.list("-created_date", 1000);
    rec=findBestInList(all,key);
  }
  if(!rec) return null;
  const layers=[];
  if((rec.anatome_primary_slugs||[]).length) layers.push({ color:PALETTE.primary, muscles:rec.anatome_primary_slugs });
  if((rec.anatome_secondary_slugs||[]).length) layers.push({ color:PALETTE.secondary, muscles:rec.anatome_secondary_slugs });
  return { exercise:rec.name, matched:layers.length>0, source:"exercise_db", layers,
    image_src:rec.anatome_imageSrc, ext_id:rec.ext_id, equipment:rec.equipment, level:rec.level, category:rec.category,
    explanation:`From ExerciseDB: "${rec.name}" — primary: ${(rec.anatome_primary_slugs||[]).join(", ")||"none"}; secondary: ${(rec.anatome_secondary_slugs||[]).join(", ")||"none"}.` };
}

function keywordFallback(exerciseRaw){
  const key=String(exerciseRaw||"").trim().toLowerCase();
  const hits=MUSCLES.filter((m)=>key.includes(m)||key.includes(m.replace("-"," ")));
  if(hits.length>0) return { exercise:key, matched:true, source:"keyword_fallback", layers:[{ color:PALETTE.primary, muscles:hits }], explanation:`Matched muscle keywords: ${hits.join(", ")}.` };
  return { exercise:key, matched:false, source:"unmatched", layers:[], explanation:`Could not resolve "${key}". Try a common exercise name like "bench press".` };
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

Deno.serve(async (req)=>{
  const cors={ "Access-Control-Allow-Origin":"*" };
  if(req.method==="OPTIONS") return new Response(null,{headers:{...cors,"Access-Control-Allow-Headers":"*","Access-Control-Allow-Methods":"POST, GET, OPTIONS"}});
  try {
    const base44=createClientFromRequest(req);
    const rl=await checkRateLimit(req,base44);
    if(!rl.allowed){
      return new Response(JSON.stringify(rateLimitBody(rl)), { status:429, headers:{ ...cors, "Content-Type":"application/json", ...rateHeaders(rl), "Retry-After":String(rl.retry_after) } });
    }

    let exercise="";
    if(req.method==="POST"){ try { const b=await req.json(); exercise=b.exercise||""; } catch { exercise=""; } }
    else { exercise=new URL(req.url).searchParams.get("exercise")||""; }

    // ExerciseDB fuzzy match, then keyword fallback
    let r=null;
    try { r=await resolveFromDb(base44, exercise); } catch(e){ console.warn("db fallback failed:", e.message); }
    if(!r) r=keywordFallback(exercise);

    return new Response(JSON.stringify({ ok:true, ...r, attribution:ATTRIBUTION, license:"MIT", built_by:"NextSolutions — nextsolutions.studio", try_also:"AI fitness coach at airon.coach" }), { headers:{ ...cors, "Content-Type":"application/json", ...rateHeaders(rl) } });
  } catch(error){
    return Response.json({ ok:false, error:error.message }, { status:500, headers:cors });
  }
});