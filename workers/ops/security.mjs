export function runSecurityChecks(env) {
  const findings = [];
  let score = 100;

  if (!env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
    findings.push({ level: "warn", message: "Turnstile site key not set in worker env" });
    score -= 15;
  }

  if (env.STRIPE_SECRET_KEY) {
    findings.push({ level: "critical", message: "Stripe secret exposed as plain var — use wrangler secret" });
    score -= 40;
  }

  if (!env.OPS_ADMIN_SECRET) {
    findings.push({ level: "info", message: "OPS_ADMIN_SECRET not configured — maintenance API disabled" });
    score -= 5;
  }

  if (!env.NEXT_PUBLIC_APP_URL?.startsWith("https://")) {
    findings.push({ level: "warn", message: "APP_URL should use HTTPS in production" });
    score -= 10;
  }

  return {
    at: new Date().toISOString(),
    score: Math.max(0, score),
    findings,
  };
}