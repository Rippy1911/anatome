import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const MUSCLES = ["abs","adductors","ankles","biceps","calves","chest","deltoids","feet","forearm","gluteal","hamstring","hands","hair","head","knees","lower-back","neck","obliques","quadriceps","tibialis","trapezius","triceps","upper-back"];
const PALETTE = { primary:"#DC2626", secondary:"#F59E0B", accessory:"#FCD34D", accessoryOpacity:0.5 };
const ATTRIBUTION = "Anatomy paths © Hicham El Boussarghini (MIT). Anatome by NextSolutions.";
const RATE_LIMIT=100;

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
  "front squat":{layers:[{intensity:"primary",muscles:["quadriceps"]},{intensity:"secondary",muscles:["gluteal","abs"]},{intensity:"accessory",muscles:["upper-back"]}]},
  "seated cable row":{layers:[{intensity:"primary",muscles:["upper-back"]},{intensity:"secondary",muscles:["biceps","trapezius"]},{intensity:"accessory",muscles:["forearm"]}]},
  "rear delt fly":{layers:[{intensity:"primary",muscles:["deltoids"]},{intensity:"secondary",muscles:["trapezius","upper-back"]},{intensity:"accessory",muscles:[]}]},
  "shrug":{layers:[{intensity:"primary",muscles:["trapezius"]},{intensity:"secondary",muscles:["forearm"]},{intensity:"accessory",muscles:[]}]},
  "tricep pushdown":{layers:[{intensity:"primary",muscles:["triceps"]},{intensity:"secondary",muscles:[]},{intensity:"accessory",muscles:[]}]},
  "hanging leg raise":{layers:[{intensity:"primary",muscles:["abs"]},{intensity:"secondary",muscles:["obliques","forearm"]},{intensity:"accessory",muscles:["adductors"]}]},
};

function intensityLayers(plan){
  return plan.layers.filter((l)=>l.muscles.length>0).map((l)=>{
    if(l.intensity==="primary") return { color:PALETTE.primary, muscles:l.muscles };
    if(l.intensity==="secondary") return { color:PALETTE.secondary, muscles:l.muscles };
    return { color:PALETTE.accessory, muscles:l.muscles, opacity:PALETTE.accessoryOpacity };
  });
}

function resolveBuiltin(exerciseRaw){
  const exercise=String(exerciseRaw||"").trim();
  const key=exercise.toLowerCase().replace(/\s+/g," ").trim();
  if(EXERCISE_MAP[key]){ const plan=EXERCISE_MAP[key]; return { exercise:key, matched:true, source:"exact", layers:intensityLayers(plan), explanation:`"${key}" — primary: ${plan.layers[0].muscles.join(", ")||"none"}; secondary: ${plan.layers[1].muscles.join(", ")||"none"}; accessory: ${plan.layers[2].muscles.join(", ")||"none"}.` }; }
  const prefix=Object.keys(EXERCISE_MAP).find((k)=>k.startsWith(key)||key.startsWith(k));
  if(prefix){ const plan=EXERCISE_MAP[prefix]; return { exercise:prefix, matched:true, source:"prefix", layers:intensityLayers(plan), explanation:`Closest match for "${key}" is "${prefix}".` }; }
  return null;
}

// ExerciseDB entity fallback: fuzzy name match -> build layers from mapped slugs.
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

// ---- Rate limiting ----
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

Deno.serve(async (req)=>{
  const cors={ "Access-Control-Allow-Origin":"*" };
  if(req.method==="OPTIONS") return new Response(null,{headers:{...cors,"Access-Control-Allow-Headers":"*","Access-Control-Allow-Methods":"POST, GET, OPTIONS"}});
  try {
    const base44=createClientFromRequest(req);
    const rl=await checkRateLimit(req,base44);
    if(!rl.allowed){
      return new Response(JSON.stringify({ ok:false, error:"rate_limit_exceeded", message:"Free tier: 100 requests/day per IP. Upgrade via RapidAPI for unlimited.", limit:RATE_LIMIT, used:rl.used, retry_after_seconds:rl.retry_after, rapidapi_url:"https://rapidapi.com/" }), { status:429, headers:{ ...cors, "Content-Type":"application/json", ...rateHeaders(rl), "Retry-After":String(rl.retry_after) } });
    }

    let exercise="";
    if(req.method==="POST"){ try { const b=await req.json(); exercise=b.exercise||""; } catch { exercise=""; } }
    else { exercise=new URL(req.url).searchParams.get("exercise")||""; }

    // 1. built-in exact/prefix, 2. ExerciseDB fuzzy, 3. keyword fallback
    let r=resolveBuiltin(exercise);
    if(!r){ try { r=await resolveFromDb(base44, exercise); } catch(e){ console.warn("db fallback failed:", e.message); } }
    if(!r) r=keywordFallback(exercise);

    return new Response(JSON.stringify({ ok:true, ...r, attribution:ATTRIBUTION, license:"MIT", built_by:"NextSolutions — nextsolutions.studio", try_also:"AI fitness coach at airon.coach" }), { headers:{ ...cors, "Content-Type":"application/json", ...rateHeaders(rl) } });
  } catch(error){
    return Response.json({ ok:false, error:error.message }, { status:500, headers:cors });
  }
});