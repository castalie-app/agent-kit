// cs prompt gate — a prompt stored in Castalie is screened by Jev before an unattended session plays it.
//
// A scheduled task's prompt (copied onto its run as `prompt_snapshot_md`) and a decision's robot
// resume (`resume_prompt_md`, played with the person's answer) were written elsewhere, by somebody
// else, and are played on this workstation with nobody watching. So before a session is launched on
// one — or before the session that holds one plays it — this reads the stored text from Castalie
// itself, verbatim, and puts it through `screenPrompt` (prompt-screen.mjs: Jev, fail closed).
//
//   cs prompt gate scheduled-run <run_id>         [--endpoint <url>] [--repo <dir>] [-- <command> <args...>]
//   cs prompt gate decision-resume <decision_id>  [--endpoint <url>] [--repo <dir>] [-- <command> <args...>]
//
// Refused → nothing is played, and the work item is closed by the verb its skill already uses for a
// failure: the run with `scheduled_task_run_complete` (failed, the Jev reasons in its notes); the
// decision with `decision_comment` (the reasons, on the sheet) then `decision_resume_complete`
// (failed), which leaves it answered and not applied, back at the top of its addressee's inbox.
//
// Exit code: 0 = pass (or, with `-- <command>`, the command's own exit code, the command being
// launched only on a pass); 2 = refused; 1 = the stored text could not be read, so nothing was
// screened, nothing was launched and nothing was closed. It prints one JSON object on stdout:
// { verdict, reasons, warnings, warning_md, closed, note_md, calls }. For these two kinds `outbound`
// and `off_purpose` only warn (prompt-screen.mjs, WARN_ONLY): a pass may carry `warning_md`, which
// the session quotes in the notes it closes with.

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { readConfigFrom, resolveToken } from "./agent-tasks.mjs";
import { resolveConnection } from "./auth.mjs";
import { bareEndpoint } from "./config.mjs";
import { callTool } from "./inbox.mjs";
import { screenPrompt } from "./prompt-screen.mjs";

/** The text a session would play, exactly as stored, with what the run or the answer adds to it. */
export function scheduledRunText(run) {
  const lines = [String(run?.prompt_snapshot_md ?? "")];
  if (run?.continuation_md) lines.push("", "Continuation of an earlier run:", String(run.continuation_md));
  return lines.join("\n");
}

export function decisionResumeText(decision) {
  const answer = decision?.answer || {};
  const lines = [String(decision?.resume_prompt_md ?? "")];
  const words = [answer.option_title, answer.text_md].filter((w) => typeof w === "string" && w.trim());
  if (words.length) lines.push("", "The person's answer, played as the instruction:", ...words);
  return lines.join("\n");
}

const reasonsLine = (reasons) => reasons.join(", ");

/** The warnings of a kind whose policy only warns on them (prompt-screen.mjs, WARN_ONLY). */
export const warningLine = (warnings) => `Jev warnings, which do not refuse this kind of prompt: ${warnings.join(", ")}.`;

/** What each gate reads, screens and closes. */
export const GATES = {
  "scheduled-run": {
    kind: "scheduled_task",
    read: async (mcp, id) => (await mcp("scheduled_task_run_get", { id }))?.run,
    message: (run) => ({
      kind: "scheduled_task",
      sender_label: run?.task?.id ? `scheduled task #${run.task.id}` : `scheduled task run #${run?.id}`,
      subject: run?.task?.title || "",
      body: scheduledRunText(run),
    }),
    noteMd: (reasons) => `Not played: Jev refused the prompt copied onto this run, before any session was launched on it `
      + `(cs prompt gate). Reasons: ${reasonsLine(reasons)}. A workspace owner reads the task's prompt and rewrites it, `
      + `or, when the screen was unavailable, gives this workstation its TypeSafe key. The next run is screened again.`,
    close: async (mcp, id, note) => {
      await mcp("scheduled_task_run_complete", { id, outcome: "failed", final_status: "failed", notes_md: note });
      return ["scheduled_task_run_complete"];
    },
  },
  "decision-resume": {
    kind: "decision_resume",
    read: async (mcp, id) => (await mcp("decision_get", { id }))?.decision,
    message: (decision) => ({
      kind: "decision_resume",
      sender_label: decision?.asked_by_agent ? `decision resume, asked by ${decision.asked_by_agent}` : "decision resume",
      subject: decision?.title || "",
      body: decisionResumeText(decision),
    }),
    noteMd: (reasons) => `Resume not played: Jev refused the resume prompt and its answer before an agent played them `
      + `(cs prompt gate). Reasons: ${reasonsLine(reasons)}. The answer stands and is not applied: its author rewrites `
      + `the resume prompt, or a person applies the answer by hand.`,
    close: async (mcp, id, note) => {
      const made = [];
      // The comment puts the reasons on the sheet a person reads. Castalie refuses it to a service
      // token and on some settled decisions: that refusal never keeps the resume from being closed.
      try {
        await mcp("decision_comment", { id, body_md: note.slice(0, 2000) });
        made.push("decision_comment");
      } catch { /* the resume's own close below carries the same note */ }
      await mcp("decision_resume_complete", { id, outcome: "failed", note_md: note });
      made.push("decision_resume_complete");
      return made;
    },
  },
};

/**
 * Reads the stored prompt, screens it, and closes the work item on a refusal. Never throws.
 *
 * @param {"scheduled-run"|"decision-resume"} target
 * @param {number} id
 * @param {{ mcp: (name: string, args: object) => Promise<any>, screen?: Function }} deps
 * @returns {Promise<{ verdict: "pass"|"refuse"|"unreadable", reasons: string[], closed: boolean, note_md: string|null, calls: string[] }>}
 */
export async function gate(target, id, deps) {
  const spec = GATES[target];
  if (!spec) return { verdict: "unreadable", reasons: [`unknown gate '${target}'`], closed: false, note_md: null, calls: [] };
  const { mcp, screen = (message) => screenPrompt(message) } = deps;

  let item;
  try {
    item = await spec.read(mcp, id);
    if (!item) throw new Error("not found");
  } catch (e) {
    return { verdict: "unreadable", reasons: [`could not read ${target} ${id}: ${e?.message || e}`], closed: false, note_md: null, calls: [] };
  }

  let result;
  try {
    result = await screen(spec.message(item));
  } catch (e) {
    result = { verdict: "refuse", reasons: [`Jev screening unavailable: ${e?.message || e}`] };
  }
  const warnings = Array.isArray(result?.warnings) ? result.warnings : [];
  if (result?.verdict === "pass") {
    // A pass with warnings is still a pass: the session plays the prompt and quotes this line in
    // the notes it closes the run or the resume with.
    const warning_md = warnings.length ? warningLine(warnings) : null;
    return { verdict: "pass", reasons: [], warnings, warning_md, closed: false, note_md: null, calls: [] };
  }

  const reasons = result?.reasons?.length ? result.reasons : ["Jev screening unavailable: no verdict"];
  const note = spec.noteMd(reasons) + (warnings.length ? ` ${warningLine(warnings)}` : "");
  try {
    const calls = await spec.close(mcp, id, note);
    return { verdict: "refuse", reasons, warnings, closed: true, note_md: note, calls };
  } catch (e) {
    return { verdict: "refuse", reasons, warnings, closed: false, note_md: note, calls: [], close_error: String(e?.message || e) };
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const dash = argv.indexOf("--");
  const own = dash === -1 ? argv : argv.slice(0, dash);
  const command = dash === -1 ? [] : argv.slice(dash + 1);
  const out = { _: [], command };
  for (let i = 0; i < own.length; i++) {
    const a = own[i];
    if (!a.startsWith("--")) { out._.push(a); continue; }
    const next = own[i + 1];
    out[a.slice(2)] = next === undefined || next.startsWith("--") ? true : (i++, next);
  }
  return out;
}

/** The connection `cs content` uses (environment, .cs/config.json, `cs login`), else Claude Code's own /mcp token. */
async function connect(args) {
  const repo = resolve(args.repo && args.repo !== true ? args.repo : process.cwd());
  const wanted = args.endpoint && args.endpoint !== true ? bareEndpoint(args.endpoint) : undefined;
  try {
    const { endpoint, token } = await resolveConnection({ cwd: repo, endpoint: wanted });
    return { endpoint, token, fetch: globalThis.fetch };
  } catch (e) {
    const config = readConfigFrom(repo);
    const endpoint = wanted || (process.env.CASTALIE_ENDPOINT ? bareEndpoint(process.env.CASTALIE_ENDPOINT) : null)
      || (config.endpoint ? bareEndpoint(config.endpoint) : null) || (e?.endpoint ? bareEndpoint(e.endpoint) : null);
    const token = endpoint ? resolveToken(endpoint, config) : null;
    if (!endpoint || !token) throw e;
    return { endpoint, token, fetch: globalThis.fetch };
  }
}

/** Runs the launcher's command without a shell, its output on this terminal; resolves with its exit code. */
export function runCommand([command, ...args]) {
  return new Promise((done) => {
    let child;
    try { child = spawn(command, args, { stdio: "inherit", windowsHide: true }); } catch (e) {
      console.error(`cs prompt gate: could not launch ${command}: ${e.message}`);
      done(1);
      return;
    }
    child.on("error", (e) => { console.error(`cs prompt gate: could not launch ${command}: ${e.message}`); done(1); });
    child.on("close", (code) => done(code ?? 1));
  });
}

export const HELP = `cs prompt gate — screen a prompt stored in Castalie before an unattended session plays it

  cs prompt gate scheduled-run <run_id>         [--endpoint <url>] [--repo <dir>] [-- <command> <args...>]
  cs prompt gate decision-resume <decision_id>  [--endpoint <url>] [--repo <dir>] [-- <command> <args...>]

Reads the run's prompt_snapshot_md (and continuation_md), or the decision's resume_prompt_md with the
person's answer, and screens it with Jev (cs prompt screen, fails closed). Refused: the run is closed
failed (scheduled_task_run_complete), the resume failed (decision_comment, decision_resume_complete),
and the command after -- is never launched. Prints { verdict, reasons, warnings, warning_md, closed,
note_md, calls }: outbound and off_purpose only warn for these two kinds; quote warning_md in the notes.
Exit 0 = pass (or the command's own exit code), 2 = refused, 1 = the stored prompt could not be read.`;

/** `cs prompt gate <target> <id>`: returns the exit code, never throws. */
export async function runCli(argv, deps = {}) {
  const args = parseArgs(argv);
  const [target, rawId] = args._;
  const id = Number(rawId);
  if (!GATES[target] || !Number.isInteger(id) || id <= 0) { console.log(HELP); return 1; }
  let mcp = deps.mcp;
  if (!mcp) {
    try {
      const connection = await connect(args);
      mcp = (name, params) => callTool(connection, name, params);
    } catch (e) {
      console.log(JSON.stringify({ verdict: "unreadable", reasons: [`no connection to Castalie: ${e?.message || e}`], closed: false, note_md: null, calls: [] }));
      return 1;
    }
  }
  const run = deps.run || runCommand;
  const outcome = await gate(target, id, { mcp, screen: deps.screen });
  // With a command to launch, its own stdout is what the launcher reads (a session's JSON output,
  // its cost): the gate's line goes to stderr so it never lands in front of it.
  const print = deps.print || (args.command.length ? (line) => console.error(line) : (line) => console.log(line));
  print(JSON.stringify(outcome));
  if (outcome.verdict === "unreadable") return 1;
  if (outcome.verdict !== "pass") return 2;
  return args.command.length ? run(args.command) : 0;
}
