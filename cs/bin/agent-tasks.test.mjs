// The pure half of `cs agent-tasks`: which tasks leave the machine, and in what shape. Replayed on
// the shapes the Task Scheduler of a robot and of a developer's workstation actually returned.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  actionSummary, belongsToWorkspace, durationMinutes, globToRegExp, normaliseWindowsTrigger, parseAgentTaskArgs, quote,
  stableCliPath, storedOAuthToken, toReportedTask,
} from "./agent-tasks.mjs";

const hidden = (script) => ({
  execute: "C:\\WINDOWS\\System32\\wscript.exe",
  arguments: `//nologo //B "C:\\Work\\repo\\scripts\\Run-HiddenTask.vbs" "C:\\Program Files\\PowerShell\\7\\pwsh.exe" "C:\\Work\\repo\\scripts\\Invoke-HiddenRun.ps1" -ScriptPath "C:\\Work\\repo\\scripts\\${script}" -Token s3cr3t-value`,
  workingDirectory: "C:\\Work\\repo",
});

// ── which tasks ──
{
  const roots = ["C:/Work/repo", "C:/Work/wt-5"];
  const workspace = { path: "\\", name: "Delivery Watch", actions: [hidden("Watch.ps1")] };
  const fromWorktree = { path: "\\", name: "Central Bugfix", actions: [{ execute: "pwsh.exe", arguments: "-File \"C:\\Work\\wt-5\\scripts\\Tick.ps1\"" }] };
  const backup = { path: "\\", name: "Backup tabs", actions: [{ execute: "pwsh.exe", arguments: "-File \"C:\\Users\\me\\AppData\\Local\\Backup.ps1\"" }] };
  const siblingPrefix = { path: "\\", name: "Other", actions: [{ execute: "C:\\Work\\wt-50\\run.cmd" }] };
  const ssh = { path: "\\", name: "SyncAgentSshAccess", actions: [{ execute: "powershell.exe", arguments: "-Command \"git -C 'C:\\infra' pull\"" }] };
  const microsoft = { path: "\\Microsoft\\Windows\\", name: "Defrag", actions: [{ execute: "C:\\Work\\repo\\x.cmd" }] };

  assert.equal(belongsToWorkspace(workspace, { roots }), true, "a task running from the repository is the workspace's");
  assert.equal(belongsToWorkspace(fromWorktree, { roots }), true, "a worktree of the repository counts");
  assert.equal(belongsToWorkspace(backup, { roots }), false, "a developer's own task never leaves");
  assert.equal(belongsToWorkspace(siblingPrefix, { roots }), false, "wt-50 is not inside wt-5");
  assert.equal(belongsToWorkspace(ssh, { roots }), false);
  assert.equal(belongsToWorkspace(ssh, { roots, patterns: ["SyncAgentSshAccess"] }), true, "a declared name is the workspace's");
  assert.equal(belongsToWorkspace({ ...backup, name: "GA Routine Daily Check" }, { roots, patterns: ["GA *"] }), true);
  assert.equal(belongsToWorkspace(microsoft, { roots }), false, "Windows' own tasks are never read");
  assert.equal(globToRegExp("GA *").test("ga routine"), true);
}

// ── never the arguments ──
{
  const everyFile = { exists: () => true };
  const summary = actionSummary([hidden("Watch.ps1")], everyFile);
  assert.equal(summary, "wscript.exe C:\\Work\\repo\\scripts\\Run-HiddenTask.vbs C:\\Work\\repo\\scripts\\Invoke-HiddenRun.ps1 C:\\Work\\repo\\scripts\\Watch.ps1");
  assert.ok(!summary.includes("s3cr3t"), "an argument value never leaves the machine");
  assert.ok(!summary.includes("-Token"));

  const inline = actionSummary([{ execute: "powershell.exe", arguments: "-Command \"$env:X='y'; & 'C:\\infra\\Sync-Access.ps1' -Password hunter2\"" }], everyFile);
  assert.equal(inline, "powershell.exe C:\\infra\\Sync-Access.ps1");

  // A quoted inline command ending in a script path: only the path survives, never the command.
  const command = actionSummary([{ execute: "pwsh.exe", arguments: "-Command \"Set-Foo -Token s3cr3t; & C:\\x\\run.ps1\"" }], everyFile);
  assert.equal(command, "pwsh.exe C:\\x\\run.ps1");

  // A value that merely ends like a script is not a path.
  assert.equal(actionSummary([{ execute: "node.exe", arguments: "--key=abc.js --secret s3cr3t.ps1" }], everyFile), "node.exe");

  // A quoted path with spaces is one path; a path that does not exist on this machine never leaves.
  assert.equal(actionSummary([{ execute: "pwsh.exe", arguments: "-File \"C:\\My Scripts\\run.ps1\"" }], everyFile), "pwsh.exe C:\\My Scripts\\run.ps1");
  assert.equal(actionSummary([{ execute: "pwsh.exe", arguments: "-File \"C:\\not\\there.ps1\"" }]), "pwsh.exe");
}

// ── one Windows argument ──
{
  assert.equal(quote("C:\\repo\\"), "\"C:\\repo\\\\\"", "a trailing backslash cannot escape the closing quote");
  assert.equal(quote("GA *"), "\"GA *\"");
  assert.equal(quote("say \"hi\""), "\"say \\\"hi\\\"\"");
}

// ── durations and triggers ──
{
  assert.equal(durationMinutes("PT5M"), 5);
  assert.equal(durationMinutes("PT11H"), 660);
  assert.equal(durationMinutes("P3D"), 4320);
  assert.equal(durationMinutes("PT2H59M"), 179);
  assert.equal(durationMinutes("PT0S"), null, "zero is no limit");
  assert.equal(durationMinutes(""), null);

  assert.deepEqual(normaliseWindowsTrigger({ type: "MSFT_TaskLogonTrigger" }), { kind: "logon" });
  assert.deepEqual(normaliseWindowsTrigger({ type: "MSFT_TaskTimeTrigger", start: "2026-08-31T18:06:31+02:00", interval: "PT5M", duration: "" }),
    { kind: "interval", every_minutes: 5, for_minutes: null });
  assert.deepEqual(normaliseWindowsTrigger({ type: "MSFT_TaskDailyTrigger", start: "2026-09-03T00:03:00+02:00", daysInterval: 1, interval: "PT15M", duration: "PT10H" }),
    { kind: "daily", at: "00:03", days_interval: 1, every_minutes: 15, for_minutes: 600 });
  assert.deepEqual(normaliseWindowsTrigger({ type: "MSFT_TaskWeeklyTrigger", start: "2026-09-16T08:22:00+02:00", daysOfWeek: 62 }),
    { kind: "weekly", at: "08:22", days_of_week: ["mon", "tue", "wed", "thu", "fri"] });
  assert.deepEqual(normaliseWindowsTrigger({ type: "MSFT_TaskWeeklyTrigger", start: "2026-09-08T04:12:00+02:00", daysOfWeek: 127 }).days_of_week,
    ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
  assert.deepEqual(normaliseWindowsTrigger({ type: "MSFT_TaskTimeTrigger", start: "2026-10-12T12:00:00" }), { kind: "once", start_at: "2026-10-12T12:00" });
  assert.equal(normaliseWindowsTrigger({ type: "MSFT_TaskEventTrigger" }).kind, "other");
}

// ── the reported shape ──
{
  const reported = toReportedTask({
    path: "\\", name: "Old routine", description: "x", state: "Disabled", limit: "PT3H", wake: true,
    actions: [hidden("Routine.ps1")],
    triggers: [{ type: "MSFT_TaskDailyTrigger", start: "2026-09-16T08:07:00+02:00", daysInterval: 1, enabled: true },
      { type: "MSFT_TaskLogonTrigger", enabled: false }],
    lastRun: "2026-10-06T08:07:00.0000000+02:00", result: 2147946720, nextRun: null,
  });
  assert.equal(reported.key, "\\Old routine");
  assert.equal(reported.enabled, false);
  assert.equal(reported.state, "disabled");
  assert.equal(reported.triggers.length, 1, "a disabled trigger is dropped");
  assert.equal(reported.execution_limit_minutes, 180);
  assert.equal(reported.wake_to_run, true);
  assert.equal(reported.working_directory, "C:\\Work\\repo");
  assert.equal(reported.last_result_code, 2147946720);
  assert.ok(!JSON.stringify(reported).includes("s3cr3t"));
}

// ── arguments, token, path ──
{
  const args = parseAgentTaskArgs(["--match", "GA *", "--match", "SyncAgentSshAccess", "--always-on", "--dry-run", "--repo", "C:\\r"]);
  assert.deepEqual(args.match, ["GA *", "SyncAgentSshAccess"], "--match repeats");
  assert.equal(args.alwaysOn, true);
  assert.equal(args.dryRun, true);
  assert.equal(args.repo, "C:\\r");

  const dir = mkdtempSync(join(tmpdir(), "cs-agent-tasks-"));
  const credentials = join(dir, ".credentials.json");
  const later = Date.now() + 3600_000;
  writeFileSync(credentials, JSON.stringify({ mcpOAuth: {
    "castalie|a": { serverUrl: "https://acme.castalie.app/mcp", accessToken: "old", expiresAt: Date.now() + 60_000 },
    "castalie|b": { serverUrl: "https://acme.castalie.app/mcp", accessToken: "fresh", expiresAt: later },
    "castalie|c": { serverUrl: "https://other.castalie.app/mcp", accessToken: "elsewhere", expiresAt: later + 1 },
    "castalie|d": { serverUrl: "https://acme.castalie.app/mcp", accessToken: "expired", expiresAt: Date.now() - 1 },
  } }));
  assert.equal(storedOAuthToken("https://acme.castalie.app", credentials), "fresh", "the freshest token of exactly this server");
  assert.equal(storedOAuthToken("https://none.castalie.app", credentials), null);

  assert.equal(stableCliPath("C:\\nowhere\\cs\\bin\\cs.mjs"), "C:\\nowhere\\cs\\bin\\cs.mjs", "outside a plugin cache the running file is kept");
}

console.log("agent-tasks: all checks passed");
