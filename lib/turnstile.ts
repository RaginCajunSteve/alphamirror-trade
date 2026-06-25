const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstileToken(
  token: string | undefined,
  secret: string | undefined,
  remoteIp?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!secret) {
    if (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
      return { ok: false, error: "Turnstile secret not configured" };
    }
    return { ok: true };
  }
  if (!token?.trim()) {
    return { ok: false, error: "Missing Turnstile token" };
  }

  const body = new URLSearchParams({
    secret,
    response: token,
  });
  if (remoteIp) body.set("remoteip", remoteIp);

  const res = await fetch(SITEVERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    return { ok: false, error: "Turnstile verification unavailable" };
  }

  const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
  if (data.success) return { ok: true };
  return {
    ok: false,
    error: data["error-codes"]?.join(", ") ?? "Turnstile verification failed",
  };
}