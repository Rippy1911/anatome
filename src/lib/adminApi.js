import { base44 } from "@/api/base44Client";

export async function callAdmin(name, payload) {
  try {
    const resp = await base44.functions.invoke(name, payload || {});
    if (resp.data && resp.data.ok === false) {
      return { ok: false, error: resp.data.error, message: resp.data.message || resp.data.error };
    }
    return { ok: true, data: resp.data ? resp.data.data : resp.data };
  } catch (e) {
    return { ok: false, error: "request_failed", message: e.message };
  }
}