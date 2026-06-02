import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ATTRIBUTION = "Anatomy paths © Hicham El Boussarghini (MIT). Anatome by NextSolutions.";
const EXERCISE_DB_ATTRIBUTION = "Exercise data from free-exercise-db (CC0-1.0, public domain) by yuhonas.";
// ---- Rate limiting (v1.2 dual model) ----
const IP_DAY_LIMIT=1000; const HOST_MONTH_LIMIT=100; const UPGRADE_URL="https://rapidapi.com/anatome/api/anatome";
async function sha256(str){ const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(str)); return Array.from(new Uint8Array(buf)).map((b)=>b.toString(16).padStart(2,"0")).join(""); }
function clientIp(req){ return req.headers.get("cf-connecting-ip")||(req.headers.get("x-forwarded-for")||"").split(",")[0].trim()||"unknown"; }
function isPrivateIp(ip){ if(!ip||ip==="unknown") return true; if(ip==="::1"||ip==="localhost") return true; if(ip.startsWith("127.")||ip.startsWith("192.168.")||ip.startsWith("10.")) return true; const m=ip.match(/^172\.(\d+)\./); if(m){ const o=Number(m[1]); if(o>=16&&o<=31) return true; } return false; }
function referrerHost(req){ const raw=req.headers.get("referer")||req.headers.get("origin")||""; if(!raw) return null; try { return new URL(raw).hostname; } catch { return raw.replace(/^https?:\/\//,"").split("/")[0]||null; } }
function nextUtcMidnightUnix(){ const n=new Date(); return Math.floor(Date.UTC(n.getUTCFullYear(),n.getUTCMonth(),n.getUTCDate()+1,0,0,0)/1000); }
function nextMonthUnix(){ const n=new Date(); return Math.floor(Date.UTC(n.getUTCFullYear(),n.getUTCMonth()+1,1,0,0,0)/1000); }
async function checkRateLimit(req,base44){
  const proxy=req.headers.get("x-rapidapi-proxy-secret"); if(proxy && Deno.env.get("PROXY_SECRET") && proxy===Deno.env.get("PROXY_SECRET")) return { allowed:true, source:"rapidapi", bypass:true };
  const mcpKey=req.headers.get("x-mcp-trusted-key"); if(mcpKey && Deno.env.get("MCP_TRUSTED_KEY") && mcpKey===Deno.env.get("MCP_TRUSTED_KEY")) return { allowed:true, source:"mcp_trusted", bypass:true };
  const ip=clientIp(req); const host=referrerHost(req); const useIpDay=isPrivateIp(ip)||!host;
  const limit=useIpDay?IP_DAY_LIMIT:HOST_MONTH_LIMIT; const key_type=useIpDay?"ip_day":"host_month";
  const reset=useIpDay?nextUtcMidnightUnix():nextMonthUnix(); const reset_at=new Date(reset*1000).toISOString(); const now=new Date();
  let query, createData;
  if(useIpDay){ const ip_hash=await sha256(ip); const date=now.toISOString().slice(0,10); query={ key_type, ip_hash, date }; createData={ key_type, ip_hash, date }; }
  else { const host_hash=await sha256(host); const date=now.toISOString().slice(0,7); query={ key_type, host_hash, date }; createData={ key_type, host_hash, date }; }
  const existing=await base44.asServiceRole.entities.RateLimit.filter(query);
  if(existing && existing.length>0){ const rec=existing[0]; const count=rec.count||0;
    if(count>=limit) return { allowed:false, key_type, limit, used:count, remaining:0, reset, reset_at, retry_after:reset-Math.floor(Date.now()/1000) };
    await base44.asServiceRole.entities.RateLimit.update(rec.id,{ count:count+1, last_request_at:now.toISOString() }); return { allowed:true, source:"free", key_type, limit, used:count+1, remaining:limit-(count+1), reset, reset_at }; }
  await base44.asServiceRole.entities.RateLimit.create({ ...createData, count:1, last_request_at:now.toISOString() }); return { allowed:true, source:"free", key_type, limit, used:1, remaining:limit-1, reset, reset_at };
}
function rateHeaders(rl){ return { "X-RateLimit-Limit":String(rl.limit||IP_DAY_LIMIT), "X-RateLimit-Remaining":String(rl.remaining!=null?rl.remaining:""), "X-RateLimit-Reset":String(rl.reset||nextUtcMidnightUnix()) }; }
function rateLimitBody(rl){ return { ok:false, error:"rate_limit_exceeded", limit_type:rl.key_type, limit:rl.limit, used:rl.used, reset_at:rl.reset_at, retry_after_seconds:rl.retry_after, upgrade_url:UPGRADE_URL, message:rl.key_type==="host_month" ? `Free tier: ${rl.limit} requests/month per public host. Upgrade via RapidAPI.` : `Free tier: ${rl.limit} requests/day from localhost. Upgrade via RapidAPI.` }; }

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
      return new Response(JSON.stringify(rateLimitBody(rl)), { status:429, headers:{ ...cors, "Content-Type":"application/json", ...rateHeaders(rl), "Retry-After":String(rl.retry_after) } });
    }

    const url=new URL(req.url); const q=url.searchParams;
    const id=q.get("id"); const name=q.get("name"); const random=q.get("random"); const muscle=q.get("muscle");
    const limit=Math.min(Number(q.get("limit")||10),50);
    const meta={ attribution:ATTRIBUTION, exercise_db_attribution:EXERCISE_DB_ATTRIBUTION, license:"MIT + CC0-1.0", built_by:"NextSolutions — nextsolutions.studio", try_also:"AI fitness coach at airon.coach" };
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