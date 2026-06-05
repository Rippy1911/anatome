import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ---- Inlined catalog + engine + resolver (MCP must be self-contained) ----
const MUSCLES = ["abs","adductors","ankles","biceps","calves","chest","deltoids","feet","forearm","gluteal","hamstring","hands","hair","head","knees","lower-back","neck","obliques","quadriceps","tibialis","trapezius","triceps","upper-back"];
const ANATOMICAL_NAMES = { abs:"Rectus Abdominis",adductors:"Adductor Group",ankles:"Ankles",biceps:"Biceps Brachii",calves:"Gastrocnemius / Soleus",chest:"Pectoralis Major",deltoids:"Deltoids",feet:"Feet",forearm:"Forearm Flexors / Extensors",gluteal:"Gluteus Maximus / Medius",hamstring:"Hamstrings",hands:"Hands",hair:"Hair",head:"Head",knees:"Knees","lower-back":"Erector Spinae (Lower Back)",neck:"Sternocleidomastoid (Neck)",obliques:"Obliques",quadriceps:"Quadriceps Femoris",tibialis:"Tibialis Anterior",trapezius:"Trapezius",triceps:"Triceps Brachii","upper-back":"Latissimus Dorsi (Upper Back)" };
const SIDE_PRESENCE = { abs:["front"],adductors:["front","back"],ankles:["front","back"],biceps:["front"],calves:["front","back"],chest:["front"],deltoids:["front","back"],feet:["front","back"],forearm:["front","back"],gluteal:["back"],hamstring:["back"],hands:["front","back"],hair:["front","back"],head:["front","back"],knees:["front"],"lower-back":["back"],neck:["front","back"],obliques:["front"],quadriceps:["front"],tibialis:["front"],trapezius:["front","back"],triceps:["front","back"],"upper-back":["back"] };
const ALIASES = { shoulders:"deltoids",deltoid:"deltoids",shoulder:"deltoids",gluteus:"gluteal",glutes:"gluteal",glute:"gluteal",calfs:"calves",calf:"calves",quads:"quadriceps",quad:"quadriceps",hamstrings:"hamstring",abdominals:"abs",ab:"abs",lats:"upper-back",lat:"upper-back",back:"upper-back",traps:"trapezius",trap:"trapezius",bicep:"biceps",tricep:"triceps",pecs:"chest",pec:"chest",oblique:"obliques",lowerback:"lower-back",upperback:"upper-back" };
function normalizeSlug(input){ if(!input) return input; const s=String(input).trim().toLowerCase(); if(MUSCLES.includes(s)) return s; if(ALIASES[s]) return ALIASES[s]; return s; }
const WRAPPER = { male:{front:{viewBox:"0 0 724 1448"},back:{viewBox:"724 0 724 1448"}}, female:{front:{viewBox:"-50 -40 734 1538"},back:{viewBox:"756 0 774 1448"}} };
const DEFAULTS = { gender:"male",view:"dual",width:768,height:1024,background:"transparent",body_color:"#3f3f3f",border_color:"#dfdfdf",border_width:1 };
const PALETTE = { primary:"#DC2626",secondary:"#F59E0B",accessory:"#FCD34D",accessoryOpacity:0.5 };
const ATTRIBUTION = "Anatomy paths © Hicham El Boussarghini (MIT). Anatome by NextSolutions.";
const ATTRIBUTION_SOURCE = "https://github.com/HichamELBSI/react-native-body-highlighter";
const BUILT_BY = "NextSolutions — nextsolutions.studio";
const TRY_ALSO = "AI fitness coach at airon.coach";

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

function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function buildResolution(payload){ const res={}; const layers=Array.isArray(payload.layers)?payload.layers:[];
  layers.forEach((layer)=>{ const color=layer.color; const op=layer.opacity!=null?layer.opacity:1; (layer.muscles||[]).forEach((m)=>{ const slug=normalizeSlug(m); res[slug]={fill:color,opacity:op,stroke:layer.stroke,strokeWidth:layer.strokeWidth}; }); });
  const pm=payload.per_muscle||{}; Object.keys(pm).forEach((m)=>{ const slug=normalizeSlug(m); const o=pm[m]||{}; res[slug]={ fill:o.fill!=null?o.fill:(res[slug]&&res[slug].fill), opacity:o.opacity!=null?o.opacity:(res[slug]?res[slug].opacity:1), stroke:o.stroke!=null?o.stroke:(res[slug]&&res[slug].stroke), strokeWidth:o.strokeWidth!=null?o.strokeWidth:(res[slug]&&res[slug].strokeWidth) }; });
  return res; }
function defsBlock(defs){ if(!Array.isArray(defs)||defs.length===0) return ""; const parts=defs.map((d)=>{ const stops=(d.stops||[]).map((s)=>`<stop offset="${esc(s.offset)}" stop-color="${esc(s.color)}"${s.opacity!=null?` stop-opacity="${s.opacity}"`:""}/>`).join(""); if(d.type==="linearGradient"){ const coords=`${d.x1!=null?` x1="${esc(d.x1)}"`:""}${d.y1!=null?` y1="${esc(d.y1)}"`:""}${d.x2!=null?` x2="${esc(d.x2)}"`:""}${d.y2!=null?` y2="${esc(d.y2)}"`:""}`; return `<linearGradient id="${esc(d.id)}"${coords}>${stops}</linearGradient>`; } if(d.type==="radialGradient") return `<radialGradient id="${esc(d.id)}">${stops}</radialGradient>`; return ""; }); return `<defs>${parts.join("")}</defs>`; }
function renderSide(parts,res,opts,sideFilter,transform){ const {body_color,border_color,border_width}=opts; const rendered=new Set(); const out=[];
  parts.forEach((part)=>{ const slug=part.slug; const style=res[slug]; const filterSide=sideFilter&&sideFilter[slug]; const path=part.path||{};
    const emit=(d,whichSide)=>{ let fill=body_color,opacity=1,stroke=border_color,strokeWidth=border_width; if(style&&style.fill!=null){ if(!filterSide||filterSide===whichSide||whichSide==="common"){ fill=style.fill; if(style.opacity!=null)opacity=style.opacity; if(style.stroke!=null)stroke=style.stroke; if(style.strokeWidth!=null)strokeWidth=style.strokeWidth; } } if(MUSCLES.includes(slug)||style) rendered.add(slug); out.push(`<path d="${d}" fill="${esc(fill)}" stroke="${esc(stroke)}" stroke-width="${strokeWidth}" opacity="${opacity}" data-muscle="${esc(slug)}"/>`); };
    (path.common||[]).forEach((d)=>emit(d,"common")); (path.left||[]).forEach((d)=>emit(d,"left")); (path.right||[]).forEach((d)=>emit(d,"right")); });
  const g=transform?`<g transform="${transform}">${out.join("")}</g>`:out.join(""); return {svg:g,rendered:Array.from(rendered)}; }
function renderMuscleSvg(payload,bodyData){ const p={...DEFAULTS,...payload}; const gender=p.gender==="female"?"female":"male"; const view=["front","back","dual"].includes(p.view)?p.view:"dual"; const data=(bodyData&&bodyData[gender])||{front:[],back:[]}; const res=buildResolution(p); const sideFilter=p.side_filter||null; let inner="",viewBox; const renderedSet=new Set(); const collect=(r)=>r.rendered.forEach((s)=>renderedSet.add(s));
  if(view==="front"){ const r=renderSide(data.front,res,p,sideFilter,null); inner=r.svg; collect(r); viewBox=WRAPPER[gender].front.viewBox; }
  else if(view==="back"){ const r=renderSide(data.back,res,p,sideFilter,null); inner=r.svg; collect(r); viewBox=WRAPPER[gender].back.viewBox; }
  else { const rf=renderSide(data.front,res,p,sideFilter,null); const rb=renderSide(data.back,res,p,sideFilter,"translate(0, 0)"); collect(rf); collect(rb); inner=`${rf.svg}${rb.svg}`; viewBox="0 0 1448 1448"; }
  const defs=defsBlock(p.defs); const bg=p.background&&p.background!=="transparent"?`<rect x="-99999" y="-99999" width="199998" height="199998" fill="${esc(p.background)}"/>`:""; const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${p.width}" height="${p.height}" preserveAspectRatio="xMidYMid meet">`+defs+bg+inner+`</svg>`; return {svg,muscles_rendered:Array.from(renderedSet).filter((s)=>MUSCLES.includes(s))}; }

async function resolveFromDb(base44, exerciseRaw){
  const key=String(exerciseRaw||"").trim().toLowerCase().replace(/\s+/g," ").trim();
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
    explanation:`From free-exercise-db: "${rec.name}" — primary: ${(rec.anatome_primary_slugs||[]).join(", ")||"none"}; secondary: ${(rec.anatome_secondary_slugs||[]).join(", ")||"none"}.` };
}

function keywordResolve(exerciseRaw){
  const key=String(exerciseRaw||"").trim().toLowerCase().replace(/\s+/g," ").trim();
  const hits=MUSCLES.filter((m)=>key.includes(m)||key.includes(m.replace("-"," ")));
  if(hits.length>0){ return { exercise:key, matched:true, source:"keyword_fallback", layers:[{color:PALETTE.primary,muscles:hits}], explanation:`Matched muscle keywords: ${hits.join(", ")}.` }; }
  return { exercise:key, matched:false, source:"unmatched", layers:[], explanation:`Could not resolve "${key}".` };
}

async function loadBody(base44){ const records=await base44.asServiceRole.entities.BodyData.list(); const map={}; for(const r of records) map[r.key]=r.parts||[]; return { male:{front:map.bodyFrontMale||[],back:map.bodyBackMale||[]}, female:{front:map.bodyFrontFemale||[],back:map.bodyBackFemale||[]} }; }

// ---- free-exercise-db helpers (inlined from searchExercises / getExercise) ----
const API_PUBLIC = Deno.env.get("PUBLIC_BASE_URL") || "https://api.anatome.dev";
const GIF_PLAYBACK_VERSION = "4";
function exerciseMediaUrl(extId) {
  if (!extId) return null;
  const base = API_PUBLIC.replace(/\/$/, "");
  return `${base}/exerciseGif?id=${encodeURIComponent(extId)}&v=${GIF_PLAYBACK_VERSION}`;
}
function publicBase(req){
  const proto=req.headers.get("x-forwarded-proto")||"https";
  const host=req.headers.get("x-forwarded-host")||req.headers.get("origin")||req.headers.get("referer")||"";
  let h=host;
  try { if(host.startsWith("http")) h=new URL(host).host; } catch { /* keep */ }
  return h ? `${proto}://${h}` : "";
}
function absImageSrc(src, base){ if(base && typeof src==="string" && src.startsWith("/")) return `${base}${src}`; return src||null; }
function firstImageUrl(extId){ return exerciseMediaUrl(extId); }
async function searchExercisesLogic(base44,{ q, muscle, equipment, level, limit }){
  const key=String(q||"").trim().toLowerCase(); const lim=Math.min(Number(limit||20),50);
  const all=await base44.asServiceRole.entities.Exercise.list("-created_date", 1000);
  let matches=all;
  if(key) matches=matches.filter((e)=>(e.name_lower||e.name||"").toLowerCase().includes(key));
  if(muscle && muscle!=="any"){ const m=String(muscle).toLowerCase(); matches=matches.filter((e)=>(e.anatome_primary_slugs||[]).includes(m)||(e.anatome_secondary_slugs||[]).includes(m)); }
  if(equipment && equipment!=="any"){ const eq=String(equipment).toLowerCase(); matches=matches.filter((e)=>String(e.equipment||"").toLowerCase()===eq); }
  if(level && level!=="any"){ const lv=String(level).toLowerCase(); matches=matches.filter((e)=>String(e.level||"").toLowerCase()===lv); }
  return { total:matches.length, results:matches.slice(0,lim) };
}
function searchResult(e, base){
  return { id:e.id, name:e.name, primaryMuscles:e.anatome_primary_slugs||[], secondaryMuscles:e.anatome_secondary_slugs||[],
    equipment:e.equipment||null, level:e.level||null, category:e.category||null,
    image_url:firstImageUrl(e.ext_id), gif_url:firstImageUrl(e.ext_id), anatome_imageSrc:absImageSrc(e.anatome_imageSrc, base),
    anatome_layers_payload:e.anatome_layers_payload||[], instructions:(e.instructions||[]).slice(0,2) };
}
function fullExercise(e, base){
  if(!e) return null;
  const { created_date, updated_date, created_by_id, name_lower, ...rest }=e;
  const media = firstImageUrl(e.ext_id);
  return { ...rest, image_url:media, gif_url:media, anatome_imageSrc:absImageSrc(e.anatome_imageSrc, base) };
}
async function getExerciseLogic(base44,{ name, id, random }, base){
  if(id){ const found=await base44.asServiceRole.entities.Exercise.filter({ id }, "", 1); const rec=found&&found[0]; return rec?{ match:"exact", exercise:fullExercise(rec, base) }:{ match:"none", exercise:null }; }
  if(random){ const total=await base44.asServiceRole.entities.Exercise.list("-created_date", 1000); if(!total.length) return { match:"none", exercise:null }; return { match:"random", exercise:fullExercise(total[Math.floor(Math.random()*total.length)], base) }; }
  if(name){ const key=String(name).trim().toLowerCase().replace(/\s+/g," ");
    const exact=await base44.asServiceRole.entities.Exercise.filter({ name_lower:key }, "", 1);
    if(exact && exact[0]) return { match:"exact", exercise:fullExercise(exact[0], base) };
    const all=await base44.asServiceRole.entities.Exercise.list("-created_date", 1000);
    const fuzzy=all.find((e)=>(e.name_lower||"").includes(key)) || all.find((e)=>key.includes(e.name_lower||"___"));
    return fuzzy?{ match:"fuzzy", exercise:fullExercise(fuzzy, base) }:{ match:"none", exercise:null }; }
  return { match:"none", exercise:null };
}

// ---- Rate limiting (v1.3 dev-friendly model, with MCP trusted-key + RapidAPI bypass) ----
// localhost / private IPs / no-referer => unlimited; public IP => 1000/day; public host => 100/day
const IP_DAY_LIMIT=1000; const HOST_DAY_LIMIT=100;
async function sha256(str){ const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(str)); return Array.from(new Uint8Array(buf)).map((b)=>b.toString(16).padStart(2,"0")).join(""); }
function clientIp(req){ return req.headers.get("cf-connecting-ip")||(req.headers.get("x-forwarded-for")||"").split(",")[0].trim()||"unknown"; }
function isPrivateIp(ip){ if(!ip||ip==="unknown") return true; if(ip==="::1"||ip==="localhost") return true; if(ip.startsWith("127.")||ip.startsWith("192.168.")||ip.startsWith("10.")) return true; const m=ip.match(/^172\.(\d+)\./); if(m){ const o=Number(m[1]); if(o>=16&&o<=31) return true; } return false; }
function referrerHost(req){ const raw=req.headers.get("referer")||req.headers.get("origin")||""; if(!raw) return null; try { return new URL(raw).hostname; } catch { return raw.replace(/^https?:\/\//,"").split("/")[0]||null; } }
function isLocalHost(host){ if(!host) return false; return host==="localhost"||host==="127.0.0.1"||host==="::1"||host.endsWith(".localhost"); }
function nextUtcMidnightUnix(){ const n=new Date(); return Math.floor(Date.UTC(n.getUTCFullYear(),n.getUTCMonth(),n.getUTCDate()+1,0,0,0)/1000); }
async function checkRateLimit(req,base44){
  const mcpKey=req.headers.get("x-mcp-trusted-key"); if(mcpKey && Deno.env.get("MCP_TRUSTED_KEY") && mcpKey===Deno.env.get("MCP_TRUSTED_KEY")) return { allowed:true, source:"mcp_trusted", bypass:true };
  const proxy=req.headers.get("x-rapidapi-proxy-secret"); if(proxy && Deno.env.get("PROXY_SECRET") && proxy===Deno.env.get("PROXY_SECRET")) return { allowed:true, source:"rapidapi", bypass:true };
  const ip=clientIp(req); const host=referrerHost(req);
  if(isPrivateIp(ip)||isLocalHost(host)) return { allowed:true, source:"localhost", bypass:true };
  const reset=nextUtcMidnightUnix(); const reset_at=new Date(reset*1000).toISOString(); const now=new Date(); const date=now.toISOString().slice(0,10);
  const useHost=!!host; const limit=useHost?HOST_DAY_LIMIT:IP_DAY_LIMIT; const key_type=useHost?"host_day":"ip_day";
  let query, createData;
  if(useHost){ const host_hash=await sha256(host); query={ key_type, host_hash, date }; createData={ key_type, host_hash, date }; }
  else { const ip_hash=await sha256(ip); query={ key_type, ip_hash, date }; createData={ key_type, ip_hash, date }; }
  const existing=await base44.asServiceRole.entities.RateLimit.filter(query);
  if(existing && existing.length>0){ const rec=existing[0]; const count=rec.count||0;
    if(count>=limit) return { allowed:false, key_type, limit, used:count, reset, reset_at, retry_after:reset-Math.floor(Date.now()/1000) };
    await base44.asServiceRole.entities.RateLimit.update(rec.id,{ count:count+1, last_request_at:now.toISOString() }); return { allowed:true, source:"free", key_type, limit, remaining:limit-(count+1) }; }
  await base44.asServiceRole.entities.RateLimit.create({ ...createData, count:1, last_request_at:now.toISOString() }); return { allowed:true, source:"free", key_type, limit, remaining:limit-1 };
}

const TOOLS = [
  { name:"generate_muscle_image", description:"Render an SVG diagram of the human body with arbitrary muscles highlighted in arbitrary colors. Returns an SVG string.",
    inputSchema:{ type:"object", properties:{
      gender:{type:"string",enum:["male","female"],default:"male"},
      view:{type:"string",enum:["front","back","dual"],default:"dual"},
      layers:{type:"array",items:{type:"object",properties:{color:{type:"string"},muscles:{type:"array",items:{type:"string"}},opacity:{type:"number"}},required:["color","muscles"]}},
      body_color:{type:"string",default:"#282828"}, border_color:{type:"string",default:"#dfdfdf"}, border_width:{type:"number",default:1.5},
      background:{type:"string",default:"transparent"}, width:{type:"number",default:768}, height:{type:"number",default:1024},
      per_muscle:{type:"object"}, side_filter:{type:"object"}, defs:{type:"array"} },
      required:["layers"] } },
  { name:"list_muscles", description:"List all 23 supported muscle slugs with anatomical names and which views they appear on.",
    inputSchema:{ type:"object", properties:{} } },
  { name:"resolve_exercise", description:"Resolve an exercise name against the 873-exercise database into primary/secondary muscle layers. Use generate_muscle_image with custom layers for additional tiers (e.g. accessory stabilizers).",
    inputSchema:{ type:"object", properties:{ exercise:{type:"string"} }, required:["exercise"] } },
  { name:"search_exercises", description:"Search the 873-exercise database (free-exercise-db) by name with optional muscle/equipment/level filters. Returns enriched results with ready-to-embed anatome_imageSrc URLs.",
    inputSchema:{ type:"object", properties:{
      q:{type:"string",description:"Name search query, e.g. 'bench'"},
      muscle:{type:"string",description:"Filter by Anatome muscle slug, e.g. 'chest'"},
      equipment:{type:"string",description:"Filter by equipment, e.g. 'barbell'"},
      level:{type:"string",enum:["beginner","intermediate","expert"],description:"Filter by difficulty"},
      limit:{type:"number",default:20,description:"Max results (1-50)"} },
      required:["q"] } },
  { name:"get_exercise", description:"Fetch a single exercise with FULL instructions, images, and all anatome_* fields. Provide exactly one of: name (fuzzy), id (uuid), or random (boolean).",
    inputSchema:{ type:"object", properties:{
      name:{type:"string",description:"Exercise name (fuzzy match), e.g. 'bench press'"},
      id:{type:"string",description:"Exercise UUID"},
      random:{type:"boolean",description:"Return a random exercise"} } } },
];

function rpcResult(id,result){ return { jsonrpc:"2.0", id, result }; }
function rpcError(id,code,message){ return { jsonrpc:"2.0", id, error:{ code, message } }; }

Deno.serve(async (req)=>{
  const cors={ "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"*", "Access-Control-Allow-Methods":"POST, GET, OPTIONS" };
  if(req.method==="OPTIONS") return new Response(null,{headers:cors});
  if(req.method==="GET") return Response.json({ ok:true, server:"anatome", version:"1.0.0", protocol:"mcp/2024-11-05", tools:TOOLS.map((t)=>t.name) },{headers:cors});

  const base44=createClientFromRequest(req);
  const rl=await checkRateLimit(req,base44);
  if(!rl.allowed){ const msg=rl.key_type==="host_day" ? `Rate limit exceeded: free tier ${rl.limit} req/day per public host. Upgrade via RapidAPI.` : `Rate limit exceeded: free tier ${rl.limit} req/day per IP. Upgrade via RapidAPI.`; return new Response(JSON.stringify(rpcError(null,-32000,msg)),{ status:429, headers:{ ...cors, "Content-Type":"application/json", "Retry-After":String(rl.retry_after) } }); }
  let body; try { body=await req.json(); } catch { return Response.json(rpcError(null,-32700,"Parse error"),{headers:cors}); }
  const { id=null, method, params={} }=body||{};

  try {
    if(method==="initialize"){
      return Response.json(rpcResult(id,{ protocolVersion:"2024-11-05", capabilities:{ tools:{} }, serverInfo:{ name:"anatome", version:"1.0.0" } }),{headers:cors});
    }
    if(method==="tools/list"){
      return Response.json(rpcResult(id,{ tools:TOOLS }),{headers:cors});
    }
    if(method==="tools/call"){
      const name=params.name; const args=params.arguments||{};
      if(name==="generate_muscle_image"){
        const bodyData=await loadBody(base44);
        const { svg, muscles_rendered }=renderMuscleSvg(args,bodyData);
        return Response.json(rpcResult(id,{ content:[{ type:"text", text:svg }], structuredContent:{ muscles_rendered, attribution:ATTRIBUTION, attribution_source:ATTRIBUTION_SOURCE, built_by:BUILT_BY, try_also:TRY_ALSO } }),{headers:cors});
      }
      if(name==="list_muscles"){
        const muscles=MUSCLES.map((slug)=>({ slug, name:ANATOMICAL_NAMES[slug], views:SIDE_PRESENCE[slug] }));
        return Response.json(rpcResult(id,{ content:[{ type:"text", text:JSON.stringify(muscles) }], structuredContent:{ count:MUSCLES.length, muscles, built_by:BUILT_BY, try_also:TRY_ALSO } }),{headers:cors});
      }
      if(name==="resolve_exercise"){
        let r=await resolveFromDb(base44, args.exercise);
        if(!r) r=keywordResolve(args.exercise);
        return Response.json(rpcResult(id,{ content:[{ type:"text", text:JSON.stringify(r) }], structuredContent:{ ...r, built_by:BUILT_BY, try_also:TRY_ALSO } }),{headers:cors});
      }
      if(name==="search_exercises"){
        const base=publicBase(req);
        const { total, results }=await searchExercisesLogic(base44, args);
        const payload={ total_matched:total, results:results.map((e)=>searchResult(e, base)), built_by:BUILT_BY, try_also:TRY_ALSO };
        return Response.json(rpcResult(id,{ content:[{ type:"text", text:JSON.stringify(payload) }], structuredContent:payload }),{headers:cors});
      }
      if(name==="get_exercise"){
        const base=publicBase(req);
        const r=await getExerciseLogic(base44, args, base);
        const payload={ ...r, attribution:ATTRIBUTION, exercise_db_attribution:"Exercise data from free-exercise-db (CC0-1.0, public domain) by yuhonas.", built_by:BUILT_BY, try_also:TRY_ALSO };
        return Response.json(rpcResult(id,{ content:[{ type:"text", text:JSON.stringify(payload) }], structuredContent:payload }),{headers:cors});
      }
      return Response.json(rpcError(id,-32602,`Unknown tool: ${name}`),{headers:cors});
    }
    return Response.json(rpcError(id,-32601,`Method not found: ${method}`),{headers:cors});
  } catch(error){
    return Response.json(rpcError(id,-32603,error.message),{headers:cors});
  }
});