export const MIN_NOTICE_MS = 24 * 60 * 60 * 1000;
export const NOTICE_LEAD_MS = MIN_NOTICE_MS;

export function advanceMaintenanceState(windows, now = Date.now()) {
  const events = [];
  const next = windows.map((w) => {
    if (w.status === "cancelled" || w.status === "completed") return w;
    const start = Date.parse(w.startAt);
    const end = Date.parse(w.expectedEndAt);

    if (w.status === "scheduled" && now >= start && now < end) {
      events.push({ type: "started", id: w.id });
      return {
        ...w,
        status: "in_progress",
        startedAt: new Date(now).toISOString(),
        updates: [
          ...w.updates,
          {
            at: new Date(now).toISOString(),
            message: "Maintenance in progress.",
            expectedBackAt: w.expectedEndAt,
          },
        ],
      };
    }

    if ((w.status === "in_progress" || w.status === "scheduled") && now >= end) {
      events.push({ type: "completed", id: w.id });
      return {
        ...w,
        status: "completed",
        completedAt: new Date(now).toISOString(),
        updates: [
          ...w.updates,
          {
            at: new Date(now).toISOString(),
            message: "Maintenance complete. Service restored.",
          },
        ],
      };
    }

    return w;
  });
  return { windows: next, events };
}

function formatRange(w) {
  const fmt = (iso) =>
    new Date(iso).toLocaleString("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  return `${fmt(w.startAt)} – ${fmt(w.expectedEndAt)}`;
}

export async function sendMaintenanceEmail(env, to, kind, window, extraMessage) {
  if (!env.EMAIL) return { ok: false, error: "no EMAIL binding" };

  const from = { email: "noreply@alphamirror.trade", name: "Alpha Mirror" };
  const replyTo = "billing@alphamirror.trade";
  let subject;
  let text;
  let html;

  if (kind === "notice") {
    subject = `Scheduled maintenance — ${window.title}`;
    text = [
      "Alpha Mirror scheduled maintenance:",
      "",
      window.title,
      formatRange(window),
      `Expected back online: ${new Date(window.expectedEndAt).toUTCString()}`,
      "",
      "Status: https://alphamirror.trade/status",
    ].join("\n");
    html = `<p><strong>Scheduled maintenance</strong></p><p>${window.title}</p><p>${formatRange(window)}</p><p>Expected back online: <strong>${new Date(window.expectedEndAt).toUTCString()}</strong></p><p><a href="https://alphamirror.trade/status">Status page</a></p>`;
  } else if (kind === "update") {
    const back = new Date(window.expectedEndAt).toUTCString();
    subject = `Maintenance update — ${window.title}`;
    text = [extraMessage, "", `Expected back online: ${back}`, "", "https://alphamirror.trade/status"].join("\n");
    html = `<p>${extraMessage}</p><p>Expected back online: <strong>${back}</strong></p><p><a href="https://alphamirror.trade/status">Status page</a></p>`;
  } else {
    subject = `Back online — ${window.title}`;
    text = "Alpha Mirror is back online.\n\nhttps://alphamirror.trade";
    html = `<p><strong>Alpha Mirror is back online.</strong></p><p><a href="https://alphamirror.trade">alphamirror.trade</a></p>`;
  }

  try {
    await env.EMAIL.send({ to, from, replyTo, subject, html, text });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}

export async function notifyMaintenanceList(env, contacts, kind, window, message) {
  const results = [];
  for (const c of contacts) {
    const r = await sendMaintenanceEmail(env, c.email, kind, window, message);
    results.push({ email: c.email, ...r });
  }
  return results;
}