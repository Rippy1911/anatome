import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-flex w-full rounded-lg bg-secondary p-1 gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 min-h-[40px] rounded-md text-sm font-medium capitalize transition-colors ${
            value === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-10 rounded-md border border-border bg-transparent cursor-pointer p-0.5 shrink-0"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono text-xs h-10" />
      </div>
    </div>
  );
}

export default function BodyControls({ settings, onChange }) {
  const set = (patch) => onChange({ ...settings, ...patch });

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Gender</Label>
        <Segmented
          value={settings.gender}
          onChange={(v) => set({ gender: v })}
          options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">View</Label>
        <Segmented
          value={settings.view}
          onChange={(v) => set({ view: v })}
          options={[{ value: "front", label: "Front" }, { value: "back", label: "Back" }, { value: "dual", label: "Dual" }]}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ColorField label="Body color" value={settings.bodyColor} onChange={(v) => set({ bodyColor: v })} />
        <ColorField label="Border color" value={settings.borderColor} onChange={(v) => set({ borderColor: v })} />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Border width — {settings.borderWidth}</Label>
        <Slider min={0} max={6} step={0.5} value={[settings.borderWidth]} onValueChange={([v]) => set({ borderWidth: v })} />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Background</Label>
        <Segmented
          value={settings.background}
          onChange={(v) => set({ background: v })}
          options={[{ value: "transparent", label: "None" }, { value: "#ffffff", label: "White" }, { value: "#000000", label: "Black" }]}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Width</Label>
          <Input type="number" min={64} max={4096} value={settings.width} onChange={(e) => set({ width: Number(e.target.value) })} className="h-10 font-mono text-xs" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Height</Label>
          <Input type="number" min={64} max={4096} value={settings.height} onChange={(e) => set({ height: Number(e.target.value) })} className="h-10 font-mono text-xs" />
        </div>
      </div>
    </div>
  );
}