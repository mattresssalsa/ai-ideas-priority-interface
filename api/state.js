const STATE_PREFIX = "ai-ideas-priority/state/";
const LOCAL_STATE_PATH = "/tmp/ai-ideas-priority-state.json";

const fieldOptions = {
  impact: ["", "Testing", "Low", "Medium", "High"],
  effort: ["", "Very low", "Low", "Medium", "High"],
  started: ["", "Yes", "No"],
};

const defaultRows = [
  { id: "geo-scorecard", idea: "Zoe's GEO Scorecard Generator", impact: "Testing", effort: "Very low", started: "Yes" },
  { id: "timeline-release", idea: "Timeline / Release Optimizer", impact: "High", effort: "High", started: "" },
  { id: "weekly-playlist", idea: "Weekly Playlist Tracker for new releases", impact: "High", effort: "Medium", started: "Yes" },
  { id: "cisco-breakpoint", idea: "Cisco's Breakpoint", impact: "", effort: "", started: "Yes" },
  { id: "cisco-catalogue", idea: "Cisco's Catalogue Sleeper Hits", impact: "", effort: "", started: "Yes" },
  { id: "billboard-rules", idea: "Billboard Rules chatbot", impact: "", effort: "", started: "" },
  { id: "google-cosign", idea: "Google CoSign", impact: "", effort: "", started: "Yes" },
  { id: "roi-measurement", idea: "Zoe's ROI Measurement (comparing actual revenues to the forecasted revenue based on machine learning)", impact: "", effort: "High", started: "" },
  { id: "new-release-scorecard", idea: "Zoe's New Release Scorecard (similarities to Breakpoint)", impact: "", effort: "Medium", started: "Yes" },
  { id: "catalog-track-glenn", idea: "Zoe's Catalog Track Identifier for Glenn (long term growth)", impact: "", effort: "Low", started: "Yes" },
  { id: "icla-track", idea: "Zoe's ICLA Track Identifier", impact: "", effort: "Low", started: "Yes" },
  { id: "advertising-intel", idea: "Advertising Intelligence Agent", impact: "", effort: "Medium", started: "" },
  { id: "marketing-intel", idea: "Marketing Intelligence Agent", impact: "", effort: "High", started: "" },
  { id: "marketing-brainstorm", idea: "Marketing Brainstorm Agent", impact: "Low", effort: "Low", started: "" },
  { id: "unsigned-artists", idea: "Unsigned artists score", impact: "", effort: "Medium", started: "" },
  { id: "content-generator", idea: "Content Generator", impact: "", effort: "Low", started: "" },
  { id: "ar-delivery-admin", idea: "A&R music delivery admin", impact: "", effort: "Medium", started: "" },
  { id: "eta-travel", idea: "eTA Artist Travel Agent", impact: "", effort: "High", started: "" },
  { id: "republic-rolodex", idea: "Republic Records A&R creative rolodex", impact: "Low", effort: "Low", started: "" },
  { id: "influencer-matching", idea: "Influencer to Music Matching Score", impact: "", effort: "Medium", started: "" },
  { id: "sync-support", idea: "Sync support agent", impact: "", effort: "Medium", started: "" },
  { id: "international-pulsemap", idea: "International PulseMap", impact: "", effort: "Medium", started: "" },
];

const byId = new Map(defaultRows.map((row) => [row.id, row]));

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.end(JSON.stringify(payload));
}

function allowedValue(field, value) {
  const normalized = typeof value === "string" ? value : "";
  return fieldOptions[field].includes(normalized) ? normalized : "";
}

function normalizeState(input = {}) {
  const seen = new Set();
  const sourceRows = Array.isArray(input.rows) ? input.rows : defaultRows;
  const rows = [];

  for (const sourceRow of sourceRows) {
    const base = byId.get(sourceRow?.id);
    if (!base || seen.has(base.id)) continue;
    seen.add(base.id);
    rows.push({
      ...base,
      impact: allowedValue("impact", sourceRow.impact ?? base.impact),
      effort: allowedValue("effort", sourceRow.effort ?? base.effort),
      started: allowedValue("started", sourceRow.started ?? base.started),
    });
  }

  for (const base of defaultRows) {
    if (!seen.has(base.id)) rows.push({ ...base });
  }

  return {
    version: 1,
    updatedAt: input.updatedAt || new Date().toISOString(),
    rows: rows.map((row, index) => ({ ...row, priority: index + 1 })),
  };
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function blobSdk() {
  return import("@vercel/blob");
}

async function blobText(result) {
  if (!result) return null;
  if (typeof result.text === "function") return result.text();
  if (result.stream) return new Response(result.stream).text();
  if (result.body) return new Response(result.body).text();
  return null;
}

async function latestBlob() {
  const { list } = await blobSdk();
  let cursor;
  let latest = null;

  do {
    const page = await list({
      cursor,
      limit: 1000,
      mode: "expanded",
      prefix: STATE_PREFIX,
    });
    for (const blob of page.blobs || []) {
      if (!latest || blob.pathname > latest.pathname) latest = blob;
    }
    cursor = page.cursor;
    if (!page.hasMore) break;
  } while (cursor);

  return latest;
}

async function readBlobState() {
  const latest = await latestBlob();
  if (!latest) return normalizeState();

  const { get } = await blobSdk();
  const blob = await get(latest.pathname, { access: "private" });
  const text = await blobText(blob);
  return normalizeState(JSON.parse(text || "{}"));
}

async function writeBlobState(state) {
  const { put } = await blobSdk();
  const stamp = state.updatedAt.replace(/[-:.TZ]/g, "");
  const suffix = Math.random().toString(36).slice(2, 8);
  await put(`${STATE_PREFIX}${stamp}-${suffix}.json`, JSON.stringify(state), {
    access: "private",
    contentType: "application/json; charset=utf-8",
  });
}

async function readLocalState() {
  const fs = await import("node:fs/promises");
  try {
    const text = await fs.readFile(LOCAL_STATE_PATH, "utf8");
    return normalizeState(JSON.parse(text));
  } catch {
    return normalizeState();
  }
}

async function writeLocalState(state) {
  const fs = await import("node:fs/promises");
  await fs.writeFile(LOCAL_STATE_PATH, JSON.stringify(state), "utf8");
}

function hasBlobToken() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function storageUnavailableOnVercel(response) {
  sendJson(response, 503, {
    error: "BLOB_READ_WRITE_TOKEN is not configured. Add a private Vercel Blob store to this project to enable shared editing.",
  });
}

async function readState(response) {
  if (hasBlobToken()) {
    const state = await readBlobState();
    sendJson(response, 200, { ...state, storage: "vercel-blob" });
    return;
  }

  if (process.env.VERCEL) {
    storageUnavailableOnVercel(response);
    return;
  }

  const state = await readLocalState();
  sendJson(response, 200, { ...state, storage: "local-dev" });
}

async function writeState(request, response) {
  const body = await readRequestBody(request);
  const payload = body ? JSON.parse(body) : {};
  const state = normalizeState({ rows: payload.rows, updatedAt: new Date().toISOString() });

  if (hasBlobToken()) {
    await writeBlobState(state);
    sendJson(response, 200, { ...state, storage: "vercel-blob" });
    return;
  }

  if (process.env.VERCEL) {
    storageUnavailableOnVercel(response);
    return;
  }

  await writeLocalState(state);
  sendJson(response, 200, { ...state, storage: "local-dev" });
}

export default async function handler(request, response) {
  try {
    if (request.method === "GET") {
      await readState(response);
      return;
    }

    if (request.method === "POST") {
      await writeState(request, response);
      return;
    }

    response.setHeader("Allow", "GET, POST");
    sendJson(response, 405, { error: "Method not allowed" });
  } catch (error) {
    sendJson(response, 500, { error: error?.message || "Unexpected server error" });
  }
}
