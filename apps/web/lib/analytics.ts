type AnalyticsPayload = Record<string, unknown>;

export async function trackServerEvent(event: string, payload: AnalyticsPayload = {}) {
  if (!process.env.POSTHOG_KEY) {
    console.info("[analytics:no-op]", event, payload);
    return;
  }

  console.info("[analytics]", event, payload);
}
