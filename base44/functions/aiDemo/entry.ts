import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const MUSCLES = ["abs","adductors","ankles","biceps","calves","chest","deltoids","feet","forearm","gluteal","hamstring","hands","hair","head","knees","lower-back","neck","obliques","quadriceps","tibialis","trapezius","triceps","upper-back"];
const PALETTE = { primary:"#DC2626", secondary:"#F59E0B", accessory:"#FCD34D", accessoryOpacity:0.5 };
const ATTRIBUTION = "Anatomy paths © Hicham El Boussarghini (MIT). Anatome by NextSolutions.";
const AI_DEMO_LIMIT = 10;

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

function muscleGroupsFromLayers(layers){
  const seen=new Set();
  const out=[];
  for(const l of layers||[]){
    for(const m of l.muscles||[]){
      if(!seen.has(m)){ seen.add(m); out.push(m); }
    }
  }
  return out;
}

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
  return { exercise:rec.name, matched:layers.length>0, source:"exercise_db", layers, image_src:rec.anatome_imageSrc, exercise_image_url:dbImageUrl(rec), gif_url:dbGifUrl(rec) };
}

// Build the Anatome-hosted demo GIF URL for a matched exercise record.
const API_PUBLIC = Deno.env.get("PUBLIC_BASE_URL") || "https://api.anatome.dev";
const GIF_PLAYBACK_VERSION = "4";
function dbGifUrl(rec){
  if(!rec?.ext_id) return null;
  const base = API_PUBLIC.replace(/\/$/, "");
  return `${base}/exerciseGif?id=${encodeURIComponent(rec.ext_id)}&v=${GIF_PLAYBACK_VERSION}`;
}

// Build the Anatome-hosted reference-photo URL for a matched exercise record.
// Uses the first free-exercise-db image (licence unverified), proxied through /exerciseImage so
// the frontend can render the real exercise photo (not just the 2-frame GIF).
function sanitizeFreeExerciseDbPath(p){
  const s=String(p||"").trim();
  if(!s||s.startsWith("/")||s.includes("\\")||s.includes("..")||s.includes("//")) return null;
  if(!/^[A-Za-z0-9\-_. /]+$/.test(s)) return null;
  const segs=s.split("/");
  if(segs.length<2||segs.length>4) return null;
  for(const seg of segs){ if(!seg||seg.endsWith(".")||seg.startsWith(".")) return null; }
  return s;
}
function dbImageUrl(rec){
  const first=Array.isArray(rec?.images)&&rec.images[0];
  if(!first) return null;
  const safe=sanitizeFreeExerciseDbPath(first);
  if(!safe) return null;
  const base=API_PUBLIC.replace(/\/$/,"");
  return `${base}/exerciseImage?path=${encodeURIComponent(safe)}`;
}

// Find the matching DB record for an exercise name (to attach its real photo).
async function findDbExercise(base44, name){
  const key=String(name||"").trim().toLowerCase().replace(/\s+/g," ");
  if(!key) return null;
  const exact=await base44.asServiceRole.entities.Exercise.filter({ name_lower:key }, "", 1);
  if(exact && exact[0]) return exact[0];
  const all=await base44.asServiceRole.entities.Exercise.list("-created_date", 1000);
  return findBestInList(all,key);
}

function keywordFallback(exerciseRaw){
  const key=String(exerciseRaw||"").trim().toLowerCase();
  const hits=MUSCLES.filter((m)=>key.includes(m)||key.includes(m.replace("-"," ")));
  if(hits.length>0) return { exercise:key, matched:true, source:"keyword_fallback", layers:[{ color:PALETTE.primary, muscles:hits }] };
  return { exercise:key, matched:false, source:"unmatched", layers:[] };
}

async function resolveExerciseInline(base44, exercise){
  let r=null;
  try { r=await resolveFromDb(base44, exercise); } catch(e){ console.warn("db fallback failed:", e.message); }
  if(!r) r=keywordFallback(exercise);
  return r;
}

// Build the compact GET imageSrc the same way the importer does.
function buildImageSrc(layers){
  if(!layers || !layers.length) return null;
  const parts=layers.map((l)=>{
    const color=(l.color||"#DC2626").replace("#","");
    const op=l.opacity!=null && l.opacity!==1 ? `@${l.opacity}` : "";
    return `${color}${op}:${(l.muscles||[]).join(",")}`;
  });
  const encoded=encodeURIComponent(parts.join("|"));
  return `/functions/generateImage?gender=male&view=dual&layers=${encoded}&output=raw`;
}

function publicBase(req){
  const proto=req.headers.get("x-forwarded-proto")||"https";
  const host=req.headers.get("x-forwarded-host")||req.headers.get("origin")||req.headers.get("referer")||"";
  let h=host;
  try { if(host.startsWith("http")) h=new URL(host).host; } catch { /* keep */ }
  return h ? `${proto}://${h}` : "";
}

// ---- AI demo rate limiting (separate bucket, 10/day) ----
async function sha256(str){ const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(str)); return Array.from(new Uint8Array(buf)).map((b)=>b.toString(16).padStart(2,"0")).join(""); }
function clientIp(req){ return req.headers.get("cf-connecting-ip")||(req.headers.get("x-forwarded-for")||"").split(",")[0].trim()||"unknown"; }
async function checkAiLimit(req,base44){
  const ip_hash="ai_demo:"+await sha256(clientIp(req));
  const date=new Date().toISOString().slice(0,10);
  const existing=await base44.asServiceRole.entities.RateLimit.filter({ ip_hash, date });
  if(existing && existing.length>0){
    const rec=existing[0]; const count=rec.count||0;
    if(count>=AI_DEMO_LIMIT) return { allowed:false, used:count };
    await base44.asServiceRole.entities.RateLimit.update(rec.id,{ count:count+1, last_request_at:new Date().toISOString() });
    return { allowed:true, remaining:AI_DEMO_LIMIT-(count+1) };
  }
  await base44.asServiceRole.entities.RateLimit.create({ ip_hash, date, count:1, last_request_at:new Date().toISOString() });
  return { allowed:true, remaining:AI_DEMO_LIMIT-1 };
}

Deno.serve(async (req)=>{
  const cors={ "Access-Control-Allow-Origin":"*" };
  if(req.method==="OPTIONS") return new Response(null,{headers:{...cors,"Access-Control-Allow-Headers":"*","Access-Control-Allow-Methods":"POST, OPTIONS"}});
  try {
    const base44=createClientFromRequest(req);

    const limit=await checkAiLimit(req,base44);
    if(!limit.allowed){
      return new Response(JSON.stringify({ ok:false, error:"ai_demo_limit_reached", message:"AI demo limit reached. Try the manual playground or use your own AI key — anyone can build this in 10 lines, see the code above ↑", limit:AI_DEMO_LIMIT }), { status:429, headers:{ ...cors, "Content-Type":"application/json" } });
    }

    let description="";
    try { const b=await req.json(); description=b.description||""; } catch { description=""; }
    description=String(description).trim();
    if(!description){
      return new Response(JSON.stringify({ ok:false, error:"missing description" }), { status:400, headers:{ ...cors, "Content-Type":"application/json" } });
    }

    // 1) Ask any LLM to extract a clean exercise name.
    const llmRaw=await base44.integrations.Core.InvokeLLM({
      prompt: `You are a fitness expert. The user describes an exercise. Reply with JUST the exercise name in lowercase, no punctuation, e.g. 'bench press' or 'dumbbell romanian deadlift'.\n\nUser: ${description}`,
    });
    const exerciseName=String(llmRaw||"").trim().toLowerCase().replace(/[.\n].*$/s,"").replace(/[^a-z0-9 -]/g,"").trim();

    // 2) Resolve to muscle layers using Anatome's own resolver logic (inline, no HTTP).
    const resolved=await resolveExerciseInline(base44, exerciseName);

    // 3) Compute an absolute imageSrc for direct <img> embedding.
    const base=publicBase(req);
    let imageSrc=resolved.image_src || buildImageSrc(resolved.layers);
    if(base && typeof imageSrc==="string" && imageSrc.startsWith("/")) imageSrc=`${base}${imageSrc}`;

    // 3b) Attach the real exercise photo from the database when available.
    let exerciseImageUrl=resolved.exercise_image_url || null;
    let gifUrl=resolved.gif_url || null;
    if(!exerciseImageUrl || !gifUrl){
      try { const rec=await findDbExercise(base44, resolved.exercise || exerciseName); if(rec){ if(!exerciseImageUrl) exerciseImageUrl=dbImageUrl(rec); if(!gifUrl) gifUrl=dbGifUrl(rec); } }
      catch(e){ console.warn("db image lookup failed:", e.message); }
    }

    const layers=resolved.layers||[];
    return new Response(JSON.stringify({
      ok:true,
      exercise_name_extracted: resolved.exercise || exerciseName,
      layers,
      muscle_groups: muscleGroupsFromLayers(layers),
      matched: resolved.matched,
      source: resolved.source,
      anatome_imageSrc: imageSrc,
      exercise_image_url: exerciseImageUrl,
      gif_url: gifUrl,
      remaining: limit.remaining,
      attribution: ATTRIBUTION,
      license: "Apache-2.0",
    }), { headers:{ ...cors, "Content-Type":"application/json" } });
  } catch(error){
    return Response.json({ ok:false, error:error.message }, { status:500, headers:cors });
  }
});