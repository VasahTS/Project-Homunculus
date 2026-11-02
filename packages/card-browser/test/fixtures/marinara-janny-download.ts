// Marinara Engine AGPL-3.0 reference, original authors: Pasta-Devs contributors.
// Verbatim download helper except for export; fixture/provenance added by CODEX, 2026-11-02.
// Source e5ead06ac2fe1cb3e039f8cab7e4d266b01dac44, BotBrowserView.tsx lines 87-125.
const JANNY_DOWNLOAD_API = "https://api.jannyai.com/api/v1/download";
export async function fetchCompleteJannyCard(characterId: string, signal?: AbortSignal): Promise<Response> {
  const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000);
  try {
    // Cloudflare can reject Marinara's server while accepting the user's real
    // browser session. Ask Janny for the signed card URL in-browser first.
    const downloadResponse = await fetch(JANNY_DOWNLOAD_API, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ characterId }),
      signal: requestSignal,
    });
    if (!downloadResponse.ok) throw new Error(`JannyAI character-card request failed (${downloadResponse.status})`);

    const payload = (await downloadResponse.json()) as { status?: unknown; downloadUrl?: unknown };
    if (payload.status !== "ok" || typeof payload.downloadUrl !== "string") {
      throw new Error("JannyAI did not return a character-card download");
    }
    const downloadUrl = new URL(payload.downloadUrl);
    if (downloadUrl.protocol !== "https:") throw new Error("JannyAI returned an insecure download URL");

    const cardResponse = await fetch(downloadUrl, {
      credentials: "include",
      headers: { Accept: "image/png,application/octet-stream;q=0.9" },
      signal: requestSignal,
    });
    if (!cardResponse.ok) throw new Error(`JannyAI character-card download failed (${cardResponse.status})`);
    return cardResponse;
  } catch {
    // Retain the server proxy for browsers where Janny permits server traffic
    // but does not expose its download endpoint through CORS.
    return fetch(`/api/bot-browser/janny/download/${encodeURIComponent(characterId)}`, {
      signal: requestSignal,
    });
  }
}
