# Field-set files — version 1

CODEX, 2026-10-29 · D-043 / D-044. The Library Assistant is not implemented yet. This format can already be written by a person or an AI and imported through **Library → Trackers → a tracker → Import…** (the quiet links at the end of the set bar). Review the draft, then Save. **For another AI, hand it [FIELD-SET-AI-GUIDE.md](FIELD-SET-AI-GUIDE.md)** — the app saves the same file from the set bar's **AI guide** link (D-046).

**Export…** saves the set chosen in the set picker, complete: name, description, schema revision, character scope, presence rule and every field, including nested fields, instructions, sections and presentation settings. On the Windows app a "Save as" window asks where (D-046); where the system offers none (Linux) it goes to Downloads and the notice gives the path. Daniel confirmed that the file should use the Homunculus 2 format; interoperability with the original app is not claimed.

Files contain set definitions only. They contain no tracker agent, tracker-level prompt, connection, chat history or saved values. Import appends new sets with fresh IDs to the tracker being edited. Existing sets and the default selection remain intact; duplicate names receive a numeric suffix. Import still accepts multi-set bundles. Export also works before Save and normalizes temporary keys as Save would.

The envelope is `{ "format": "homunculus-field-sets", "version": 1, "sets": [...] }`. Each set has a nonempty `name`, a nonempty `fields` array, optional `help`, `version` (schema revision, default 1), `characters` (`cast`, `castAndUser`, `anyone`; default `cast`), and optional `presence`. Do not include database `id` or `trackerId`.

Every field requires `key`, `label` and `type`. A key starts with an English letter, followed by letters, digits, `_` or `-`. Keys must be unique among siblings, including list columns and group children. Keep existing keys when revising a set: labels and sections can change without changing saved values. Never rename a conflicting key automatically during a transfer.

| Field property | Allowed values / default |
|---|---|
| `type` | `text`, `number`, `meter`, `status`, `list`, `datetime`, `group` |
| `help` | Instructions explaining what the field means; default empty |
| `options` | Nonempty strings for a status; at least one required for status |
| `min`, `max` | Optional numbers; minimum must be below maximum when both are supplied |
| `scope` | `global` (default), `perCharacter`, `perPair` |
| `section` | Display/prompt group name; default empty |
| `fields` | Children for a group, columns for a list; default empty |
| `lockedForAgents` | Boolean, default false; only the user can change the value when true |
| `toPrompt` | Boolean, default true |
| `required` | Boolean, default false |
| `display` | `auto`, `header`, `subtitle`, `lead`, `pill`, `line`, `tile`, `block`, `note` |
| `icon`, `color` | Optional presentation hints, using the app's icon names and CSS colors |

`presence`, when used, is `{ "field": "presence", "value": "here" }`: its field must be a top-level per-character status, and the value must be one of its options. Omit it for sets that do not track presence. Unknown envelope/set properties and unsupported file versions are rejected. Field data is validated with the existing TrackerField schema; unsupported field properties are not retained. The entire file must validate before any set is appended.

## Instructions for an AI

See [FIELD-SET-AI-GUIDE.md](FIELD-SET-AI-GUIDE.md): a self-contained guide written for another AI, with every property, a complete example (checked by a unit test) and a checklist. The [travel example](examples/travel-field-sets.json) shows nested inventory columns, presence and two sets that share a stable key.

## Send to another set (D-046)

Each field row and each group heading has a quiet **send** icon (shown on hover or keyboard focus). Its menu lists the tracker's other sets, each with **Copy** and **Move**, plus **A new set**. A group sends all its fields; a list/group field travels with its children and presentation settings. Fields the destination already has (same key) are shown as "already there" and stay where they are — keys are never renamed. Move is disabled when it would empty the set. A transferred presence field also carries its rule if the destination has none; Move removes that rule from the source. One quiet line under the set bar says what happened, with **Undo** until another definition change or Save. These operations change definitions only; saved chat values and old messages are never rewritten. Fields sharing the same key within a tracker continue to share their existing value when a chat switches sets.

Signed: **CODEX** (D-043/D-044); revised by **CLAUDE** (D-046).
