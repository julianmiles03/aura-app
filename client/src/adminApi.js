// Requests to the admin API (/api/admin/...), for the admin portal.
//
// Unlike api.js, these carry no Supabase token. The admin session is the httpOnly cookie
// aura_admin: the browser stores it when sign-in works and sends it back by itself, and this
// code can't read it (that's the point of httpOnly).
//
// They always go to this site's own /api, never to VITE_API_URL. Locally Vite forwards /api to the
// API; on the live site Render does (the rewrite in render.yaml). That keeps the cookie on the same
// site as the page. Set by the API's own onrender.com address instead, it would be a third-party
// cookie, which Safari (and so every iPhone) refuses to keep.
import { ApiError } from './api.js';

// Any admin request that comes back 401 ADMIN_SIGNED_OUT (the session expired, or someone logged
// out in another tab) fires this, and the portal goes back to the sign-in form.
export const ADMIN_SIGNED_OUT_EVENT = 'aura:admin-signed-out';

export async function adminApi(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin', // send and accept the session cookie (the default, spelled out)
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', "Can't reach the aura server.");
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    // An answer that isn't JSON (an HTML 404 or 502 page) means /api didn't reach the API: the
    // rewrite is missing, or the API is still waking up. friendlyError explains BAD_RESPONSE.
    const err = new ApiError(
      res.status,
      data?.error?.code ?? (data ? 'UNKNOWN_ERROR' : 'BAD_RESPONSE'),
      data?.error?.message ?? `Request failed (${res.status}).`,
      data?.error?.details,
    );
    if (err.code === 'ADMIN_SIGNED_OUT') window.dispatchEvent(new CustomEvent(ADMIN_SIGNED_OUT_EVENT));
    throw err;
  }
  return data;
}
