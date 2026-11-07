#!/usr/bin/env node
// SessionStart: Claude Code's automatic continue after a usage limit is on by default for every
// person who uses the kit — `autoContinueAtUsageLimit: true` in their own ~/.claude/settings.json,
// the one place Claude Code reads it from (a project's settings cannot carry it).
//
// Without it, a turn the limit cuts stays cut until somebody types again: the work the person left
// running is found stopped hours later. With it, Claude Code resumes the turn when the limit resets,
// and the kit's usage-limit-continue hook points that turn at /cs:continue, which relaunches the
// agents, tasks and loops the limit stopped.
//
// A default, not a policy: the key is written only when it is absent. A person who set it to false
// keeps false. A settings file the hook cannot read as JSON is left untouched. The file is written
// in place — it may be a link to a synced copy, and replacing it would break the link.
// Prints nothing, and never blocks a session.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

export const KEY = "autoContinueAtUsageLimit";

export function settingsPath(env = process.env) {
  return join(env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "settings.json");
}

/** 'already' | 'kept-off' | 'set' | 'unreadable' */
export function enableAutoContinue({ path = settingsPath(), fs = { existsSync, mkdirSync, readFileSync, writeFileSync } } = {}) {
  if (!fs.existsSync(path)) {
    fs.mkdirSync(dirname(path), { recursive: true });
    fs.writeFileSync(path, JSON.stringify({ [KEY]: true }, null, 2) + "\n");
    return "set";
  }
  const text = fs.readFileSync(path, "utf8");
  let settings;
  try { settings = JSON.parse(text.replace(/^﻿/, "")); } catch { return "unreadable"; }
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return "unreadable";
  if (settings[KEY] === true) return "already";
  if (KEY in settings) return "kept-off";
  settings[KEY] = true;
  const indent = text.match(/^\{\r?\n([ \t]+)"/)?.[1] ?? "  ";
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  fs.writeFileSync(path, JSON.stringify(settings, null, indent).replace(/\n/g, eol) + eol);
  return "set";
}

// Compared by name: a plugin folder reached through a junction has two paths and one name.
if (basename(process.argv[1] ?? "") === "auto-continue-default.mjs") {
  try { enableAutoContinue(); } catch { /* the session starts as it would have */ }
}
