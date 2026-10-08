// How the kit proves who it is to a Castalie workspace, outside the agent's own MCP connection.
//
// TWO WAYS, tried in this order:
//
//   1. A token written by hand: CASTALIE_TOKEN, or `.cs/config.json` (config.mjs). Unchanged, and
//      still the way for a robot or a CI runner that nobody signs in for.
//   2. OAuth against the workspace itself — the same journey Claude Code takes when `/mcp` signs in
//      to the `castalie` server: discovery, dynamic registration of a public client, authorization
//      with PKCE S256 through the browser, a loopback redirect on a port drawn at random, the code
//      exchanged for an access token and a refresh token. `cs login` runs it once; after that the
//      refresh token renews the access token by itself, for 90 days, and a sign-in is asked again
//      only when renewing fails.
//
// WHY THE KIT SIGNS IN ON ITS OWN rather than borrowing the token Claude Code already holds: that
// store is Claude Code's internal format, and a workspace that no longer hands out personal tokens
// from its screen leaves no other way for a local tool to reach it.
//
// WHERE IT IS KEPT: `~/.castalie/credentials.json` (CASTALIE_CREDENTIALS overrides the path), one
// block per workspace, readable by the user alone. Never in a repository: the tokens are the
// person's, not the project's.
//
// A REFRESH ROTATES BOTH TOKENS (Castalie revokes the access token it replaces). Two processes may
// hold the same block — the CLI in a terminal, the MCP server under the agent — so on a refusal the
// file is read again first: the other process may already have renewed it, and renewing a second
// time with a spent refresh token would sign both out.

import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { bareEndpoint, resolveConfig } from "./config.mjs";

export const SCOPES = "castalie.read castalie.write";
const CALLBACK_PATH = "/callback";
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
const EXPIRY_MARGIN_MS = 60 * 1000;

export class AuthError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    Object.assign(this, extra);
  }
}

/** The command a person types to sign in, for every message that asks them to. */
export const loginCommand = (endpoint) => `cs login ${endpoint || "https://<your-workspace>.castalie.app"}`;

export const NO_ENDPOINT_HELP =
  "No Castalie workspace. Sign in once with `cs login https://<your-workspace>.castalie.app`, "
  + "or set CASTALIE_ENDPOINT (and CASTALIE_TOKEN for a robot), or write .cs/config.json { \"endpoint\": ... }.";

// ── The store ────────────────────────────────────────────────────────────────

export function credentialsPath(environment = process.env) {
  return environment.CASTALIE_CREDENTIALS || join(homedir(), ".castalie", "credentials.json");
}

const keyOf = (endpoint) => bareEndpoint(endpoint).toLowerCase();

export function readCredentials(path = credentialsPath()) {
  if (!existsSync(path)) return { default: null, endpoints: {} };
  try {
    const json = JSON.parse(readFileSync(path, "utf8"));
    return { default: json.default ?? null, endpoints: json.endpoints ?? {} };
  } catch {
    return { default: null, endpoints: {} };
  }
}

/** Written whole through a temporary file, so a reader never sees half a file; user-only on POSIX. */
export function writeCredentials(store, path = credentialsPath()) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(store, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, path);
  try { chmodSync(path, 0o600); } catch { /* Windows: the profile folder is already the user's */ }
}

export function storedBlock(endpoint, path) {
  return readCredentials(path).endpoints[keyOf(endpoint)] ?? null;
}

export function saveBlock(endpoint, block, path) {
  const store = readCredentials(path);
  store.endpoints[keyOf(endpoint)] = { endpoint: bareEndpoint(endpoint), ...block };
  store.default = keyOf(endpoint);
  writeCredentials(store, path);
}

export function forgetBlock(endpoint, path) {
  const store = readCredentials(path);
  const existed = Boolean(store.endpoints[keyOf(endpoint)]);
  delete store.endpoints[keyOf(endpoint)];
  if (store.default === keyOf(endpoint)) store.default = Object.keys(store.endpoints)[0] ?? null;
  writeCredentials(store, path);
  return existed;
}

/** The tokens a token endpoint answered, as kept: the expiry is absolute, the clock is this machine's. */
export function blockFromTokens(tokens, { clientId, now = Date.now() } = {}) {
  return {
    client_id: clientId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    expires_at: tokens.expires_in ? now + Number(tokens.expires_in) * 1000 : null,
    scope: tokens.scope ?? null,
    obtained_at: new Date(now).toISOString(),
  };
}

export const isFresh = (block, now = Date.now()) =>
  Boolean(block?.access_token) && (!block.expires_at || block.expires_at - EXPIRY_MARGIN_MS > now);

// ── PKCE (RFC 7636) ──────────────────────────────────────────────────────────

const base64url = (buffer) => Buffer.from(buffer).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

export function pkceChallenge(verifier) {
  return base64url(createHash("sha256").update(verifier, "ascii").digest());
}

export function newPkce() {
  const verifier = base64url(randomBytes(48));
  return { verifier, challenge: pkceChallenge(verifier) };
}

// ── The protocol ─────────────────────────────────────────────────────────────

async function readJson(response, what) {
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : {}; } catch { /* not JSON */ }
  if (!response.ok) {
    const reason = json?.error ? `${json.error}${json.error_description ? ` — ${json.error_description}` : ""}` : text.slice(0, 200);
    throw new AuthError(json?.error || "oauth_http_error", `${what} → HTTP ${response.status}: ${reason}`, { status: response.status });
  }
  if (json === null) throw new AuthError("oauth_invalid_json", `${what} answered something that is not JSON.`);
  return json;
}

/**
 * Where to register, authorize and exchange, read from the workspace: the resource document names
 * its authorization server, whose metadata names the three addresses. A workspace that serves
 * neither document falls back to the addresses Castalie has always used, on its own host.
 */
export async function discover(endpoint, { fetchImpl = fetch } = {}) {
  const base = bareEndpoint(endpoint);
  let issuer = base;
  try {
    const resource = await readJson(await fetchImpl(`${base}/.well-known/oauth-protected-resource/mcp`), "resource metadata");
    if (Array.isArray(resource.authorization_servers) && resource.authorization_servers[0]) issuer = bareEndpoint(resource.authorization_servers[0]);
  } catch { /* the issuer stays the workspace itself */ }
  let metadata = {};
  try {
    metadata = await readJson(await fetchImpl(`${issuer}/.well-known/oauth-authorization-server`), "authorization server metadata");
  } catch { /* the defaults below */ }
  return {
    issuer,
    resource: `${base}/mcp`,
    authorization_endpoint: metadata.authorization_endpoint || `${issuer}/authorize`,
    token_endpoint: metadata.token_endpoint || `${issuer}/token`,
    registration_endpoint: metadata.registration_endpoint || `${issuer}/register`,
  };
}

/** A public client (RFC 7591), registered for this one loopback address — whose port Castalie lets move. */
export async function registerClient(discovery, redirectUri, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(discovery.registration_endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_name: "Castalie kit (cs CLI, castalie-files)",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  const json = await readJson(response, "client registration");
  if (!json.client_id) throw new AuthError("oauth_registration_failed", "The workspace registered no client_id.");
  return json.client_id;
}

export function authorizationUrl(discovery, { clientId, redirectUri, challenge, state }) {
  const url = new URL(discovery.authorization_endpoint);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    scope: SCOPES,
    resource: discovery.resource,
  }).toString();
  return url.toString();
}

async function postForm(url, form, what, fetchImpl) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(form).toString(),
  });
  return readJson(response, what);
}

export async function exchangeCode(discovery, { code, verifier, clientId, redirectUri }, { fetchImpl = fetch } = {}) {
  const tokens = await postForm(discovery.token_endpoint, {
    grant_type: "authorization_code", code, code_verifier: verifier, client_id: clientId, redirect_uri: redirectUri, resource: discovery.resource,
  }, "code exchange", fetchImpl);
  if (!tokens.access_token) throw new AuthError("oauth_no_token", "The workspace answered the exchange without an access token.");
  return tokens;
}

export async function refreshTokens(discovery, { refreshToken, clientId }, { fetchImpl = fetch } = {}) {
  const tokens = await postForm(discovery.token_endpoint, {
    grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId || "", resource: discovery.resource,
  }, "token refresh", fetchImpl);
  if (!tokens.access_token) throw new AuthError("oauth_no_token", "The workspace answered the refresh without an access token.");
  return tokens;
}

// ── The interactive sign-in ──────────────────────────────────────────────────

const PAGE = (title, line) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>`
  + `<meta name="viewport" content="width=device-width,initial-scale=1"></head>`
  + `<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem">`
  + `<h1 style="font-size:1.4rem">${title}</h1><p>${line}</p></body></html>`;

/**
 * Starts a sign-in and returns at once with the address to open, and a promise that settles when
 * the browser comes back: the loopback listener, on 127.0.0.1 and a port the system draws, lives
 * until then — ten minutes at most — and stores the tokens itself. The CLI awaits the promise; the
 * MCP server hands the address to the agent and lets the promise finish in the background.
 */
export async function startLogin(endpoint, { fetchImpl = fetch, path, timeoutMs = LOGIN_TIMEOUT_MS } = {}) {
  const base = bareEndpoint(endpoint);
  const discovery = await discover(base, { fetchImpl });
  const { verifier, challenge } = newPkce();
  const state = base64url(randomBytes(24));

  let settle;
  const done = new Promise((resolveDone, rejectDone) => { settle = { resolve: resolveDone, reject: rejectDone }; });
  done.catch(() => { /* a caller that never awaits must not crash the process */ });

  let redirectUri;
  let clientId;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname !== CALLBACK_PATH) { response.writeHead(404).end(); return; }
    const reply = (status, title, line) => {
      response.writeHead(status, { "content-type": "text/html; charset=utf-8" });
      response.end(PAGE(title, line));
    };
    if (url.searchParams.get("state") !== state) { reply(400, "Castalie", "This answer does not belong to the sign-in in progress. Start it again."); return; }
    const error = url.searchParams.get("error");
    if (error) {
      reply(400, "Castalie: not connected", `The workspace answered <code>${error.replace(/[<>&"]/g, "")}</code>. You can close this tab.`);
      finish(new AuthError(error === "access_denied" ? "login_refused" : error, `The sign-in was not completed: ${error}.`));
      return;
    }
    try {
      const tokens = await exchangeCode(discovery, { code: url.searchParams.get("code") || "", verifier, clientId, redirectUri }, { fetchImpl });
      saveBlock(base, blockFromTokens(tokens, { clientId }), path);
      reply(200, "Castalie: connected", "The kit is signed in to your workspace. You can close this tab and go back to your assistant.");
      finish(null, { endpoint: base });
    } catch (exchangeError) {
      reply(400, "Castalie: not connected", "The code could not be exchanged for a token. Start the sign-in again.");
      finish(exchangeError);
    }
  });

  let timer;
  function finish(error, value) {
    clearTimeout(timer);
    server.close();
    if (error) settle.reject(error); else settle.resolve(value);
  }

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  server.unref?.();
  redirectUri = `http://127.0.0.1:${server.address().port}${CALLBACK_PATH}`;
  try {
    clientId = await registerClient(discovery, redirectUri, { fetchImpl });
  } catch (error) {
    server.close();
    throw error;
  }
  timer = setTimeout(() => finish(new AuthError("login_timeout", "Nobody came back from the sign-in page within ten minutes.")), timeoutMs);
  timer.unref?.();

  return { url: authorizationUrl(discovery, { clientId, redirectUri, challenge, state }), redirectUri, done };
}

/** Opens an address in the person's default browser; false when nothing could be launched. */
export function openBrowser(url) {
  try {
    const [command, args] = process.platform === "win32"
      ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
      : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
    const child = spawn(command, args, { stdio: "ignore", detached: true, windowsHide: true });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

// ── The connection a command uses ────────────────────────────────────────────

/** The workspace in use: the configured one, else the last one `cs login` signed in to; null when none. */
export function defaultEndpoint({ cwd = process.cwd(), environment = process.env } = {}) {
  const config = resolveConfig({ cwd, environment });
  if (config.endpoint) return config.endpoint;
  const store = readCredentials(credentialsPath(environment));
  return (store.default && store.endpoints[store.default]?.endpoint) || null;
}

/**
 * The endpoint and a token to call it with. A hand-written token wins; otherwise the stored OAuth
 * block, renewed first when it is about to expire. Throws an AuthError:
 *   `no_endpoint`     nothing names a workspace;
 *   `login_required`  no usable token, and the refresh failed or there was nothing to refresh —
 *                     carries `endpoint`, so the caller can start a sign-in for it.
 */
export async function resolveConnection({ cwd = process.cwd(), environment = process.env, fetchImpl = fetch, endpoint: wanted } = {}) {
  const config = resolveConfig({ cwd, environment });
  const path = credentialsPath(environment);
  const store = readCredentials(path);
  const endpoint = wanted ? bareEndpoint(wanted) : (config.endpoint || defaultEndpoint({ cwd, environment }));
  if (!endpoint) throw new AuthError("no_endpoint", NO_ENDPOINT_HELP);

  // A hand-written token goes with the workspace it was written for — or, with no workspace named
  // beside it, with whichever one is in use, as the CLI always read it.
  if (config.token && (!config.endpoint || keyOf(config.endpoint) === keyOf(endpoint))) {
    return { endpoint, token: config.token, source: config.tokenSource, oauth: false };
  }

  const block = store.endpoints[keyOf(endpoint)];
  if (isFresh(block)) return { endpoint, token: block.access_token, source: path, oauth: true };
  if (block?.refresh_token) return renew(endpoint, { fetchImpl, path, spent: block.access_token });
  throw new AuthError("login_required", `Not signed in to ${endpoint}. Run \`${loginCommand(endpoint)}\` once.`, { endpoint });
}

/**
 * Renews a stored block after a refusal or an expiry. Reads the file again first: another process
 * may have renewed it already, and its fresh token is then the answer.
 */
export async function renew(endpoint, { fetchImpl = fetch, path = credentialsPath(), spent } = {}) {
  const block = storedBlock(endpoint, path);
  if (block?.access_token && block.access_token !== spent && isFresh(block)) {
    return { endpoint: bareEndpoint(endpoint), token: block.access_token, source: path, oauth: true };
  }
  if (!block?.refresh_token) {
    throw new AuthError("login_required", `Not signed in to ${endpoint}. Run \`${loginCommand(endpoint)}\` once.`, { endpoint: bareEndpoint(endpoint) });
  }
  try {
    const discovery = await discover(endpoint, { fetchImpl });
    const tokens = await refreshTokens(discovery, { refreshToken: block.refresh_token, clientId: block.client_id }, { fetchImpl });
    const renewed = blockFromTokens(tokens, { clientId: block.client_id });
    if (!renewed.refresh_token) renewed.refresh_token = block.refresh_token;
    saveBlock(endpoint, renewed, path);
    return { endpoint: bareEndpoint(endpoint), token: renewed.access_token, source: path, oauth: true };
  } catch (error) {
    // The other process may have renewed between our read and our refresh, spending the token we sent.
    const again = storedBlock(endpoint, path);
    if (again?.access_token && again.access_token !== block.access_token && isFresh(again)) {
      return { endpoint: bareEndpoint(endpoint), token: again.access_token, source: path, oauth: true };
    }
    throw new AuthError("login_required",
      `The sign-in to ${endpoint} has expired or was revoked (${error.code || error.message}). Run \`${loginCommand(endpoint)}\` again.`,
      { endpoint: bareEndpoint(endpoint) });
  }
}
