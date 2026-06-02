import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const MUSCLES = ["abs","adductors","ankles","biceps","calves","chest","deltoids","feet","forearm","gluteal","hamstring","hands","hair","head","knees","lower-back","neck","obliques","quadriceps","tibialis","trapezius","triceps","upper-back"];
const PALETTE = { primary:"#DC2626", secondary:"#F59E0B", accessory:"#FCD34D", accessoryOpacity:0.5 };
const ATTRIBUTION = "Anatomy paths © Hicham El Boussarghini (MIT). Anatome by NextSolutions.";
const AI_DEMO_LIMIT = 10;

const EXERCISE_MAP = {
  "bench press":{layers:[{intensity:"primary",muscles:["chest"]},{intensity:"secondary",muscles:["triceps","deltoids"]},{intensity:"accessory",muscles:["abs"]}]},
  "incline bench press":{layers:[{intensity:"primary",muscles:["chest","deltoids"]},{intensity:"secondary",muscles:["triceps"]},{intensity:"accessory",muscles:["abs"]}]},
  "overhead press":{layers:[{intensity:"primary",muscles:["deltoids"]},{intensity:"secondary",muscles:["triceps","trapezius"]},{intensity:"accessory",muscles:["abs","upper-back"]}]},
  "deadlift":{layers:[{intensity:"primary",muscles:["gluteal","hamstring","lower-back"]},{intensity:"secondary",muscles:["quadriceps","trapezius","upper-back"]},{intensity:"accessory",muscles:["abs","forearm"]}]},
  "squat":{layers:[{intensity:"primary",muscles:["quadriceps","gluteal"]},{intensity:"secondary",muscles:["hamstring","adductors","lower-back"]},{intensity:"accessory",muscles:["abs","calves"]}]},
  "pull up":{layers:[{intensity:"primary",muscles:["upper-back"]},{intensity:"secondary",muscles:["biceps","forearm"]},{intensity:"accessory",muscles:["abs","trapezius"]}]},
  "barbell row":{layers:[{intensity:"primary",muscles:["upper-back","lower-back"]},{intensity:"secondary",muscles:["biceps","trapezius"]},{intensity:"accessory",muscles:["forearm"]}]},
  "bicep curl":{layers:[{intensity:"primary",muscles:["biceps"]},{intensity:"secondary",muscles:["forearm"]},{intensity:"accessory",muscles:[]}]},
  "tricep extension":{layers:[{intensity:"primary",muscles:["triceps"]},{intensity:"secondary",muscles:[]},{intensity:"accessory",muscles:[]}]},
  "lateral raise":{layers:[{intensity:"primary",muscles:["deltoids"]},{intensity:"secondary",muscles:["trapezius"]},{intensity:"accessory",muscles:[]}]},
  "lat pulldown":{layers:[{intensity:"primary",muscles:["upper-back"]},{intensity:"secondary",muscles:["biceps"]},{intensity:"accessory",muscles:["forearm","trapezius"]}]},
  "romanian deadlift":{layers:[{intensity:"primary",muscles:["hamstring","gluteal"]},{intensity:"secondary",muscles:["lower-back"]},{intensity:"accessory",muscles:["forearm"]}]},
  "leg press":{layers:[{intensity:"primary",muscles:["quadriceps","gluteal"]},{intensity:"secondary",muscles:["hamstring","adductors"]},{intensity:"accessory",muscles:["calves"]}]},
  "leg curl":{layers:[{intensity:"primary",muscles:["hamstring"]},{intensity:"secondary",muscles:["calves"]},{intensity:"accessory",muscles:[]}]},
  "leg extension":{layers:[{intensity:"primary",muscles:["quadriceps"]},{intensity:"secondary",muscles:[]},{intensity:"accessory",muscles:[]}]},
  "calf raise":{layers:[{intensity:"primary",muscles:["calves"]},{intensity:"secondary",muscles:["tibialis"]},{intensity:"accessory",muscles:[]}]},
  "plank":{layers:[{intensity:"primary",muscles:["abs","obliques"]},{intensity:"secondary",muscles:["lower-back","deltoids"]},{intensity:"accessory",muscles:["gluteal","quadriceps"]}]},
  "crunch":{layers:[{intensity:"primary",muscles:["abs"]},{intensity:"secondary",muscles:[]},{intensity:"accessory",muscles:[]}]},
  "russian twist":{layers:[{intensity:"primary",muscles:["obliques"]},{intensity:"secondary",muscles:["abs"]},{intensity:"accessory",muscles:["lower-back"]}]},
  "hip thrust":{layers:[{intensity:"primary",muscles:["gluteal"]},{intensity:"secondary",muscles:["hamstring"]},{intensity:"accessory",muscles:["abs"]}]},
  "dip":{layers:[{intensity:"primary",muscles:["chest","triceps"]},{intensity:"secondary",muscles:["deltoids"]},{intensity:"accessory",muscles:["abs"]}]},
  "push up":{layers:[{intensity:"primary",muscles:["chest"]},{intensity:"secondary",muscles:["triceps","deltoids"]},{intensity:"accessory",muscles:["abs","obliques"]}]},
  "face pull":{layers:[{intensity:"primary",muscles:["deltoids","trapezius"]},{intensity:"secondary",muscles:["upper-back"]},{intensity:"accessory",muscles:[]}]},
  "hammer curl":{layers:[{intensity:"primary",muscles:["biceps","forearm"]},{intensity:"secondary",muscles:[]},{intensity:"accessory",muscles:[]}]},
  "lunge":{layers:[{intensity:"primary",muscles:["quadriceps","gluteal"]},{intensity:"secondary",muscles:["hamstring","adductors"]},{intensity:"accessory",muscles:["abs","calves"]}]},
};

function intensityLayers(plan){
  return plan.layers.filter((l)=>l.muscles.length>0).map((l)=>{
    if(l.intensity==="primary") return { color:PALETTE.primary, muscles:l.muscles };
    if(l.intensity==="secondary") return { color:PALETTE.secondary, muscles:l.muscles };
    return { color:PALETTE.accessory, muscles:l.muscles, opacity:PALETTE.accessoryOpacity };
  });
}

function resolveBuiltin(exerciseRaw){
  const key=String(exerciseRaw||"").trim().toLowerCase().replace(/\s+/g," ");
  if(EXERCISE_MAP[key]) return { exercise:key, matched:true, source:"exact", layers:intensityLayers(EXERCISE_MAP[key]) };
  const prefix=Object.keys(EXERCISE_MAP).find((k)=>k.startsWith(key)||key.startsWith(k));
  if(prefix) return { exercise:prefix, matched:true, source:"prefix", layers:intensityLayers(EXERCISE_MAP[prefix]) };
  return null;
}

async function resolveFromDb(base44, exerciseRaw){
  const key=String(exerciseRaw||"").trim().toLowerCase().replace(/\s+/g," ");
  if(!key) return null;
  let rec=null;
  const exact=await base44.asServiceRole.entities.Exercise.filter({ name_lower:key }, "", 1);
  if(exact && exact[0]) rec=exact[0];
  if(!rec){
    const all=await base44.asServiceRole.entities.Exercise.list("-created_date", 1000);
    rec=all.find((e)=>(e.name_lower||"").includes(key)) || all.find((e)=>key.includes(e.name_lower||"___"));
  }
  if(!rec) return null;
  const layers=[];
  if((rec.anatome_primary_slugs||[]).length) layers.push({ color:PALETTE.primary, muscles:rec.anatome_primary_slugs });
  if((rec.anatome_secondary_slugs||[]).length) layers.push({ color:PALETTE.secondary, muscles:rec.anatome_secondary_slugs });
  return { exercise:rec.name, matched:layers.length>0, source:"exercise_db", layers, image_src:rec.anatome_imageSrc, exercise_image_url:dbImageUrl(rec) };
}

// Build the GitHub raw image URL for a matched exercise record.
function dbImageUrl(rec){
  const img=(rec.images||[])[0];
  if(!img) return null;
  return `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${img}`;
}

// Find the matching DB record for an exercise name (to attach its real photo).
async function findDbExercise(base44, name){
  const key=String(name||"").trim().toLowerCase().replace(/\s+/g," ");
  if(!key) return null;
  const exact=await base44.asServiceRole.entities.Exercise.filter({ name_lower:key }, "", 1);
  if(exact && exact[0]) return exact[0];
  const all=await base44.asServiceRole.entities.Exercise.list("-created_date", 1000);
  return all.find((e)=>(e.name_lower||"").includes(key)) || all.find((e)=>key.includes(e.name_lower||"___")) || null;
}

function keywordFallback(exerciseRaw){
  const key=String(exerciseRaw||"").trim().toLowerCase();
  const hits=MUSCLES.filter((m)=>key.includes(m)||key.includes(m.replace("-"," ")));
  if(hits.length>0) return { exercise:key, matched:true, source:"keyword_fallback", layers:[{ color:PALETTE.primary, muscles:hits }] };
  return { exercise:key, matched:false, source:"unmatched", layers:[] };
}

async function resolveExerciseInline(base44, exercise){
  let r=resolveBuiltin(exercise);
  if(!r){ try { r=await resolveFromDb(base44, exercise); } catch(e){ console.warn("db fallback failed:", e.message); } }
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
    if(!exerciseImageUrl){
      try { const rec=await findDbExercise(base44, resolved.exercise || exerciseName); if(rec) exerciseImageUrl=dbImageUrl(rec); }
      catch(e){ console.warn("db image lookup failed:", e.message); }
    }

    return new Response(JSON.stringify({
      ok:true,
      exercise_name_extracted: resolved.exercise || exerciseName,
      layers: resolved.layers,
      matched: resolved.matched,
      source: resolved.source,
      anatome_imageSrc: imageSrc,
      exercise_image_url: exerciseImageUrl,
      llm_response_raw: String(llmRaw||""),
      remaining: limit.remaining,
      attribution: ATTRIBUTION,
      license: "Apache-2.0",
    }), { headers:{ ...cors, "Content-Type":"application/json" } });
  } catch(error){
    return Response.json({ ok:false, error:error.message }, { status:500, headers:cors });
  }
});