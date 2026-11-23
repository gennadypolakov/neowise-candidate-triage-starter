import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { classify } from "./mock-ai.mjs";

const html = await readFile(new URL("./index.html", import.meta.url));

const ALLOWED_TOPICS = new Set(["delivery", "pricing", "other"]);
const MODEL_TIMEOUT_MS = 300;
const MANUAL_REVIEW = { status: "manual_review", topic: null, draft: null };

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

// Parse and validate the request body: JSON object with a non-empty string `text`.
export function parseBody(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false };
  }
  const text = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed.text
    : undefined;
  if (typeof text !== "string" || text.trim() === "") return { ok: false };
  return { ok: true, text };
}

// Run the model with a hard timeout and validate its output.
export async function triage(text) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
  let raw;
  try {
    raw = await classify(text, { signal: controller.signal });
  } catch {
    // Timeout or model error.
    return MANUAL_REVIEW;
  } finally {
    clearTimeout(timer);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Non-JSON model output.
    return MANUAL_REVIEW;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return MANUAL_REVIEW;
  }

  const topic = parsed.topic;
  const draft = parsed.draft;
  if (!ALLOWED_TOPICS.has(topic)) return MANUAL_REVIEW;
  if (typeof draft !== "string" || draft.trim() === "") return MANUAL_REVIEW;

  return { status: "ready", topic, draft: draft.trim() };
}

async function handleTriage(request, response) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = parseBody(Buffer.concat(chunks).toString("utf8"));
  if (!body.ok) return json(response, 400, { status: "invalid_input" });
  return json(response, 200, await triage(body.text));
}

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html);
    return;
  }
  if (request.method !== "POST" || request.url !== "/api/triage") {
    return json(response, 404, { status: "not_found" });
  }
  try {
    await handleTriage(request, response);
  } catch {
    json(response, 500, { status: "server_error" });
  }
});

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  server.listen(Number(process.env.PORT || 3000), "127.0.0.1");
}
