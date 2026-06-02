// Canonical, always-reachable base URL for Anatome's public function endpoints.
// window.location.origin is unreliable inside the preview/sandbox iframe (the
// /functions/* raw-image routes are not served from the sandbox host), so for
// anything embedded directly via <img src> we always point at the live app domain.
export const API_BASE = "https://anatome-form-flow.base44.app";