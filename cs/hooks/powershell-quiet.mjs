#!/usr/bin/env node
// SessionStart, Windows only: the user variable POWERSHELL_UPDATECHECK=Off, so no PowerShell
// started for this person shows the « new version available » notice.
//
// On 20 October 2026 PowerShell 7.6.6 laid that notice out in a Windows Terminal tab still too
// narrow for it and crashed (`totalWidth ('-19') must be a non-negative value`, in
// ShowUpdateNotification) — every tab a launcher opened for Claude died before Claude started,
// on every project of that machine. Set here, at each session start, the variable reaches every
// workstation the kit runs on with its next update, without anybody running setup again; setup
// sets it too, for a machine's very first install.
//
// Costs nothing once set: Claude Code's own environment already carries it. Prints nothing, and
// never blocks a session.
import { spawnSync } from "node:child_process";
import { basename } from "node:path";

export const VARIABLE = "POWERSHELL_UPDATECHECK";

const isOff = (value) => String(value ?? "").trim().toLowerCase() === "off";

/** 'not-windows' | 'already' | 'set' | 'failed' */
export function quietPowerShell({ platform = process.platform, env = process.env, run = spawnSync } = {}) {
  if (platform !== "win32") return "not-windows";
  if (isOff(env[VARIABLE])) return "already";
  const options = { encoding: "utf8", windowsHide: true, timeout: 4_000 };
  // A process started before the variable was set does not carry it: the registry says what is set.
  const query = run("reg", ["query", "HKCU\\Environment", "/v", VARIABLE], options);
  const line = String(query?.stdout ?? "").split(/\r?\n/).find((l) => l.includes(VARIABLE));
  if (query?.status === 0 && line && isOff(line.trim().split(/\s+/).pop())) return "already";
  // setx and not `reg add`: it tells the running shell and terminals that the environment changed.
  const set = run("setx", [VARIABLE, "Off"], options);
  return set?.status === 0 ? "set" : "failed";
}

// Compared by name: a plugin folder reached through a junction has two paths and one name.
if (basename(process.argv[1] ?? "") === "powershell-quiet.mjs") {
  try { quietPowerShell(); } catch { /* the session starts as it would have */ }
}
