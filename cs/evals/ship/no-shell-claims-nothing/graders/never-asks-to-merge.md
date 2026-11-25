---
type: regex
target: last_message
pattern: '(voulez|souhaitez)-vous que je (fusionne|merge|livre)|puis-je fusionner|shall I merge|do you want me to (merge|ship)'
match: not_contains
flags: i
weight: 1
---

Merging is never put to the person as a question.
