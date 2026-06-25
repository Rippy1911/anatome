import React, { useMemo, useRef, useState } from "react";
import { renderMuscleSvg, getAnatomicalName } from "@/lib/muscleEngine";

export default function MuscleBody({
  gender, view, layers, defs, perMuscle, sideFilter,
  bodyColor, borderColor, borderWidth, background,
  contour, contourColor, contourStroke, contourWidth,
  bodyData, onMuscleClick,
}) {
  const containerRef = useRef(null);
  const [tip, setTip] = useState(null);

  const { svg } = useMemo(() => {
    if (!bodyData) return { svg: "" };
    const payload = {
      gender, view, layers, defs, per_muscle: perMuscle, side_filter: sideFilter,
      body_color: bodyColor, border_color: borderColor, border_width: borderWidth,
      background,
      contour,
      contour_color: contourColor || undefined,
      contour_stroke: contourStroke || undefined,
      contour_width: contourWidth != null && contourWidth !== "" ? Number(contourWidth) : undefined,
    };
    return renderMuscleSvg(payload, bodyData);
  }, [gender, view, layers, defs, perMuscle, sideFilter, bodyColor, borderColor, borderWidth, background, contour, contourColor, contourStroke, contourWidth, bodyData]);

  const handleClick = (e) => {
    const m = e.target?.dataset?.muscle;
    if (m && onMuscleClick) onMuscleClick(m);
  };

  const handleMove = (e) => {
    const m = e.target?.dataset?.muscle;
    if (m) {
      const rect = containerRef.current.getBoundingClientRect();
      setTip({ name: getAnatomicalName(m), slug: m, x: e.clientX - rect.left, y: e.clientY - rect.top });
    } else {
      setTip(null);
    }
  };

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      onMouseMove={handleMove}
      onMouseLeave={() => setTip(null)}
      className="relative w-full aspect-[3/5] flex items-center justify-center select-none [&_path]:cursor-pointer [&_path]:transition-[fill] [&_path]:duration-200 [&_svg]:max-h-full [&_svg]:max-w-full [&_svg]:h-full [&_svg]:w-auto"
    >
      {!bodyData ? (
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="w-7 h-7 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
          <span className="text-xs font-mono">loading anatomy…</span>
        </div>
      ) : (
        <div className="h-full w-full flex items-center justify-center" dangerouslySetInnerHTML={{ __html: svg }} />
      )}

      {tip && (
        <div
          className="pointer-events-none absolute z-20 px-2.5 py-1.5 rounded-md bg-popover border border-border shadow-xl text-xs whitespace-nowrap"
          style={{ left: Math.min(tip.x + 14, (containerRef.current?.clientWidth || 300) - 140), top: tip.y + 14 }}
        >
          <div className="font-medium text-foreground">{tip.name}</div>
          <div className="font-mono text-[10px] text-muted-foreground">{tip.slug}</div>
        </div>
      )}
    </div>
  );
}