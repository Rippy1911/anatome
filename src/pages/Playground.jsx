import React, { useEffect, useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { loadBodyData } from "@/data/bodyDataLoader";
import MuscleBody from "@/components/playground/MuscleBody";
import LayerEditor from "@/components/playground/LayerEditor";
import BodyControls from "@/components/playground/BodyControls";
import AIAssist from "@/components/playground/AIAssist";
import RequestPanel from "@/components/playground/RequestPanel";
import HealthBar from "@/components/playground/HealthBar";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Layers, SlidersHorizontal, Sparkles, Code2 } from "lucide-react";

const DEFAULT_SETTINGS = {
  gender: "male", view: "dual", bodyColor: "#3f3f3f", borderColor: "#dfdfdf",
  borderWidth: 1, background: "transparent", width: 768, height: 1024,
};

function Section({ icon: Icon, title, children, className = "" }) {
  return (
    <div className={`rounded-2xl border border-border bg-card p-4 sm:p-5 ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export default function Playground() {
  const { theme } = useTheme();
  const [bodyData, setBodyData] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [layers, setLayers] = useState([{ color: "#DC2626", muscles: [], opacity: 1 }]);
  const [activeLayer, setActiveLayer] = useState(0);
  const [bodyColorTouched, setBodyColorTouched] = useState(false);
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const previewBg = theme === "dark" ? "#0a0e17" : "#f1f5f9";

  useEffect(() => { loadBodyData().then(setBodyData); }, []);

  // Default body color follows the theme until the user picks one manually.
  useEffect(() => {
    if (!bodyColorTouched) {
      setSettings((s) => ({ ...s, bodyColor: theme === "dark" ? "#3f3f3f" : "#d4d4d8" }));
    }
  }, [theme, bodyColorTouched]);

  const handleSettingsChange = (next) => {
    if (next.bodyColor !== settings.bodyColor) setBodyColorTouched(true);
    setSettings(next);
  };

  const handleMuscleClick = (slug) => {
    setLayers((prev) => prev.map((l, i) => {
      if (i !== activeLayer) return l;
      const has = (l.muscles || []).includes(slug);
      return { ...l, muscles: has ? l.muscles.filter((m) => m !== slug) : [...(l.muscles || []), slug] };
    }));
  };

  const preview = (
    <MuscleBody
      gender={settings.gender}
      view={settings.view}
      layers={layers}
      bodyColor={settings.bodyColor}
      borderColor={settings.borderColor}
      borderWidth={settings.borderWidth}
      background={settings.background === "transparent" ? "transparent" : settings.background}
      bodyData={bodyData}
      onMuscleClick={handleMuscleClick}
    />
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Desktop */}
      <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-6">
        {/* Left: preview + body controls (sticky) */}
        <div className="space-y-6">
          <div className="sticky top-20 space-y-6">
            <Section icon={SlidersHorizontal} title="Preview" className="p-0 overflow-hidden">
              <div className="px-2 pb-2">
                <div className="rounded-xl border border-border overflow-hidden" style={{ backgroundColor: previewBg }}>{preview}</div>
              </div>
              <p className="px-4 pb-4 text-xs text-muted-foreground">Click a muscle to toggle it in the active layer. Hover for its anatomical name.</p>
            </Section>
            <Section icon={SlidersHorizontal} title="Body">
              <BodyControls settings={settings} onChange={handleSettingsChange} />
            </Section>
          </div>
        </div>

        {/* Right: layers, AI, request */}
        <div className="space-y-6">
          <Section icon={Layers} title="Layers">
            <LayerEditor layers={layers} setLayers={setLayers} activeLayer={activeLayer} setActiveLayer={setActiveLayer} />
          </Section>
          <Section icon={Sparkles} title="AI Assist">
            <AIAssist onResolve={(l) => { setLayers(l); setActiveLayer(0); }} currentLayers={layers} />
          </Section>
          <Section icon={Code2} title="API Request">
            <RequestPanel settings={settings} layers={layers} baseUrl={baseUrl} />
          </Section>
        </div>
      </div>

      {/* Mobile */}
      <div className="md:hidden space-y-4">
        <div className="rounded-2xl border border-border overflow-hidden" style={{ backgroundColor: previewBg }}>{preview}</div>
        <p className="text-xs text-muted-foreground px-1">Tap a muscle to toggle it in the active layer.</p>
        <Accordion type="single" collapsible defaultValue="layers" className="space-y-3">
          <AccordionItem value="layers" className="rounded-2xl border border-border bg-card px-4">
            <AccordionTrigger className="text-sm font-semibold"><span className="flex items-center gap-2"><Layers className="w-4 h-4 text-primary" /> Layers</span></AccordionTrigger>
            <AccordionContent className="pt-1 pb-4">
              <LayerEditor layers={layers} setLayers={setLayers} activeLayer={activeLayer} setActiveLayer={setActiveLayer} />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="body" className="rounded-2xl border border-border bg-card px-4">
            <AccordionTrigger className="text-sm font-semibold"><span className="flex items-center gap-2"><SlidersHorizontal className="w-4 h-4 text-primary" /> Body</span></AccordionTrigger>
            <AccordionContent className="pt-1 pb-4"><BodyControls settings={settings} onChange={handleSettingsChange} /></AccordionContent>
          </AccordionItem>
          <AccordionItem value="ai" className="rounded-2xl border border-border bg-card px-4">
            <AccordionTrigger className="text-sm font-semibold"><span className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> AI Assist</span></AccordionTrigger>
            <AccordionContent className="pt-1 pb-4"><AIAssist onResolve={(l) => { setLayers(l); setActiveLayer(0); }} currentLayers={layers} /></AccordionContent>
          </AccordionItem>
          <AccordionItem value="api" className="rounded-2xl border border-border bg-card px-4">
            <AccordionTrigger className="text-sm font-semibold"><span className="flex items-center gap-2"><Code2 className="w-4 h-4 text-primary" /> API Request</span></AccordionTrigger>
            <AccordionContent className="pt-1 pb-4"><RequestPanel settings={settings} layers={layers} baseUrl={baseUrl} /></AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card overflow-hidden">
        <HealthBar />
      </div>
    </div>
  );
}