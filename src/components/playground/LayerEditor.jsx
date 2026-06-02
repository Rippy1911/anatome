import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Plus, X, Layers as LayersIcon } from "lucide-react";
import { MUSCLES, getAnatomicalName } from "@/data/muscleCatalog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

function MuscleCombobox({ onAdd, existing }) {
  const [open, setOpen] = useState(false);
  const available = MUSCLES.filter((m) => !existing.includes(m));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="min-h-[32px] px-2.5 inline-flex items-center gap-1 rounded-full border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors">
          <Plus className="w-3 h-3" /> muscle
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-56" align="start">
        <Command>
          <CommandInput placeholder="Search muscle…" className="text-sm" />
          <CommandList>
            <CommandEmpty>No muscle.</CommandEmpty>
            <CommandGroup>
              {available.map((m) => (
                <CommandItem key={m} value={`${m} ${getAnatomicalName(m)}`} onSelect={() => { onAdd(m); setOpen(false); }}>
                  <span className="font-mono text-xs">{m}</span>
                  <span className="ml-2 text-[10px] text-muted-foreground truncate">{getAnatomicalName(m)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function LayerRow({ layer, index, active, onActivate, onUpdate, onRemove, canRemove }) {
  return (
    <div
      onClick={() => onActivate(index)}
      className={`rounded-xl border p-3 space-y-3 cursor-pointer transition-colors ${
        active ? "border-primary/60 bg-primary/5" : "border-border bg-card hover:border-border/80"
      }`}
    >
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={layer.color}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onUpdate({ ...layer, color: e.target.value })}
          className="h-8 w-8 rounded-md border border-border bg-transparent cursor-pointer p-0.5 shrink-0"
        />
        <span className="font-mono text-xs text-muted-foreground flex-1">{layer.color}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">L{index + 1}</span>
        {canRemove && (
          <button onClick={(e) => { e.stopPropagation(); onRemove(index); }} className="text-muted-foreground hover:text-destructive p-1">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(layer.muscles || []).map((m) => (
          <span key={m} className="min-h-[32px] pl-2.5 pr-1 inline-flex items-center gap-1 rounded-full bg-secondary text-xs">
            <span className="font-mono">{m}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onUpdate({ ...layer, muscles: layer.muscles.filter((x) => x !== m) }); }}
              className="hover:text-destructive p-1"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <MuscleCombobox
          existing={layer.muscles || []}
          onAdd={(m) => onUpdate({ ...layer, muscles: [...(layer.muscles || []), m] })}
        />
      </div>

      {active && (
        <div className="pt-1" onClick={(e) => e.stopPropagation()}>
          <div className="text-[10px] text-muted-foreground mb-1.5">Opacity — {layer.opacity ?? 1}</div>
          <Slider min={0} max={1} step={0.05} value={[layer.opacity ?? 1]} onValueChange={([v]) => onUpdate({ ...layer, opacity: v })} />
        </div>
      )}
    </div>
  );
}

export default function LayerEditor({ layers, setLayers, activeLayer, setActiveLayer }) {
  const updateLayer = (i, l) => setLayers(layers.map((x, idx) => (idx === i ? l : x)));
  const removeLayer = (i) => {
    const next = layers.filter((_, idx) => idx !== i);
    setLayers(next);
    setActiveLayer(Math.max(0, Math.min(activeLayer, next.length - 1)));
  };
  const addLayer = () => {
    const palette = ["#DC2626", "#F59E0B", "#3B82F6", "#10B981", "#A855F7", "#EC4899"];
    setLayers([...layers, { color: palette[layers.length % palette.length], muscles: [], opacity: 1 }]);
    setActiveLayer(layers.length);
  };

  return (
    <div className="space-y-3">
      {layers.map((layer, i) => (
        <LayerRow
          key={i}
          layer={layer}
          index={i}
          active={i === activeLayer}
          onActivate={setActiveLayer}
          onUpdate={(l) => updateLayer(i, l)}
          onRemove={removeLayer}
          canRemove={layers.length > 1}
        />
      ))}
      <Button variant="outline" onClick={addLayer} className="w-full min-h-[44px] gap-2 border-dashed">
        <LayersIcon className="w-4 h-4" /> Add Layer
      </Button>
    </div>
  );
}