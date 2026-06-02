import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// One-time importer: fetches the free-exercise-db (CC0-1.0, public domain) dataset,
// maps each exercise's source muscle names to Anatome's 23 canonical slugs,
// pre-computes the compact GET image URL, and stores everything in the Exercise entity.

const SOURCE_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";

// Map ExerciseDB source muscle names -> Anatome canonical slugs (arrays, can be 1+).
const MUSCLE_NAME_MAP = {
  "abdominals": ["abs"],
  "abductors": ["adductors"],     // ExerciseDB uses "abductors" for hip work; nearest Anatome slug
  "adductors": ["adductors"],
  "biceps": ["biceps"],
  "calves": ["calves"],
  "chest": ["chest"],
  "forearms": ["forearm"],
  "glutes": ["gluteal"],
  "hamstrings": ["hamstring"],
  "lats": ["upper-back"],
  "lower back": ["lower-back"],
  "middle back": ["upper-back"],
  "neck": ["neck"],
  "quadriceps": ["quadriceps"],
  "shoulders": ["deltoids"],
  "traps": ["trapezius"],
  "triceps": ["triceps"],
};

const PALETTE = { primary:"#DC2626", secondary:"#F59E0B" };

function mapMuscles(names, unmappedSet){
  const slugs=new Set();
  (names||[]).forEach((n)=>{
    const key=String(n||"").trim().toLowerCase();
    const mapped=MUSCLE_NAME_MAP[key];
    if(mapped){ mapped.forEach((s)=>slugs.add(s)); }
    else { unmappedSet.add(key); }
  });
  return Array.from(slugs);
}

function compactLayers(primarySlugs, secondarySlugs){
  const parts=[];
  if(primarySlugs.length) parts.push(`DC2626:${primarySlugs.join(",")}`);
  if(secondarySlugs.length) parts.push(`F59E0B:${secondarySlugs.join(",")}`);
  return parts.join("|");
}

Deno.serve(async (req)=>{
  try {
    const base44=createClientFromRequest(req);
    const user=await base44.auth.me().catch(()=>null);
    if(user && user.role!=="admin"){ return Response.json({ ok:false, error:"Forbidden: admin only" }, { status:403 }); }

    const resp=await fetch(SOURCE_URL);
    if(!resp.ok) return Response.json({ ok:false, error:`fetch ${resp.status}` }, { status:502 });
    const data=await resp.json();

    // Clear existing to keep import idempotent (concurrent batches to avoid timeout).
    const existing=await base44.asServiceRole.entities.Exercise.list("-created_date", 2000);
    for(let i=0;i<existing.length;i+=25){
      await Promise.all(existing.slice(i,i+25).map((e)=>base44.asServiceRole.entities.Exercise.delete(e.id)));
    }

    const unmapped=new Set();
    const records=data.map((ex)=>{
      const primary=mapMuscles(ex.primaryMuscles, unmapped);
      const secondary=mapMuscles(ex.secondaryMuscles, unmapped).filter((s)=>!primary.includes(s));
      const layers=[];
      if(primary.length) layers.push({ color:PALETTE.primary, muscles:primary });
      if(secondary.length) layers.push({ color:PALETTE.secondary, muscles:secondary });
      const compact=compactLayers(primary, secondary);
      // Stored as a relative path; getExercise/resolveExercise rewrite to an absolute
      // public URL using the request's forwarded host so <img src> works anonymously.
      const imageSrc=compact
        ? `/functions/generateImage?gender=male&view=dual&layers=${encodeURIComponent(compact)}&output=raw`
        : "";
      const exUnmapped=[];
      [...(ex.primaryMuscles||[]),...(ex.secondaryMuscles||[])].forEach((n)=>{ const k=String(n||"").trim().toLowerCase(); if(!MUSCLE_NAME_MAP[k]) exUnmapped.push(k); });
      return {
        ext_id: ex.id, name: ex.name, name_lower: String(ex.name||"").toLowerCase(),
        force: ex.force||"", level: ex.level||"", mechanic: ex.mechanic||"", equipment: ex.equipment||"", category: ex.category||"",
        primaryMuscles: ex.primaryMuscles||[], secondaryMuscles: ex.secondaryMuscles||[],
        instructions: ex.instructions||[], images: ex.images||[],
        anatome_primary_slugs: primary, anatome_secondary_slugs: secondary,
        anatome_layers_payload: layers, anatome_imageSrc: imageSrc,
        unmapped_source_muscle: Array.from(new Set(exUnmapped)),
      };
    });

    // Bulk insert in chunks.
    let created=0;
    for(let i=0;i<records.length;i+=100){
      const chunk=records.slice(i,i+100);
      await base44.asServiceRole.entities.Exercise.bulkCreate(chunk);
      created+=chunk.length;
    }

    const unmappedList=Array.from(unmapped);
    if(unmappedList.length) console.warn("Unmapped source muscles:", unmappedList.join(", "));

    return Response.json({ ok:true, created, source_total:data.length, unmapped_source_muscles:unmappedList });
  } catch(error){
    return Response.json({ ok:false, error:error.message }, { status:500 });
  }
});