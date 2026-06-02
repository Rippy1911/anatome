import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ---- Inlined catalog ----
const MUSCLES = ["abs","adductors","ankles","biceps","calves","chest","deltoids","feet","forearm","gluteal","hamstring","hands","hair","head","knees","lower-back","neck","obliques","quadriceps","tibialis","trapezius","triceps","upper-back"];
const ALIASES = { shoulders:"deltoids",deltoid:"deltoids",shoulder:"deltoids",gluteus:"gluteal",glutes:"gluteal",glute:"gluteal",calfs:"calves",calf:"calves",quads:"quadriceps",quad:"quadriceps",hamstrings:"hamstring",abdominals:"abs",ab:"abs",lats:"upper-back",lat:"upper-back",back:"upper-back",traps:"trapezius",trap:"trapezius",bicep:"biceps",tricep:"triceps",pecs:"chest",pec:"chest",oblique:"obliques",lowerback:"lower-back",upperback:"upper-back" };
function normalizeSlug(input){ if(!input) return input; const s=String(input).trim().toLowerCase(); if(MUSCLES.includes(s)) return s; if(ALIASES[s]) return ALIASES[s]; return s; }

const WRAPPER = { male:{front:{viewBox:"0 0 724 1448"},back:{viewBox:"724 0 724 1448"}}, female:{front:{viewBox:"-50 -40 734 1538"},back:{viewBox:"756 0 774 1448"}} };
const DEFAULTS = { gender:"male",view:"dual",width:768,height:1024,background:"transparent",body_color:"#3f3f3f",border_color:"#dfdfdf",border_width:1 };
const ATTRIBUTION = "Anatomy paths © Hicham El Boussarghini (MIT). Anatome by NextSolutions.";
const ATTRIBUTION_SOURCE = "https://github.com/HichamELBSI/react-native-body-highlighter";

function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

function buildResolution(payload){
  const res={}; const layers=Array.isArray(payload.layers)?payload.layers:[];
  layers.forEach((layer)=>{ const color=layer.color; const op=layer.opacity!=null?layer.opacity:1;
    (layer.muscles||[]).forEach((m)=>{ const slug=normalizeSlug(m); res[slug]={fill:color,opacity:op,stroke:layer.stroke,strokeWidth:layer.strokeWidth}; }); });
  const pm=payload.per_muscle||{};
  Object.keys(pm).forEach((m)=>{ const slug=normalizeSlug(m); const o=pm[m]||{};
    res[slug]={ fill:o.fill!=null?o.fill:(res[slug]&&res[slug].fill), opacity:o.opacity!=null?o.opacity:(res[slug]?res[slug].opacity:1), stroke:o.stroke!=null?o.stroke:(res[slug]&&res[slug].stroke), strokeWidth:o.strokeWidth!=null?o.strokeWidth:(res[slug]&&res[slug].strokeWidth) }; });
  return res;
}

function defsBlock(defs){
  if(!Array.isArray(defs)||defs.length===0) return "";
  const parts=defs.map((d)=>{ const stops=(d.stops||[]).map((s)=>`<stop offset="${esc(s.offset)}" stop-color="${esc(s.color)}"${s.opacity!=null?` stop-opacity="${s.opacity}"`:""}/>`).join("");
    if(d.type==="linearGradient"){ const coords=`${d.x1!=null?` x1="${esc(d.x1)}"`:""}${d.y1!=null?` y1="${esc(d.y1)}"`:""}${d.x2!=null?` x2="${esc(d.x2)}"`:""}${d.y2!=null?` y2="${esc(d.y2)}"`:""}`; return `<linearGradient id="${esc(d.id)}"${coords}>${stops}</linearGradient>`; }
    if(d.type==="radialGradient") return `<radialGradient id="${esc(d.id)}">${stops}</radialGradient>`;
    return ""; });
  return `<defs>${parts.join("")}</defs>`;
}

function renderSide(parts,res,opts,sideFilter,transform){
  const {body_color,border_color,border_width}=opts; const rendered=new Set(); const out=[];
  parts.forEach((part)=>{ const slug=part.slug; const style=res[slug]; const filterSide=sideFilter&&sideFilter[slug]; const path=part.path||{};
    const emit=(d,whichSide)=>{ let fill=body_color,opacity=1,stroke=border_color,strokeWidth=border_width;
      if(style&&style.fill!=null){ if(!filterSide||filterSide===whichSide||whichSide==="common"){ fill=style.fill; if(style.opacity!=null)opacity=style.opacity; if(style.stroke!=null)stroke=style.stroke; if(style.strokeWidth!=null)strokeWidth=style.strokeWidth; } }
      if(MUSCLES.includes(slug)||style) rendered.add(slug);
      out.push(`<path d="${d}" fill="${esc(fill)}" stroke="${esc(stroke)}" stroke-width="${strokeWidth}" opacity="${opacity}" data-muscle="${esc(slug)}"/>`); };
    (path.common||[]).forEach((d)=>emit(d,"common")); (path.left||[]).forEach((d)=>emit(d,"left")); (path.right||[]).forEach((d)=>emit(d,"right"));
  });
  const g=transform?`<g transform="${transform}">${out.join("")}</g>`:out.join(""); return {svg:g,rendered:Array.from(rendered)};
}

function renderMuscleSvg(payload,bodyData){
  const p={...DEFAULTS,...payload}; const gender=p.gender==="female"?"female":"male"; const view=["front","back","dual"].includes(p.view)?p.view:"dual";
  const data=(bodyData&&bodyData[gender])||{front:[],back:[]}; const res=buildResolution(p); const sideFilter=p.side_filter||null;
  let inner="",viewBox; const renderedSet=new Set(); const collect=(r)=>r.rendered.forEach((s)=>renderedSet.add(s));
  if(view==="front"){ const r=renderSide(data.front,res,p,sideFilter,null); inner=r.svg; collect(r); viewBox=WRAPPER[gender].front.viewBox; }
  else if(view==="back"){ const r=renderSide(data.back,res,p,sideFilter,null); inner=r.svg; collect(r); viewBox=WRAPPER[gender].back.viewBox; }
  else { const rf=renderSide(data.front,res,p,sideFilter,null); const rb=renderSide(data.back,res,p,sideFilter,"translate(0, 0)"); collect(rf); collect(rb); inner=`${rf.svg}${rb.svg}`; viewBox="0 0 1448 1448"; }
  const defs=defsBlock(p.defs); const bg=p.background&&p.background!=="transparent"?`<rect x="-99999" y="-99999" width="199998" height="199998" fill="${esc(p.background)}"/>`:"";
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${p.width}" height="${p.height}" preserveAspectRatio="xMidYMid meet">`+defs+bg+inner+`</svg>`;
  return {svg,muscles_rendered:Array.from(renderedSet).filter((s)=>MUSCLES.includes(s))};
}

async function loadBody(base44){
  const records=await base44.asServiceRole.entities.BodyData.list();
  const map={}; for(const r of records) map[r.key]=r.parts||[];
  return { male:{front:map.bodyFrontMale||[],back:map.bodyBackMale||[]}, female:{front:map.bodyFrontFemale||[],back:map.bodyBackFemale||[]} };
}

// ---- Compact GET layer encoding: COLOR[@OPACITY]:m1,m2|COLOR:m3 ----
function parseCompactLayers(str){
  if(!str) return [];
  return str.split("|").map((layerStr)=>{
    const idx=layerStr.indexOf(":");
    const colorPart=idx===-1?layerStr:layerStr.slice(0,idx);
    const musclesPart=idx===-1?"":layerStr.slice(idx+1);
    const [colorRaw,opacityStr]=colorPart.split("@");
    let color=colorRaw;
    if(/^[0-9a-fA-F]{3,8}$/.test(colorRaw)) color="#"+colorRaw;
    const muscles=(musclesPart||"").split(",").map((s)=>s.trim()).filter(Boolean);
    const layer={color,muscles};
    if(opacityStr) layer.opacity=parseFloat(opacityStr);
    return layer;
  }).filter((l)=>l.muscles.length>0);
}

function decodeB64Json(b64){
  try { return JSON.parse(atob(b64)); } catch { return undefined; }
}

// Parse GET query into a payload.
function payloadFromQuery(url){
  const q=url.searchParams; const p={};
  if(q.get("gender")) p.gender=q.get("gender");
  if(q.get("view")) p.view=q.get("view");
  if(q.get("width")) p.width=Number(q.get("width"));
  if(q.get("height")) p.height=Number(q.get("height"));
  if(q.get("background")) p.background=q.get("background");
  if(q.get("body_color")) p.body_color=q.get("body_color");
  if(q.get("border_color")) p.border_color=q.get("border_color");
  if(q.get("border_width")) p.border_width=Number(q.get("border_width"));
  if(q.get("format")) p.format=q.get("format");
  if(q.get("output")) p.output=q.get("output");
  if(q.get("defs")){ const d=decodeB64Json(q.get("defs")); if(d) p.defs=d; }
  if(q.get("per_muscle")){ const pm=decodeB64Json(q.get("per_muscle")); if(pm) p.per_muscle=pm; }
  // Backwards compat: flat muscles param
  if(q.get("muscles")){ p.layers=[{ color:q.get("color")||"#DC2626", muscles:q.get("muscles").split(",").map((s)=>s.trim()).filter(Boolean) }]; }
  // Compact layers param wins if present
  if(q.get("layers")){ p.layers=parseCompactLayers(q.get("layers")); }
  return p;
}

// ---- Rate limiting ----
async function sha256(str){
  const data=new TextEncoder().encode(str);
  const buf=await crypto.subtle.digest("SHA-256",data);
  return Array.from(new Uint8Array(buf)).map((b)=>b.toString(16).padStart(2,"0")).join("");
}
function clientIp(req){
  return req.headers.get("cf-connecting-ip") || (req.headers.get("x-forwarded-for")||"").split(",")[0].trim() || "unknown";
}
function utcMidnightUnix(){
  const now=new Date();
  const next=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1,0,0,0));
  return Math.floor(next.getTime()/1000);
}
const RATE_LIMIT=100;
async function checkRateLimit(req,base44){
  const proxySecret=req.headers.get("x-rapidapi-proxy-secret");
  const expected=Deno.env.get("PROXY_SECRET");
  if(proxySecret && expected && proxySecret===expected) return { allowed:true, source:"rapidapi" };
  const ip=clientIp(req);
  const ip_hash=await sha256(ip);
  const date=new Date().toISOString().slice(0,10);
  const existing=await base44.asServiceRole.entities.RateLimit.filter({ ip_hash, date });
  const reset=utcMidnightUnix();
  if(existing && existing.length>0){
    const rec=existing[0]; const count=rec.count||0;
    if(count>=RATE_LIMIT) return { allowed:false, source:"free", used:count, remaining:0, reset, retry_after:reset-Math.floor(Date.now()/1000) };
    await base44.asServiceRole.entities.RateLimit.update(rec.id,{ count:count+1, last_request_at:new Date().toISOString() });
    return { allowed:true, source:"free", used:count+1, remaining:RATE_LIMIT-(count+1), reset };
  }
  await base44.asServiceRole.entities.RateLimit.create({ ip_hash, date, count:1, last_request_at:new Date().toISOString() });
  return { allowed:true, source:"free", used:1, remaining:RATE_LIMIT-1, reset };
}
function rateHeaders(rl){
  return { "X-RateLimit-Limit":String(RATE_LIMIT), "X-RateLimit-Remaining":String(rl.remaining!=null?rl.remaining:RATE_LIMIT), "X-RateLimit-Reset":String(rl.reset||utcMidnightUnix()) };
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

    const url=new URL(req.url);
    let payload={};
    if(req.method==="POST"){ try { payload=await req.json(); } catch { payload={}; } }
    else { payload=payloadFromQuery(url); }

    const t0=Date.now();
    const bodyData=await loadBody(base44);
    const { svg, muscles_rendered }=renderMuscleSvg(payload,bodyData);
    const duration_ms=Date.now()-t0;
    const format=payload.format==="png"?"png":"svg";
    const output=payload.output==="raw"?"raw":"json";
    const gender=payload.gender==="female"?"female":"male";
    const view=["front","back","dual"].includes(payload.view)?payload.view:"dual";

    let png_status;
    if(format==="png") png_status="not_supported_in_v1, use SVG and convert client-side";

    if(output==="raw"){
      return new Response(svg, { status:200, headers:{ "Content-Type":"image/svg+xml; charset=utf-8", "Cache-Control":"public, max-age=3600", ...cors, ...rateHeaders(rl) } });
    }

    return new Response(JSON.stringify({
      ok:true, svg, format:"svg", gender, view, muscles_rendered,
      available_muscles_count:MUSCLES.length,
      ...(png_status?{png_status}:{}),
      rate_limit:{ source:rl.source, remaining:rl.remaining!=null?rl.remaining:null, limit:RATE_LIMIT },
      attribution:ATTRIBUTION, attribution_source:ATTRIBUTION_SOURCE, license:"MIT", duration_ms,
    }), { headers:{ ...cors, "Content-Type":"application/json", ...rateHeaders(rl) } });
  } catch(error){
    return Response.json({ ok:false, error:error.message }, { status:500, headers:cors });
  }
});