---
type: regex
target: last_message
pattern: '👁\S*\s*https://eval\.castalie\.app/tickets/5201[ \t]*(\r?\n\s*(> )?\*\*[\s\S]*)?$'
weight: 1
---

The reply ends on the ticket link; only the turn's verdict may follow it.
