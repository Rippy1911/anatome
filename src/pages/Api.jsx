import React, { useEffect, useState } from "react";

export default function Api() {
  const [ready, setReady] = useState(false);
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    const specUrl = `${baseUrl}/functions/openapi`;
    const cssId = "swagger-css";
    if (!document.getElementById(cssId)) {
      const link = document.createElement("link");
      link.id = cssId; link.rel = "stylesheet";
      link.href = "https://unpkg.com/swagger-ui-dist@5/swagger-ui.css";
      document.head.appendChild(link);
    }
    const init = () => {
      if (window.SwaggerUIBundle) {
        window.SwaggerUIBundle({
          url: specUrl,
          dom_id: "#swagger-root",
          deepLinking: true,
          tryItOutEnabled: true,
          presets: [window.SwaggerUIBundle.presets.apis],
        });
        setReady(true);
      }
    };
    const scriptId = "swagger-bundle";
    if (document.getElementById(scriptId)) { init(); return; }
    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js";
    script.onload = init;
    document.body.appendChild(script);
  }, [baseUrl]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">API Reference</h1>
        <p className="text-sm text-muted-foreground mt-1 font-mono">OpenAPI 3.1 — interactive explorer</p>
      </div>
      {!ready && (
        <div className="flex items-center gap-3 text-muted-foreground text-sm">
          <div className="w-5 h-5 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
          Loading spec…
        </div>
      )}
      <div className="bg-white rounded-2xl overflow-hidden border border-border [&_.swagger-ui]:text-black">
        <div id="swagger-root" />
      </div>
    </div>
  );
}