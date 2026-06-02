import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const MUSCLES = ["abs","adductors","ankles","biceps","calves","chest","deltoids","feet","forearm","gluteal","hamstring","hands","hair","head","knees","lower-back","neck","obliques","quadriceps","tibialis","trapezius","triceps","upper-back"];
const PALETTE = { primary:"#DC2626", secondary:"#F59E0B", accessory:"#FCD34D", accessoryOpacity:0.5 };
const ATTRIBUTION = "Anatomy paths © Hicham El Boussarghini (MIT). Anatome by NextSolutions.";

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

export function resolve(exerciseRaw){
  const exercise=String(exerciseRaw||"").trim();
  const key=exercise.toLowerCase().replace(/\s+/g," ").trim();

  // 1. exact
  if(EXERCISE_MAP[key]){
    const plan=EXERCISE_MAP[key];
    return { exercise:key, matched:true, source:"exact", layers:intensityLayers(plan),
      explanation:`"${key}" — primary: ${plan.layers[0].muscles.join(", ")||"none"}; secondary: ${plan.layers[1].muscles.join(", ")||"none"}; accessory: ${plan.layers[2].muscles.join(", ")||"none"}.` };
  }
  // 2. prefix
  const prefix=Object.keys(EXERCISE_MAP).find((k)=>k.startsWith(key)||key.startsWith(k));
  if(prefix){
    const plan=EXERCISE_MAP[prefix];
    return { exercise:prefix, matched:true, source:"prefix", layers:intensityLayers(plan),
      explanation:`Closest match for "${key}" is "${prefix}". Primary: ${plan.layers[0].muscles.join(", ")}.` };
  }
  // 3. keyword fallback: search exercise text for muscle slug substrings
  const hits=MUSCLES.filter((m)=>key.includes(m)||key.includes(m.replace("-"," ")));
  if(hits.length>0){
    return { exercise:key, matched:true, source:"keyword_fallback", layers:[{ color:PALETTE.primary, muscles:hits }],
      explanation:`No exercise entry for "${key}". Matched muscle keywords: ${hits.join(", ")}.` };
  }
  // 4. unmatched
  return { exercise:key, matched:false, source:"unmatched", layers:[],
    explanation:`Could not resolve "${key}". Try a common exercise name like "bench press" or "deadlift".` };
}

Deno.serve(async (req)=>{
  try {
    createClientFromRequest(req);
    let exercise="";
    if(req.method==="POST"){ try { const b=await req.json(); exercise=b.exercise||""; } catch { exercise=""; } }
    else { exercise=new URL(req.url).searchParams.get("exercise")||""; }
    const r=resolve(exercise);
    return Response.json({ ok:true, ...r, attribution:ATTRIBUTION, license:"MIT" }, { headers:{ "Access-Control-Allow-Origin":"*" } });
  } catch(error){
    return Response.json({ ok:false, error:error.message }, { status:500 });
  }
});