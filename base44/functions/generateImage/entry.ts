import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ---- Inlined catalog (single source mirrored from src/data/muscleCatalog.js) ----
const MUSCLES = ["abs","adductors","ankles","biceps","calves","chest","deltoids","feet","forearm","gluteal","hamstring","hands","hair","head","knees","lower-back","neck","obliques","quadriceps","tibialis","trapezius","triceps","upper-back"];
const ALIASES = { shoulders:"deltoids",deltoid:"deltoids",shoulder:"deltoids",gluteus:"gluteal",glutes:"gluteal",glute:"gluteal",calfs:"calves",calf:"calves",quads:"quadriceps",quad:"quadriceps",hamstrings:"hamstring",abdominals:"abs",ab:"abs",lats:"upper-back",lat:"upper-back",back:"upper-back",traps:"trapezius",trap:"trapezius",bicep:"biceps",tricep:"triceps",pecs:"chest",pec:"chest",oblique:"obliques",lowerback:"lower-back",upperback:"upper-back" };
function normalizeSlug(input){ if(!input) return input; const s=String(input).trim().toLowerCase(); if(MUSCLES.includes(s)) return s; if(ALIASES[s]) return ALIASES[s]; return s; }

const WRAPPER = {
  male: { front:{viewBox:"0 0 724 1448"}, back:{viewBox:"724 0 724 1448"} },
  female: { front:{viewBox:"-50 -40 734 1538"}, back:{viewBox:"756 0 774 1448"} },
};

const DEFAULTS = { gender:"male", view:"dual", width:768, height:1024, background:"transparent", body_color:"#3f3f3f", border_color:"#dfdfdf", border_width:1 };
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
  const g=transform?`<g transform="${transform}">${out.join("")}</g>`:out.join("");
  return {svg:g,rendered:Array.from(rendered)};
}

function renderMuscleSvg(payload,bodyData){
  const p={...DEFAULTS,...payload}; const gender=p.gender==="female"?"female":"male";
  const view=["front","back","dual"].includes(p.view)?p.view:"dual";
  const data=(bodyData&&bodyData[gender])||{front:[],back:[]};
  const res=buildResolution(p); const sideFilter=p.side_filter||null;
  let inner="",viewBox; const renderedSet=new Set(); const collect=(r)=>r.rendered.forEach((s)=>renderedSet.add(s));
  if(view==="front"){ const r=renderSide(data.front,res,p,sideFilter,null); inner=r.svg; collect(r); viewBox=WRAPPER[gender].front.viewBox; }
  else if(view==="back"){ const r=renderSide(data.back,res,p,sideFilter,null); inner=r.svg; collect(r); viewBox=WRAPPER[gender].back.viewBox; }
  else { const rf=renderSide(data.front,res,p,sideFilter,null); const rb=renderSide(data.back,res,p,sideFilter,`translate(0, 0)`); collect(rf); collect(rb); inner=`${rf.svg}${rb.svg}`; viewBox=`0 0 1448 1448`; }
  const defs=defsBlock(p.defs);
  const bg=p.background&&p.background!=="transparent"?`<rect x="-99999" y="-99999" width="199998" height="199998" fill="${esc(p.background)}"/>`:"";
  const vb=viewBox.split(" ").map(Number); const attrX=(vb[0]||0)+(vb[2]||724)-8; const attrY=(vb[1]||0)+(vb[3]||1448)-10;
  const attribution=`<text x="${attrX}" y="${attrY}" text-anchor="end" font-family="sans-serif" font-size="14" fill="#888888" opacity="0.5">Anatomy paths © Hicham El Boussarghini (MIT)</text>`;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${p.width}" height="${p.height}" preserveAspectRatio="xMidYMid meet">`+defs+bg+inner+attribution+`</svg>`;
  return {svg,muscles_rendered:Array.from(renderedSet).filter((s)=>MUSCLES.includes(s))};
}

async function loadBody(base44){
  const records=await base44.asServiceRole.entities.BodyData.list();
  const map={}; for(const r of records) map[r.key]=r.parts||[];
  return { male:{front:map.bodyFrontMale||[],back:map.bodyBackMale||[]}, female:{front:map.bodyFrontFemale||[],back:map.bodyBackFemale||[]} };
}

// Parse GET query into a payload (simplified comma syntax).
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
  // muscles=chest,abs&color=#FF0000  -> single layer
  if(q.get("muscles")){ p.layers=[{ color:q.get("color")||"#DC2626", muscles:q.get("muscles").split(",").map((s)=>s.trim()).filter(Boolean) }]; }
  // layers=chest,abs:#FF0000|triceps:#0000FF  -> multi layer "muscles:color" pipe-separated
  if(q.get("layers")){ p.layers=q.get("layers").split("|").map((grp)=>{ const [muscles,color]=grp.split(":"); return { color:color||"#DC2626", muscles:(muscles||"").split(",").map((s)=>s.trim()).filter(Boolean) }; }); }
  return p;
}

Deno.serve(async (req)=>{
  try {
    const base44=createClientFromRequest(req);
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
      return new Response(svg, { status:200, headers:{ "Content-Type":"image/svg+xml; charset=utf-8", "Access-Control-Allow-Origin":"*" } });
    }

    return Response.json({
      ok:true, svg, format:"svg", gender, view, muscles_rendered,
      available_muscles_count:MUSCLES.length,
      ...(png_status?{png_status}:{}),
      attribution:ATTRIBUTION, attribution_source:ATTRIBUTION_SOURCE, license:"MIT", duration_ms,
    }, { headers:{ "Access-Control-Allow-Origin":"*" } });
  } catch(error){
    return Response.json({ ok:false, error:error.message }, { status:500 });
  }
});