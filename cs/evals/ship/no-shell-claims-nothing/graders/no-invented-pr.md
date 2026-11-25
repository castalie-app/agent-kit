---
type: regex
target: last_message
pattern: 'github\.com/[^\s)]+/pull/\d+'
match: not_contains
weight: 1
---

No pull-request address is invented.
