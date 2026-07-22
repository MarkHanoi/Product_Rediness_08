<!-- P0 SCAFFOLD TEMPLATE — copy with the folder, replace every <PLACEHOLDER>, delete this comment.
     THE HUMAN SIGN-OFF (playbook §3.4, L-449 A2). Draft → published is a HUMAN act.
     No pack ships confidence:'structured' without this file complete. -->
# <PLACE> (<CODE>) — human verification sign-off

**Verifier:** <NAME> · **Date:** <DATE> · **Pack version / commit:** <…>

## What was checked, against which document version
| Field | Verified against (doc + version/date) | Method (viewer / PDF read / endpoint response) | Verdict |
|---|---|---|---|
| `<pack.field>` | `<doc, date>` | `<…>` | ✅ confirmed / ⚠ caveat / ❌ could not confirm |

## What I could NOT confirm (and why it stays unshippable)
- <field> — <the exact reason: robots-disallowed / behind authenticated certificate / scan-only / …>.

## Caveats that must remain visible in the product
- <e.g. "not the municipality's own copy — source named", "2008 modification not reflected", …>.

**Sign-off:** this pack may ship the §A fields of `SOURCES.md` at the stated confidence; every other
field remains `null` and refuses. — <NAME>, <DATE>.
