// The environment a child `claude` starts with, so that it runs on the workstation's Claude Code
// subscription and not on a per-call API.
//
// A key or a provider switch present in a child's environment wins over the subscription the
// workstation is signed in with: every call of a bench, a judge or an unattended run is then billed
// at API price, about forty times what the subscription costs for the same work
// (`instructions/shared-conventions.md` § Work you hand off). Every launcher of the kit that starts
// `claude` — or a command that may start one — passes this environment, never `process.env` as is.

/** The variables that send a child `claude` to a per-call API instead of the subscription. */
export const API_BILLING_VARIABLES = Object.freeze([
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
]);

const BILLING = new Set(API_BILLING_VARIABLES.map((name) => name.toUpperCase()));

/**
 * A copy of `env` (and of `extra` laid over it) without the variables above. Names are compared
 * ignoring case: Windows hands its environment over whatever the case it was written in.
 */
export function subscriptionEnv(env = process.env, extra = {}) {
  const out = {};
  for (const [name, value] of Object.entries({ ...env, ...extra })) {
    if (value === undefined || BILLING.has(name.toUpperCase())) continue;
    out[name] = value;
  }
  return out;
}
