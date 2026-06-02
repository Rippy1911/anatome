import React, { useEffect, useState } from "react";
import { OPENAPI_SPEC_URL, PUBLIC_API } from "@/lib/apiBase";

export default function Api() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const cssId = "swagger-css";
    if (!document.getElementById(cssId)) {
      const link = document.createElement("link");
      link.id = cssId;
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/swagger-ui-dist@5/swagger-ui.css";
      document.head.appendChild(link);
    }

    const init = () => {
      if (!window.SwaggerUIBundle) return;
      window.SwaggerUIBundle({
        url: OPENAPI_SPEC_URL,
        dom_id: "#swagger-root",
        deepLinking: true,
        tryItOutEnabled: true,
        presets: [window.SwaggerUIBundle.presets.apis],
        onComplete: () => setReady(true),
        onFailure: (err) => setError(err?.message || "Failed to load OpenAPI spec"),
      });
    };

    const scriptId = "swagger-bundle";
    if (document.getElementById(scriptId)) {
      init();
      return;
    }
    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js";
    script.onload = init;
    script.onerror = () => setError("Failed to load Swagger UI");
    document.body.appendChild(script);
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">API Reference</h1>
        <p className="text-sm text-muted-foreground mt-1">
          OpenAPI 3.1 — interactive explorer · spec from{" "}
          <a href={OPENAPI_SPEC_URL} className="font-mono text-primary hover:underline" target="_blank" rel="noopener noreferrer">
            {OPENAPI_SPEC_URL}
          </a>
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Try-it-out requests use server <span className="font-mono text-foreground">{PUBLIC_API}</span> (production Worker).
        </p>
      </div>
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {!ready && !error && (
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
