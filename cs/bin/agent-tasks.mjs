// cs agent-tasks — a workstation declares to Castalie the agent tasks it runs for this workspace.
//
// What runs on a team's machines by itself (the engine that plays Castalie's scheduled tasks, a
// bug-fixing robot, the guards around them, a nightly routine) lives in each machine's own
// scheduler, where nobody reads it from anywhere else. A task dead for weeks, one stuck waiting for
// a password, a forgotten test: each was found by hand, the day somebody happened to look.
//
// So this reports them, every 15 minutes once installed, through the `workstation_report` verb.
// Castalie computes the nature (permanent, watch, recurring) and the health (failing, stuck, missed,
// silent) and shows them on /taches-planifiees. What leaves the machine and what never does is in
// `instructions/agent-tasks.md`; `--dry-run` prints exactly the payload.
//
//   cs agent-tasks report    [--endpoint <url>] [--match <glob>]... [--always-on] [--repo <dir>] [--dry-run]
//   cs agent-tasks install   [--endpoint <url>] [--match <glob>]... [--always-on] [--elevated] [--repo <dir>] [--every <minutes>]
//   cs agent-tasks uninstall
//
// WHICH TASKS. A task is the workspace's when its action or its working directory sits in a working
// copy of the repository the reporter runs for — the main checkout and every worktree `git worktree
// list` names — or when its name matches a `--match` pattern the workspace's installer declares
// (for what runs elsewhere: an infrastructure checkout, a vendor tool). A developer's own tasks (a
// backup, a reminder) are neither: they never leave the machine.
//
// Windows first (the Task Scheduler, read through PowerShell). launchd and cron come through the
// same verb: the triggers are already normalised to a vocabulary that is not Windows'.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { hostname as osHostname, homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_TASK_NAME = "Castalie - report agent tasks";
const SCRIPT_EXTENSIONS = "ps1|psm1|mjs|cjs|js|ts|py|sh|cmd|bat|vbs";

// ── Pure: the selection ─────────────────────────────────────────────────────

/** A glob with `*` and `?`, matched whole and ignoring case. */
export function globToRegExp(glob) {
  const escaped = String(glob).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

/** A path as compared: backslashes, lower case, no trailing separator. */
export function normalisePath(path) {
  return String(path || "").replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
}

/**
 * Whether a scheduler task belongs to the workspace: its name matches a declared pattern, or its
 * action or working directory sits in one of the repository's working copies.
 */
export function belongsToWorkspace(task, { roots = [], patterns = [] } = {}) {
  if (/^\\microsoft\\/i.test(task.path || "")) return false;
  const regexps = patterns.map(globToRegExp);
  if (regexps.some((re) => re.test(task.name) || re.test(`${task.path || "\\"}${task.name}`))) return true;
  const haystack = (task.actions || [])
    .flatMap((a) => [a.execute, a.arguments, a.workingDirectory])
    .filter(Boolean)
    .map((value) => normalisePath(value) + "\\");
  return roots.map(normalisePath).filter(Boolean).some((root) => haystack.some((text) => text.includes(root + "\\")));
}

/**
 * The executable and the script files an action runs — never its arguments, which may carry a
 * token, a password or a customer's name. Script paths are recognised by their extension.
 */
export function actionSummary(actions = [], { exists = existsSync } = {}) {
  const parts = [];
  const scriptPath = new RegExp(`\\.(?:${SCRIPT_EXTENSIONS})$`, "i");
  // One path from end to end: a drive, a UNC or relative root, then no quote, separator of commands,
  // assignment, second drive nor flag.
  const wholePath = /^(?:[A-Za-z]:[\\/]|\\\\|[\\/]|\.{1,2}[\\/])[^"';&|=<>:]*$/;
  const keep = (candidate) => {
    const path = candidate.trim();
    if (!scriptPath.test(path) || !/[\\/]/.test(path) || /\s[-/]/.test(path)) return;
    if (exists(path) && !parts.includes(path)) parts.push(path);
  };
  const split = (text) => text.split(/[\s"';&|=,()<>]+/).forEach(keep);
  for (const action of actions) {
    if (action.execute) parts.push(basename(String(action.execute).replace(/"/g, "").replace(/\\/g, "/")));
    // A quoted segment counts as one path (spaces allowed) only when it is shaped like one from end
    // to end; any other quoted text — an inline command — is split and only its paths survive.
    const unquoted = String(action.arguments || "").replace(/"([^"]*)"|'([^']*)'/g, (_, double, simple) => {
      const segment = (double ?? simple).trim();
      if (wholePath.test(segment)) keep(segment); else split(segment);
      return " ";
    });
    split(unquoted);
  }
  return parts.join(" ").slice(0, 500) || null;
}

/** An ISO 8601 duration (PT5M, PT3H, P1D, P3DT2H) in minutes; null for empty or zero (no limit). */
export function durationMinutes(iso) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(iso || "").trim());
  if (!m) return null;
  const minutes = (+(m[1] || 0)) * 1440 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)) + Math.floor((+(m[4] || 0)) / 60);
  return minutes > 0 ? minutes : null;
}

const WEEK_BITS = [[2, "mon"], [4, "tue"], [8, "wed"], [16, "thu"], [32, "fri"], [64, "sat"], [1, "sun"]];

function hourOf(start) {
  const m = /T(\d{2}:\d{2})/.exec(String(start || ""));
  return m ? m[1] : undefined;
}

function daysOfMonth(value) {
  if (Array.isArray(value)) return value.map(Number).filter((d) => d >= 1 && d <= 31);
  const mask = Number(value) || 0;
  const days = [];
  for (let d = 1; d <= 31; d++) if (mask & (1 << (d - 1))) days.push(d);
  return days;
}

/** One Windows trigger, as CIM describes it, in the kit's vocabulary. Disabled triggers are dropped by the caller. */
export function normaliseWindowsTrigger(t) {
  const every = durationMinutes(t.interval);
  const repeat = every ? { every_minutes: every, for_minutes: durationMinutes(t.duration) } : {};
  const at = hourOf(t.start);
  switch (t.type) {
    case "MSFT_TaskBootTrigger": return { kind: "boot", ...repeat };
    case "MSFT_TaskLogonTrigger": return { kind: "logon", ...repeat };
    case "MSFT_TaskDailyTrigger": return { kind: "daily", at, days_interval: Number(t.daysInterval) || 1, ...repeat };
    case "MSFT_TaskWeeklyTrigger": {
      const mask = Number(t.daysOfWeek) || 0;
      return { kind: "weekly", at, days_of_week: WEEK_BITS.filter(([bit]) => mask & bit).map(([, day]) => day), ...repeat };
    }
    case "MSFT_TaskMonthlyTrigger": return { kind: "monthly", at, days_of_month: daysOfMonth(t.daysOfMonth), ...repeat };
    case "MSFT_TaskTimeTrigger":
      return every ? { kind: "interval", ...repeat } : { kind: "once", start_at: String(t.start || "").slice(0, 16) || undefined };
    default: return { kind: "other", ...repeat };
  }
}

const STATES = { Ready: "ready", Running: "running", Disabled: "disabled", Queued: "ready" };

/** A Windows task, as the PowerShell probe returns it, in the shape `workstation_report` takes. */
export function toReportedTask(task) {
  const state = STATES[task.state] || "unknown";
  return {
    key: `${task.path || "\\"}${task.name}`,
    name: task.name,
    description: task.description ? String(task.description).slice(0, 2000) : null,
    enabled: state !== "disabled",
    state,
    triggers: (task.triggers || []).filter((t) => t.enabled !== false).map(normaliseWindowsTrigger),
    execution_limit_minutes: durationMinutes(task.limit),
    wake_to_run: Boolean(task.wake),
    action_summary: actionSummary(task.actions),
    working_directory: (task.actions || []).map((a) => a.workingDirectory).find(Boolean) || null,
    last_run_at: task.lastRun || null,
    last_result_code: task.result ?? null,
    next_run_at: task.nextRun || null,
  };
}

// ── Reading the machine ─────────────────────────────────────────────────────

const PROBE = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$rows = foreach ($t in Get-ScheduledTask) {
  if ($t.TaskPath -like '\\Microsoft\\*') { continue }
  $i = $null; try { $i = $t | Get-ScheduledTaskInfo -ErrorAction Stop } catch {}
  [pscustomobject]@{
    path = $t.TaskPath; name = $t.TaskName; description = $t.Description; state = [string]$t.State
    limit = [string]$t.Settings.ExecutionTimeLimit; wake = [bool]$t.Settings.WakeToRun
    actions = @($t.Actions | ForEach-Object { [pscustomobject]@{ execute = $_.Execute; arguments = $_.Arguments; workingDirectory = $_.WorkingDirectory } })
    triggers = @($t.Triggers | ForEach-Object { [pscustomobject]@{ type = $_.CimClass.CimClassName; enabled = $_.Enabled; start = $_.StartBoundary; interval = $_.Repetition.Interval; duration = $_.Repetition.Duration; daysInterval = $_.DaysInterval; daysOfWeek = $_.DaysOfWeek; daysOfMonth = $_.DaysOfMonth } })
    lastRun = $(if ($i -and $i.LastRunTime -and $i.LastRunTime.Year -gt 2000) { ([DateTimeOffset]$i.LastRunTime).ToString('o') } else { $null })
    nextRun = $(if ($i -and $i.NextRunTime) { ([DateTimeOffset]$i.NextRunTime).ToString('o') } else { $null })
    result = $(if ($i) { [int64][uint32]$i.LastTaskResult } else { $null })
  }
}
ConvertTo-Json -InputObject @($rows) -Depth 6 -Compress
`;

function readWindowsTasks() {
  const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", PROBE],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  const parsed = JSON.parse(out.replace(/^﻿/, "").trim() || "[]");
  return Array.isArray(parsed) ? parsed : [parsed];
}

/** The repository's working copies: the checkout `repo` belongs to, and every worktree of it. */
export function workingCopies(repo) {
  const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", windowsHide: true }).trim();
  const roots = new Set();
  try { roots.add(resolve(git("rev-parse", "--show-toplevel"))); } catch { return []; }
  try {
    for (const line of git("worktree", "list", "--porcelain").split(/\r?\n/)) {
      if (line.startsWith("worktree ")) roots.add(resolve(line.slice(9).trim()));
    }
  } catch { /* a repository without worktrees still has its own root */ }
  return [...roots];
}

function kitVersion() {
  try {
    return JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", ".claude-plugin", "plugin.json"), "utf8")).version ?? null;
  } catch { return null; }
}

// ── Talking to Castalie ─────────────────────────────────────────────────────

const CONFIG_DIRS = [".cs", ".bg", ".g" + "aly"];

function readConfigFrom(startDir) {
  let dir = resolve(startDir);
  for (;;) {
    for (const folder of CONFIG_DIRS) {
      const candidate = join(dir, folder, "config.json");
      if (existsSync(candidate)) {
        try { return JSON.parse(readFileSync(candidate, "utf8")); } catch { return {}; }
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return {};
    dir = parent;
  }
}

/**
 * The token Claude Code already stores for this server after `/mcp` signed in to it — the freshest
 * one for exactly `<endpoint>/mcp`. Windows and Linux keep it in `.credentials.json`; macOS keeps it
 * in the login Keychain, out of this reader's reach (set CASTALIE_TOKEN there).
 */
export function storedOAuthToken(endpoint, credentialsPath) {
  const path = credentialsPath || join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), ".credentials.json");
  if (!existsSync(path)) return null;
  let json;
  try { json = JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
  const wanted = `${endpoint.replace(/\/+$/, "")}/mcp`;
  const now = Date.now();
  const candidates = Object.values(json.mcpOAuth || {})
    .filter((entry) => entry && entry.accessToken && entry.serverUrl === wanted)
    .filter((entry) => !entry.expiresAt || Number(entry.expiresAt) > now)
    .sort((a, b) => Number(b.expiresAt || 0) - Number(a.expiresAt || 0));
  return candidates[0]?.accessToken || null;
}

const bareEndpoint = (value) => String(value || "").replace(/\/+$/, "").replace(/\/mcp$/i, "").toLowerCase();

/** The endpoint to report to: --endpoint, else CASTALIE_ENDPOINT, else .cs/config.json. Installing needs nothing more. */
function resolveEndpoint(args, config) {
  const endpoint = (args.endpoint && args.endpoint !== true ? args.endpoint : null) || process.env.CASTALIE_ENDPOINT || config.endpoint;
  if (!endpoint) fail("No endpoint. Pass --endpoint https://<workspace>.castalie.app, or set CASTALIE_ENDPOINT.");
  return String(endpoint).replace(/\/+$/, "").replace(/\/mcp$/i, "");
}

/**
 * The token, read only for the endpoint it was issued for: CASTALIE_TOKEN (set by whoever runs the
 * reporter), .cs/config.json's when its own endpoint is this one, else Claude Code's for <endpoint>/mcp.
 */
function resolveConnection(args, repo) {
  const config = readConfigFrom(repo);
  const endpoint = resolveEndpoint(args, config);
  const configToken = config.token && bareEndpoint(config.endpoint) === bareEndpoint(endpoint) ? config.token : null;
  const token = process.env.CASTALIE_TOKEN || configToken || storedOAuthToken(endpoint);
  if (!token) {
    fail(`No token for ${endpoint}/mcp. Set CASTALIE_TOKEN, write .cs/config.json { "token": ... }, `
      + "or sign in to the castalie MCP server once in Claude Code (/mcp) on this machine's account.");
  }
  return { endpoint, token };
}

async function callTool({ endpoint, token }, name, args) {
  const response = await fetch(`${endpoint}/mcp`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, accept: "application/json, text/event-stream", "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const text = await response.text();
  if (response.status === 401) fail(`Castalie refused the token (HTTP 401). Sign in again to the castalie MCP server, or renew CASTALIE_TOKEN.`);
  if (!response.ok) fail(`${name} → HTTP ${response.status}: ${text.slice(0, 300)}`);
  const dataLine = text.split(/\r?\n/).find((line) => line.startsWith("data:"));
  const envelope = JSON.parse(dataLine ? dataLine.slice(5).trim() : text);
  if (envelope.error) fail(`${name}: ${envelope.error.message || envelope.error.code}`);
  const payload = envelope.result?.content?.find((c) => c.type === "text")?.text;
  const result = payload ? JSON.parse(payload) : envelope.result;
  if (result?.success === false) fail(`${name}: ${result.error || "refused"}`);
  return result;
}

// ── Commands ────────────────────────────────────────────────────────────────

export function parseAgentTaskArgs(argv) {
  const out = { _: [], match: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { out._.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    const value = next === undefined || next.startsWith("--") ? true : (i++, next);
    if (key === "match") { if (value !== true) out.match.push(value); }
    else out[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
  }
  return out;
}

function requireWindows() {
  if (process.platform !== "win32") {
    fail("cs agent-tasks reads the Windows Task Scheduler; launchd and cron are not read yet on this platform.");
  }
}

export async function buildReport(args) {
  const repo = resolve(args.repo && args.repo !== true ? args.repo : process.cwd());
  const roots = workingCopies(repo);
  const tasks = readWindowsTasks()
    .filter((task) => belongsToWorkspace(task, { roots, patterns: args.match }))
    .map(toReportedTask);
  return {
    repo,
    roots,
    payload: {
      hostname: osHostname(),
      os: "windows",
      always_on: args.alwaysOn === true,
      time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      kit_version: kitVersion(),
      tasks,
    },
  };
}

async function cmdReport(args) {
  requireWindows();
  const { repo, roots, payload } = await buildReport(args);
  if (args.dryRun) {
    console.log(JSON.stringify({ working_copies: roots, patterns: args.match, ...payload }, null, 2));
    return;
  }

  const connection = resolveConnection(args, repo);
  const answer = await callTool(connection, "workstation_report", payload);
  const station = answer.workstation || {};
  console.log(`Reported ${payload.tasks.length} task(s) of ${payload.hostname} to ${connection.endpoint}: `
    + `${station.unhealthy_count ?? 0} unhealthy. ${connection.endpoint}/taches-planifiees#taches-des-postes`);
}

/**
 * The stable path of `cs.mjs`: the marketplace clone the plugin cache is built from, so an update
 * of the kit, which replaces the versioned cache folder, does not break the installed task.
 */
export function stableCliPath(running = fileURLToPath(new URL("./cs.mjs", import.meta.url))) {
  const parts = running.split(/[\\/]/);
  const cache = parts.lastIndexOf("cache");
  if (cache > 0 && parts[cache - 1] === "plugins" && parts.length > cache + 2) {
    const marketplace = parts[cache + 1];
    const plugin = parts[cache + 2];
    const candidate = [...parts.slice(0, cache), "marketplaces", marketplace, plugin, "bin", "cs.mjs"].join(sep);
    if (existsSync(candidate)) return candidate;
  }
  return running;
}

/** One Windows command-line argument: inner quotes escaped, trailing backslashes doubled so they never escape the closing quote. */
export function quote(value) {
  return `"${String(value).replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1")}"`;
}


/**
 * The repository's main checkout — the first worktree `git worktree list` names. The reporter runs
 * from it, never from a worktree another session resets or deletes: a task left running from a
 * throwaway folder is one of the defects this report exists to show.
 */
export function mainCheckout(repo) {
  try {
    const list = execFileSync("git", ["-C", repo, "worktree", "list", "--porcelain"], { encoding: "utf8", windowsHide: true });
    const first = list.split(/\r?\n/).find((line) => line.startsWith("worktree "));
    return first ? resolve(first.slice(9).trim()) : null;
  } catch { return null; }
}

function xmlEscape(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The Task Scheduler definition: every N minutes from now on, no window, five minutes at most. */
export function taskXml({ identity, every, command, argument, workingDirectory, description, start, elevated = false }) {
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>${xmlEscape(description)}</Description></RegistrationInfo>
  <Triggers>
    <TimeTrigger>
      <Enabled>true</Enabled>
      <StartBoundary>${start}</StartBoundary>
      <Repetition><Interval>PT${every}M</Interval><StopAtDurationEnd>false</StopAtDurationEnd></Repetition>
    </TimeTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>${xmlEscape(identity)}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>${elevated ? "HighestAvailable" : "LeastPrivilege"}</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT5M</ExecutionTimeLimit>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${xmlEscape(command)}</Command>
      <Arguments>${xmlEscape(argument)}</Arguments>
      <WorkingDirectory>${xmlEscape(workingDirectory)}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>`;
}

function schtasks(...args) {
  const result = spawnSync("schtasks.exe", args, { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) fail(`schtasks ${args[0]} failed: ${(result.stderr || result.stdout || "").trim()}`);
  return result.stdout;
}

async function cmdInstall(args) {
  requireWindows();
  const repo = mainCheckout(resolve(args.repo && args.repo !== true ? args.repo : process.cwd()));
  if (!repo) fail("Run it from a working copy of your repository, or pass --repo <dir>.");
  const endpoint = resolveEndpoint(args, readConfigFrom(repo));
  const every = Math.max(5, Math.min(60, Number(args.every) || 15));
  const name = args.taskName && args.taskName !== true ? String(args.taskName) : DEFAULT_TASK_NAME;
  const cli = stableCliPath();

  const reportArgs = [quote(cli), "agent-tasks", "report", "--endpoint", quote(endpoint), "--repo", quote(repo)];
  for (const pattern of args.match) reportArgs.push("--match", quote(pattern));
  if (args.alwaysOn === true) reportArgs.push("--always-on");

  // conhost --headless runs the console program with no window at all: a reporter every 15 minutes
  // must not flash a terminal on a developer's screen.
  const argument = ["--headless", quote(process.execPath), ...reportArgs].join(" ");
  const description = "Castalie: reports this workstation's agent tasks for the workspace every "
    + `${every} minutes (cs agent-tasks). Sends names, triggers, last and next runs, results; never a command's arguments.`;

  // Registered from an XML through schtasks, not with Register-ScheduledTask: that cmdlet answers
  // "access denied" unelevated on some profiles, where schtasks registers a current-user task fine.
  // The token's own name: an SSH session sets USERDOMAIN to the workgroup, which the scheduler cannot map.
  // By SID: an Entra-joined profile's account name (AzureAD\name) does not always map back in the
  // scheduler, and a Unix `whoami` earlier on the PATH answers in its own spelling.
  const whoami = join(process.env.SystemRoot || "C:\\Windows", "System32", "whoami.exe");
  const identity = execFileSync(whoami, ["/user", "/fo", "csv", "/nh"], { encoding: "utf8", windowsHide: true })
    .trim().split(",").pop().replace(/"/g, "");
  const now = new Date(Date.now() + 60_000);
  const pad = (n) => String(n).padStart(2, "0");
  const start = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:00`;
  const xml = taskXml({ identity, every, command: "conhost.exe", argument, workingDirectory: repo, description, start, elevated: args.elevated === true });
  const file = join(tmpdir(), `cs-agent-tasks-${process.pid}.xml`);
  try {
    writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, "utf16le")]));
    schtasks("/create", "/tn", name, "/xml", file, "/f");
  } finally {
    rmSync(file, { force: true });
  }
  schtasks("/run", "/tn", name);
  console.log(`Installed '${name}': every ${every} min, from ${repo}, reporting to ${endpoint}.`);
  console.log(`It runs ${cli}. Check what it sends with: node ${quote(cli)} agent-tasks report --dry-run --repo ${quote(repo)}${args.match.map((m) => ` --match ${quote(m)}`).join("")}`);
}

function cmdUninstall(args) {
  requireWindows();
  const name = args.taskName && args.taskName !== true ? String(args.taskName) : DEFAULT_TASK_NAME;
  const query = spawnSync("schtasks.exe", ["/query", "/tn", name], { encoding: "utf8", windowsHide: true });
  if (query.status === 0) schtasks("/delete", "/tn", name, "/f");
  console.log(`Removed '${name}' if it was there. Its workstation stays on Castalie until the owner forgets it.`);
}

const HELP = `cs agent-tasks — declare this workstation's agent tasks to Castalie

  cs agent-tasks report     [--endpoint <url>] [--match <glob>]... [--always-on] [--repo <dir>] [--dry-run]
  cs agent-tasks install    [--endpoint <url>] [--match <glob>]... [--always-on] [--elevated] [--repo <dir>] [--every <minutes>]
  cs agent-tasks uninstall  [--task-name <name>]

A task is reported when its action or working directory sits in a working copy of the repository
(--repo, default: here, with all its worktrees), or when its name matches a --match pattern.
--always-on: this machine runs day and night (a robot); Castalie calls it silent when reports stop.
--elevated: run with the account's highest rights, to read tasks another account owns (SYSTEM);
  install it from an elevated shell.
Token: CASTALIE_TOKEN, .cs/config.json, or the one Claude Code stored when /mcp signed in.`;

export async function runCli(argv) {
  const [command, ...rest] = argv;
  const args = parseAgentTaskArgs(rest);
  switch (command) {
    case "report": return cmdReport(args);
    case "install": return cmdInstall(args);
    case "uninstall": return cmdUninstall(args);
    default: console.log(HELP);
  }
}

function fail(message) {
  console.error(`cs agent-tasks: ${message}`);
  process.exit(1);
}

