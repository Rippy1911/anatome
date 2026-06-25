import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const MUSCLES = ["abs","adductors","ankles","biceps","calves","chest","deltoids","feet","forearm","gluteal","hamstring","hands","hair","head","knees","lower-back","neck","obliques","quadriceps","tibialis","trapezius","triceps","upper-back"];
const ANATOMICAL_NAMES = { abs:"Rectus Abdominis",adductors:"Adductor Group",ankles:"Ankles",biceps:"Biceps Brachii",calves:"Gastrocnemius / Soleus",chest:"Pectoralis Major",deltoids:"Deltoids",feet:"Feet",forearm:"Forearm Flexors / Extensors",gluteal:"Gluteus Maximus / Medius",hamstring:"Hamstrings",hands:"Hands",hair:"Hair",head:"Head",knees:"Knees","lower-back":"Erector Spinae (Lower Back)",neck:"Sternocleidomastoid (Neck)",obliques:"Obliques",quadriceps:"Quadriceps Femoris",tibialis:"Tibialis Anterior",trapezius:"Trapezius",triceps:"Triceps Brachii","upper-back":"Latissimus Dorsi (Upper Back)" };
const SIDE_PRESENCE = { abs:["front"],adductors:["front","back"],ankles:["front","back"],biceps:["front"],calves:["front","back"],chest:["front"],deltoids:["front","back"],feet:["front","back"],forearm:["front","back"],gluteal:["back"],hamstring:["back"],hands:["front","back"],hair:["front","back"],head:["front","back"],knees:["front"],"lower-back":["back"],neck:["front","back"],obliques:["front"],quadriceps:["front"],tibialis:["front"],trapezius:["front","back"],triceps:["front","back"],"upper-back":["back"] };
const ATTRIBUTION = "Anatomy paths © Hicham El Boussarghini (MIT). Anatome by NextSolutions.";

Deno.serve(async (req) => {
  try {
    createClientFromRequest(req);
    const muscles = MUSCLES.map((slug) => ({ slug, name: ANATOMICAL_NAMES[slug], views: SIDE_PRESENCE[slug] }));
    return Response.json({
      ok: true, count: MUSCLES.length, muscles, attribution: ATTRIBUTION, license: "Apache-2.0",
    }, { headers: { "Access-Control-Allow-Origin": "*" } });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});