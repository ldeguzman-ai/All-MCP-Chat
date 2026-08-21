const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");

const PORT = process.env.PORT || 8080;
const AUTH_ISSUER = "https://mcp-gateway.zende.sk/api/auth";
const AUTH_AUTHORIZE = `${AUTH_ISSUER}/authorize`;
const AUTH_TOKEN = `${AUTH_ISSUER}/token`;
const AUTH_REGISTER = `${AUTH_ISSUER}/register`;
const maxToolRounds = 4;

function resolvePublicDir() {
  const candidates = [
    path.join(__dirname, "public"),
    path.join(process.cwd(), "public"),
    "/app/public",
    "/usr/src/app/public",
    path.join(__dirname, "public", "public"),
    path.join(process.cwd(), "public", "public"),
    __dirname,
    process.cwd(),
    "/app",
    "/usr/src/app",
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "index.html"))) return dir;
  }
  return candidates.find((dir) => fs.existsSync(dir)) || candidates[0];
}

const publicDir = resolvePublicDir();
const indexPath = path.join(publicDir, "index.html");

const mcpEndpoints = {
  atlassian: "https://mcp-gateway.zende.sk/mcps/atlassian",
  society: "https://mcp-gateway.zende.sk/mcps/society",
  cerebro: "https://mcp-gateway.zende.sk/mcps/cerebro",
  unleash: "https://mcp-gateway.zende.sk/mcps/unleash",
  "z2-help-center": "https://mcp-gateway.zende.sk/mcps/z2-help-center",
  zendeskdev: "https://mcp-gateway.zende.sk/mcps/zendeskdev",
  slack: "https://mcp-gateway.zende.sk/mcps/slack",
  "google-drive": "https://mcp-gateway.zende.sk/mcps/google-drive",
  tavily: "https://mcp-gateway.zende.sk/mcps/tavily",
  fetch: "https://mcp-gateway.zende.sk/mcps/fetch",
  "zendesk-search-mcp": "https://mcp-gateway.zende.sk/mcps/zendesk-search-mcp",
  researcher: "https://mcp-gateway.zende.sk/mcps/researcher",
};

const sourceNames = {
  all: "All MCPs",
  atlassian: "Atlassian",
  society: "Society",
  cerebro: "Cerebro",
  unleash: "Unleash",
  "z2-help-center": "z2-help-center",
  zendeskdev: "zendeskdev",
  slack: "Slack",
  "google-drive": "Google Drive",
  tavily: "Tavily",
  fetch: "Fetch",
  "zendesk-search-mcp": "zendesk-search-mcp",
  researcher: "Researcher",
};

const allSourceIds = Object.keys(mcpEndpoints);

function selectedSourceIds(sourceId) {
  if (sourceId === "all") return allSourceIds;
  if (mcpEndpoints[sourceId]) return [sourceId];
  throw new Error(`Unknown MCP source: ${sourceId}`);
}

function getUserId(req) {
  const raw =
    req.get("x-pomerium-claim-email") ||
    req.get("x-pomerium-email") ||
    req.get("x-forwarded-email") ||
    req.get("x-goog-authenticated-user-email") ||
    req.get("x-auth-request-email") ||
    "";
  return String(raw).replace(/^accounts\.google\.com:/, "").trim() || "anonymous";
}

const PUBLIC_APP_URL = "https://all-mcp-chat.internal.zenai-apps.com";

function publicBaseUrl(_req) {
  const fromEnv = process.env.APP_BASE_URL;
  if (
    fromEnv &&
    !/\.a\.run\.app/i.test(fromEnv) &&
    !/localhost|127\.0\.0\.1/i.test(fromEnv)
  ) {
    return fromEnv.replace(/\/$/, "");
  }
  return PUBLIC_APP_URL;
}

function oauthRedirectUri(_req) {
  return `${PUBLIC_APP_URL}/`;
}

function encrypt(value) {
  if (!value) return null;
  const key = crypto
    .createHash("sha256")
    .update(process.env.TOKEN_ENCRYPTION_KEY || process.env.DATABASE_URL || "all-mcp-chat")
    .digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decrypt(value) {
  if (!value) return null;
  const key = crypto
    .createHash("sha256")
    .update(process.env.TOKEN_ENCRYPTION_KEY || process.env.DATABASE_URL || "all-mcp-chat")
    .digest();
  const buf = Buffer.from(value, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

function createPool() {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRESQL_URL ||
    process.env.DB_URL;
  if (url) {
    return new (require("pg").Pool)({
      connectionString: url,
      ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
      max: 5,
    });
  }
  if (process.env.PGHOST || process.env.DB_HOST) {
    return new (require("pg").Pool)({
      host: process.env.PGHOST || process.env.DB_HOST,
      port: Number(process.env.PGPORT || process.env.DB_PORT || 5432),
      user: process.env.PGUSER || process.env.DB_USER,
      password: process.env.PGPASSWORD || process.env.DB_PASSWORD || process.env.DB_PASS,
      database: process.env.PGDATABASE || process.env.DB_NAME,
      ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
      max: 5,
    });
  }
  return null;
}

let pool = null;
let schemaReady = false;

function db() {
  if (!pool) pool = createPool();
  return pool;
}

async function ensureSchema() {
  const client = db();
  if (!client) throw new Error("PostgreSQL is not configured. Recreate the app with Include PostgreSQL Database enabled.");
  if (schemaReady) return client;
  await client.query(`
    CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS mcp_oauth_states (
      state TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      code_verifier TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      flow_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS mcp_oauth_tokens (
      user_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at TIMESTAMPTZ,
      scope TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, source_id)
    );
  `);
  await client.query(
    "ALTER TABLE mcp_oauth_states ADD COLUMN IF NOT EXISTS flow_id TEXT",
  );
  schemaReady = true;
  return client;
}

async function nextUnconnectedSource(userId, requestedSourceId) {
  const ids = requestedSourceId === "all" ? allSourceIds : selectedSourceIds(requestedSourceId);
  const result = await db().query(
    "SELECT source_id FROM mcp_oauth_tokens WHERE user_id = $1 AND source_id = ANY($2)",
    [userId, ids],
  );
  const connected = new Set(result.rows.map((row) => row.source_id));
  return ids.find((id) => !connected.has(id)) || null;
}

async function getOrRegisterClient(redirectUri) {
  const client = await ensureSchema();
  const rowId = "all-mcp-chat-v5";
  const existing = await client.query("SELECT client_id FROM mcp_oauth_clients WHERE id = $1", [
    rowId,
  ]);
  if (existing.rows[0]?.client_id) return existing.rows[0].client_id;

  const base = String(redirectUri)
    .replace(/\/api\/mcp\/callback\/?$/, "")
    .replace(/\/health\/?$/, "")
    .replace(/\/$/, "");
  const redirectUris = [...new Set([
    redirectUri,
    `${base}/health`,
    `${base}/`,
    base,
    `${base}/api/mcp/callback`,
  ])];

  const response = await fetch(AUTH_REGISTER, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "All-MCP-Chat",
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      application_type: "web",
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.client_id) {
    throw new Error(`OAuth client registration failed: ${JSON.stringify(body)}`);
  }
  await client.query(
    "INSERT INTO mcp_oauth_clients (id, client_id) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET client_id = EXCLUDED.client_id",
    [rowId, body.client_id],
  );
  return body.client_id;
}

function pkce() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function saveTokens(userId, sourceIds, token) {
  const client = await ensureSchema();
  const expiresAt = token.expires_in
    ? new Date(Date.now() + Number(token.expires_in) * 1000)
    : null;
  for (const sourceId of sourceIds) {
    await client.query(
      `INSERT INTO mcp_oauth_tokens (user_id, source_id, access_token, refresh_token, expires_at, scope, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (user_id, source_id) DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = COALESCE(EXCLUDED.refresh_token, mcp_oauth_tokens.refresh_token),
         expires_at = EXCLUDED.expires_at,
         scope = EXCLUDED.scope,
         updated_at = NOW()`,
      [
        userId,
        sourceId,
        encrypt(token.access_token),
        encrypt(token.refresh_token),
        expiresAt,
        token.scope || null,
      ],
    );
  }
}

async function getAccessToken(userId, sourceId) {
  const client = await ensureSchema();
  const result = await client.query(
    "SELECT access_token, refresh_token, expires_at FROM mcp_oauth_tokens WHERE user_id = $1 AND source_id = $2",
    [userId, sourceId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const expired = row.expires_at && new Date(row.expires_at).getTime() < Date.now() + 60_000;
  if (!expired) return decrypt(row.access_token);
  if (!row.refresh_token) return decrypt(row.access_token);
  const oauthClientId = (await client.query("SELECT client_id FROM mcp_oauth_clients WHERE id = $1", [
    "all-mcp-chat-v5",
  ])).rows[0]?.client_id;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: decrypt(row.refresh_token),
    client_id: oauthClientId,
  });
  const response = await fetch(AUTH_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const token = await response.json().catch(() => ({}));
  if (!response.ok || !token.access_token) return decrypt(row.access_token);
  await saveTokens(userId, [sourceId], token);
  return token.access_token;
}

function vertexToolName(sourceId, toolName) {
  return `${String(sourceId).replace(/-/g, "_")}__${String(toolName).replace(/[^a-zA-Z0-9_]/g, "_")}`.slice(
    0,
    64,
  );
}

function parseVertexToolName(name) {
  const [encodedSource, ...rest] = String(name).split("__");
  const sourceId = encodedSource.replace(/_/g, "-");
  return { sourceId, toolName: rest.join("__") };
}

function toVertexParameters(schema) {
  if (!schema || typeof schema !== "object") {
    return { type: "OBJECT", properties: {} };
  }
  const properties = {};
  for (const [key, value] of Object.entries(schema.properties || {})) {
    properties[key] = {
      type: String(value.type || "STRING").toUpperCase(),
      description: value.description || undefined,
    };
  }
  return {
    type: "OBJECT",
    properties,
    required: schema.required || [],
  };
}

async function connectMcp(sourceId, accessToken) {
  const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
  const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/sdk/client/streamableHttp.js");
  const client = new Client({ name: "All-MCP-Chat", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(mcpEndpoints[sourceId]), {
    requestInit: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
  await client.connect(transport);
  return { client, transport };
}

async function listGatewayTools(userId, sourceIds) {
  const connections = [];
  const tools = [];
  const used = [];
  const failures = [];
  for (const sourceId of sourceIds) {
    try {
      const accessToken = await getAccessToken(userId, sourceId);
      if (!accessToken) {
        failures.push(`${sourceId}: not connected`);
        continue;
      }
      const connection = await connectMcp(sourceId, accessToken);
      connections.push({ sourceId, ...connection });
      const listed = await connection.client.listTools();
      for (const tool of listed.tools || []) {
        tools.push({
          name: vertexToolName(sourceId, tool.name),
          description: `[${sourceNames[sourceId]}] ${tool.description || tool.name}`.slice(0, 1024),
          parameters: toVertexParameters(tool.inputSchema),
          sourceId,
          mcpName: tool.name,
        });
      }
      used.push(sourceId);
    } catch (error) {
      failures.push(`${sourceId}: ${extractErrorDetail(error)}`);
    }
  }
  return { connections, tools, used, failures };
}

function extractErrorDetail(error) {
  const responseData = error?.response?.data;
  if (responseData) return JSON.stringify(responseData, null, 2);
  if (error instanceof Error) return error.message;
  return String(error);
}

function mcpConnectPath(sourceId) {
  return `/?mcp_connect=${encodeURIComponent(sourceId)}`;
}

async function connectionProgress(userId, sourceIds) {
  const result = await db().query(
    "SELECT source_id FROM mcp_oauth_tokens WHERE user_id = $1 AND source_id = ANY($2)",
    [userId, sourceIds],
  );
  const connected = new Set(result.rows.map((row) => row.source_id));
  return {
    connectedCount: connected.size,
    totalCount: sourceIds.length,
    nextSourceId: sourceIds.find((id) => !connected.has(id)) || null,
  };
}

function connectionProgressPage({ connectedCount, totalCount, nextSourceId }) {
  const nextName = nextSourceId ? sourceNames[nextSourceId] || nextSourceId : "the next MCP";
  const percent = totalCount ? Math.round((connectedCount / totalCount) * 100) : 0;
  const nextUrl = nextSourceId ? "/?mcp_connect=all" : "/?mcp=connected&source=all";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="1.5;url=${nextUrl}"><title>Connecting MCPs</title>
<style>body{margin:0;font:16px system-ui,sans-serif;background:#f7f9f9;color:#17363a}.card{max-width:540px;margin:12vh auto;padding:32px;background:#fff;border-radius:12px;box-shadow:0 3px 16px #03363d18}.eyebrow{font-size:12px;font-weight:700;letter-spacing:.08em;color:#527073}.track{height:10px;margin:22px 0 10px;overflow:hidden;border-radius:999px;background:#e3eded}.fill{height:100%;width:${percent}%;background:#00a880}.muted{color:#668184}</style>
</head><body><main class="card"><p class="eyebrow">ALL-MCP-CHAT</p><h1>${connectedCount} of ${totalCount} MCPs connected</h1><div class="track"><div class="fill"></div></div><p class="muted">Connected successfully. This page will reload to authorize ${nextName}. You only need to act if you are asked to allow the MCP on a page, or to log in to Society as an agent or end user.</p></main></body></html>`;
}

async function createAuthorizeSession(userId, requestedSourceId) {
  await ensureSchema();
  const sourceId = await nextUnconnectedSource(userId, requestedSourceId);
  if (!sourceId) {
    return { done: true, requestedSourceId };
  }
  const redirectUri = oauthRedirectUri();
  const clientId = await getOrRegisterClient(redirectUri);
  const { verifier, challenge } = pkce();
  const state = crypto.randomBytes(24).toString("hex");
  await db().query(
    "INSERT INTO mcp_oauth_states (state, user_id, source_id, code_verifier, redirect_uri, flow_id) VALUES ($1, $2, $3, $4, $5, $6)",
    [state, userId, sourceId, verifier, redirectUri, requestedSourceId],
  );
  const authorize = new URL(AUTH_AUTHORIZE);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("scope", `mcp:/mcps/${sourceId}`);
  authorize.searchParams.set("resource", mcpEndpoints[sourceId]);
  const ids = requestedSourceId === "all" ? allSourceIds : [sourceId];
  return {
    done: false,
    authorizeUrl: authorize.toString(),
    sourceId,
    requestedSourceId,
    redirectUri,
    progress: await connectionProgress(userId, ids),
  };
}

async function startMcpConnect(req, res) {
  const requestedSourceId = String(req.query.sourceId || req.query.connect || "all");
  const result = await createAuthorizeSession(getUserId(req), requestedSourceId);
  if (result.done) {
    return res.redirect(`/?mcp=connected&source=${encodeURIComponent(requestedSourceId)}`);
  }
  const nextName = sourceNames[result.sourceId] || result.sourceId;
  const authorizeUrl = result.authorizeUrl;
  const progress = result.progress;
  res.status(200).type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="0;url=${authorizeUrl.replace(/"/g, "&quot;")}">
<title>Connect ${nextName}</title>
<style>body{margin:0;font:16px system-ui,sans-serif;background:#f7f9f9;color:#17363a}.card{max-width:540px;margin:12vh auto;padding:32px;background:#fff;border-radius:12px;box-shadow:0 3px 16px #03363d18}a{display:inline-block;margin-top:16px;padding:10px 14px;border-radius:8px;background:#03363d;color:#fff;text-decoration:none;font-weight:700}</style>
</head><body><main class="card"><p>Connecting ${nextName} (${progress.connectedCount} of ${progress.totalCount} already connected)</p>
<p>This page will reload unless you are asked to allow the MCP on a page, or to log in to Society as an agent or end user.</p>
<p>If this page does not continue automatically, open the MCP gateway:</p>
<p><a href="${authorizeUrl.replace(/"/g, "&quot;")}">Continue to MCP Gateway</a></p></main></body></html>`);
}

async function completeOAuthExchange({ code, state, error, description }) {
  if (error) throw new Error(description || String(error));
  const client = await ensureSchema();
  const row = (
    await client.query("SELECT * FROM mcp_oauth_states WHERE state = $1", [state])
  ).rows[0];
  if (!row) throw new Error("Unknown or expired OAuth state.");
  await client.query("DELETE FROM mcp_oauth_states WHERE state = $1", [state]);
  const oauthClientId = await getOrRegisterClient(row.redirect_uri);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: String(code),
    redirect_uri: row.redirect_uri,
    client_id: oauthClientId,
    code_verifier: row.code_verifier,
  });
  const tokenResponse = await fetch(AUTH_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const token = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !token.access_token) {
    throw new Error(`Token exchange failed: ${JSON.stringify(token)}`);
  }
  await saveTokens(row.user_id, [row.source_id], token);
  const ids = row.flow_id === "all" ? allSourceIds : [row.source_id];
  return {
    userId: row.user_id,
    flowId: row.flow_id,
    sourceId: row.source_id,
    progress: await connectionProgress(row.user_id, ids),
  };
}

async function handleOAuthCallback(req, res) {
  const exchanged = await completeOAuthExchange({
    code: req.query.code,
    state: req.query.state,
    error: req.query.error,
    description: req.query.error_description,
  });
  if (exchanged.flowId === "all" && exchanged.progress.nextSourceId) {
    return res.redirect("/?mcp_connect=all");
  }
  res.redirect(`/?mcp=connected&source=${encodeURIComponent(exchanged.flowId || exchanged.sourceId)}`);
}

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(publicDir, { index: false }));
app.use("/assets", express.static(publicDir));
app.use("/assets", express.static(path.join(publicDir, "assets")));

app.get("/health", async (req, res) => {
  try {
    if (req.query.code || req.query.error) {
      return await handleOAuthCallback(req, res);
    }
    if (req.query.connect) {
      req.query.sourceId = String(req.query.connect);
      return await startMcpConnect(req, res);
    }
    if (req.query.mcp_status) {
      return await sendMcpStatus(req, res);
    }
    let database = false;
    try {
      await ensureSchema();
      database = true;
    } catch {
      database = false;
    }
    res.json({
      status: "ok",
      app: "All-MCP-Chat",
      publicDir,
      indexExists: fs.existsSync(indexPath),
      database,
    });
  } catch (error) {
    res.status(500).type("html").send(`<pre>${extractErrorDetail(error)}</pre>`);
  }
});

async function sendMcpStatus(req, res) {
  const sourceId = String(req.query.sourceId || "all");
  const sourceIds = sourceId === "all" ? allSourceIds : [sourceId];
  try {
    const userId = getUserId(req);
    await ensureSchema();
    const result = await db().query(
      "SELECT source_id FROM mcp_oauth_tokens WHERE user_id = $1 AND source_id = ANY($2)",
      [userId, sourceIds],
    );
    const connectedSet = new Set(result.rows.map((row) => row.source_id));
    res.json({
      connected: sourceIds.every((id) => connectedSet.has(id)),
      connectUrl: mcpConnectPath(sourceId),
      database: true,
      sources: sourceIds.map((id) => ({ id, connected: connectedSet.has(id) })),
    });
  } catch (error) {
    res.json({
      connected: false,
      connectUrl: mcpConnectPath(sourceId),
      database: false,
      error: extractErrorDetail(error),
      sources: sourceIds.map((id) => ({ id, connected: false })),
    });
  }
}

function normalizeConversationHistory(value) {
  if (!Array.isArray(value)) return [];
  const recent = value
    .filter(
      (message) =>
        message &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string",
    )
    .slice(-20)
    .map((message) => ({
      role: message.role,
      parts: [{ text: message.content.trim().slice(0, 4_000) }],
    }))
    .filter((message) => message.parts[0].text);

  let promptCount = 0;
  const bounded = [];
  for (let index = recent.length - 1; index >= 0; index -= 1) {
    if (recent[index].role === "user") promptCount += 1;
    if (promptCount > 10) break;
    bounded.unshift(recent[index]);
  }
  return bounded;
}

app.get("/api/mcp/status", async (req, res) => {
  await sendMcpStatus(req, res);
});

app.get("/api/mcp/connect", async (req, res) => {
  try {
    await startMcpConnect(req, res);
  } catch (error) {
    res.status(500).type("html").send(`<pre>${extractErrorDetail(error)}</pre>`);
  }
});

app.get("/api/mcp/callback", async (req, res) => {
  try {
    await handleOAuthCallback(req, res);
  } catch (error) {
    res.status(500).type("html").send(`<pre>${extractErrorDetail(error)}</pre>`);
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    if (req.body?.mcpStatus) {
      req.query.sourceId = String(req.body.sourceId || "all");
      return await sendMcpStatus(req, res);
    }
    if (req.body?.mcpConnect) {
      const requested = String(req.body.mcpConnect || req.body.sourceId || "all");
      return res.json(await createAuthorizeSession(getUserId(req), requested));
    }
    if (req.body?.mcpOAuth) {
      const exchanged = await completeOAuthExchange(req.body.mcpOAuth);
      if (exchanged.flowId === "all" && exchanged.progress.nextSourceId) {
        const next = await createAuthorizeSession(exchanged.userId, "all");
        return res.json({ oauth: true, ...exchanged, ...next });
      }
      return res.json({ oauth: true, done: true, ...exchanged });
    }
  } catch (error) {
    return res.status(500).json({ error: extractErrorDetail(error) });
  }

  const prompt = String(req.body?.prompt || "").trim();
  const sourceId = String(req.body?.sourceId || "all");
  const history = normalizeConversationHistory(req.body?.history);
  if (!prompt) return res.status(400).json({ error: "prompt is required" });

  let sourceIds;
  try {
    sourceIds = selectedSourceIds(sourceId);
  } catch (error) {
    return res.status(400).json({ error: extractErrorDetail(error) });
  }

  try {
    const result = await completeWithVertexAndMcp({
      prompt,
      sourceId,
      sourceIds,
      history,
      userId: getUserId(req),
      connectUrl: mcpConnectPath(sourceId),
    });
    res.json(result);
  } catch (error) {
    console.error(error);
    res.json({
      content: `The chat service could not complete this request.\n\n${extractErrorDetail(error)}`,
      sources: sourceIds.map((id) => sourceNames[id] || id),
    });
  }
});

function sendHome(_req, res) {
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  res.status(200).type("html").send("<h1>All-MCP-Chat server is running</h1>");
}

app.get("/", async (req, res) => {
  try {
    if (req.query.code || req.query.error) {
      return await handleOAuthCallback(req, res);
    }
    if (req.query.connect) {
      req.query.sourceId = String(req.query.connect);
      return await startMcpConnect(req, res);
    }
    return sendHome(req, res);
  } catch (error) {
    res.status(500).type("html").send(`<pre>${extractErrorDetail(error)}</pre>`);
  }
});

async function completeWithVertexAndMcp({ prompt, sourceId, sourceIds, history, userId, connectUrl }) {
  const { connections, tools, used, failures } = await listGatewayTools(userId, sourceIds);
  try {
    if (!used.length) {
      return {
        content: [
          "MCP tools are not connected yet for your account.",
          "The gateway uses per-user OAuth (not a shared secret).",
          `Connect here: ${connectUrl}`,
          failures.length ? `Details:\n${failures.join("\n")}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
        sources: [],
        connectUrl,
      };
    }

    const { GoogleAuth } = require("google-auth-library");
    const auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    const vertexClient = await auth.getClient();
    const project =
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT ||
      (await auth.getProjectId()) ||
      "it-app-foundry-prod";
    const location = process.env.VERTEX_LOCATION || "us-central1";
    const models = [
      ...new Set(
        [
          process.env.VERTEX_MODEL,
          "gemini-2.0-flash",
          "gemini-2.5-flash",
          "gemini-1.5-flash",
        ].filter(Boolean),
      ),
    ];

    const contents = [
      ...history,
      {
        role: "user",
        parts: [
          {
            text: [
              "You are All-MCP-Chat, an internal Zendesk assistant.",
              `Use MCP tools when they can answer the question. Scope: ${sourceNames[sourceId]}.`,
              sourceId === "all"
                ? [
                    "For internal-document questions, use the relevant MCP search tools before answering; do not answer from model memory.",
                    "When using Atlassian, search for the current document first and prefer the result with the newest updated or modified date that directly answers the question.",
                    "If a result does not expose a date, do not describe it as the latest. Search again using terms such as current, latest, or the relevant product/version.",
                    "State the document title and its update date when the tool provides one. If the newest result conflicts with an older document, use the newer document and briefly note the conflict.",
                  ].join(" ")
                : "",
              `Question: ${prompt}`,
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
      },
    ];
    const functionDeclarations = tools.slice(0, 80).map(({ name, description, parameters }) => ({
      name,
      description,
      parameters,
    }));
    const invoked = new Set();

    for (let round = 0; round < maxToolRounds; round += 1) {
      let text = "";
      let functionCalls = [];
      let lastError = "";
      for (const model of models) {
        try {
          const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;
          const payload = {
            contents,
            ...(functionDeclarations.length
              ? { tools: [{ functionDeclarations }] }
              : {}),
          };
          const response = await vertexClient.request({ url, method: "POST", data: payload });
          const parts = response.data?.candidates?.[0]?.content?.parts || [];
          text = parts.map((part) => part.text || "").join("\n").trim();
          functionCalls = parts.filter((part) => part.functionCall).map((part) => part.functionCall);
          lastError = "";
          break;
        } catch (error) {
          lastError = extractErrorDetail(error);
        }
      }
      if (lastError && !text && !functionCalls.length) throw new Error(lastError);
      if (!functionCalls.length) {
        return {
          content: text || "No answer was returned.",
          sources: [...invoked].map((id) => sourceNames[id] || id),
        };
      }

      contents.push({
        role: "model",
        parts: functionCalls.map((call) => ({ functionCall: call })),
      });
      const toolParts = [];
      for (const call of functionCalls) {
        const parsed = parseVertexToolName(call.name);
        const connection = connections.find((item) => item.sourceId === parsed.sourceId);
        invoked.add(parsed.sourceId);
        if (!connection) {
          toolParts.push({
            functionResponse: {
              name: call.name,
              response: { error: "Tool is outside the selected MCP scope." },
            },
          });
          continue;
        }
        try {
          const result = await connection.client.callTool({
            name: parsed.toolName,
            arguments: call.args || {},
          });
          toolParts.push({
            functionResponse: {
              name: call.name,
              response: { result },
            },
          });
        } catch (error) {
          toolParts.push({
            functionResponse: {
              name: call.name,
              response: { error: extractErrorDetail(error) },
            },
          });
        }
      }
      contents.push({ role: "user", parts: toolParts });
    }
    throw new Error("The request exceeded the maximum tool-call rounds.");
  } finally {
    await Promise.all(
      connections.map(async ({ client, transport }) => {
        try {
          await transport.close();
        } catch {
          try {
            await client.close?.();
          } catch {
            /* ignore */
          }
        }
      }),
    );
  }
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`All-MCP-Chat listening on ${PORT} publicDir=${publicDir}`);
  });
}

module.exports = app;
