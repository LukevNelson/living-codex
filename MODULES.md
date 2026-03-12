# The Living Codex — Modular System Description

> *Each module is self-contained. It has a defined purpose, a declared interface, explicit dependencies, and documented outputs. A developer can implement any single module independently, swap it for an alternative, or extend it without touching adjacent modules.*

---

## Module Index

| # | Module | Role | Depends On |
|---|--------|------|------------|
| M01 | [Inventory Bridge](#m01--inventory-bridge) | Links item possession to investigation state | Knowledge Tier Engine |
| M02 | [Gate System](#m02--gate-system) | Controls path opens and mutual exclusions | Source Type System |
| M03 | [Contested State](#m03--contested-state) | Tracks misinfo, manages revision, withholds resolution | Source Type System, Reconstruction Engine |
| M04 | [Journal Engine](#m04--journal-engine) | Groups, filters, searches, and renders all investigations | All item state, Abandonment System |
| M05 | [Evidence Board](#m05--evidence-board) | Visual overview of all investigations as pinned cards | Knowledge Tier Engine, Journal Engine |
| M06 | [Reconstruction Engine](#m06--reconstruction-engine) | Triggers and renders the narrative payoff at KNW 4 | Knowledge Tier Engine, Contested State |

---

## Module Template

Every module entry in this document follows the same structure:

```
PURPOSE       — what this module does and why it exists
NARRATIVE ROLE — what it means in the game world
INTERFACE     — public functions the module exposes
INPUTS        — what data it receives
OUTPUTS       — what data it produces or modifies
DEPENDENCIES  — what other modules or data it requires
STATE SHAPE   — what it adds to the global state object
IMPLEMENTATION — key code with inline comments
EXTENSION     — how to add new behaviour without breaking existing
KNOWN LIMITS  — what this module deliberately does not handle
```

---

## M01 — Inventory Bridge

### Purpose

The Inventory Bridge is the module responsible for the relationship between physical item possession and intellectual investigation state. It ensures that picking up an item automatically opens a codex investigation, that the item's displayed name reflects the player's current knowledge level, and that dropping or selling an item archives the investigation without destroying it.

The bridge is the reason the inventory and the codex are linked but separate. It does not merge them into a single interface. It connects them through a defined set of trigger events so that each surface can remain focused on its own purpose while always reflecting the same underlying state.

### Narrative Role

In most games, the inventory is a container. You put things in it. They stay there with fixed properties until you take them out or discard them.

In The Living Codex, the inventory is a surface that reflects what the player currently understands about what they carry. An item's name is not a property of the item. It is a property of the relationship between the item and the player's investigation of it. The inventory makes that relationship visible at a glance — through the item's current name, its knowledge bar, and its classification.

When a player drops an item, they are not just removing it from a slot. They are setting aside an open investigation. The bridge ensures the codex records that moment with the same fidelity it records a deliberate abandonment.

### Interface

```javascript
InventoryBridge.onPickup(itemId)
// Called when the player acquires an item.
// Creates codex entry at KNW 0. Fires ITEM_ACQUIRED event.
// Returns: { itemId, codexEntryCreated: boolean }

InventoryBridge.onDrop(itemId, reason)
// Called when the player drops, sells, gives, or destroys an item.
// Archives the codex investigation with the given reason.
// Returns: { itemId, archiveReason, knowledgePreserved: number }

InventoryBridge.onReacquire(itemId)
// Called when a previously held item is picked up again.
// Reopens the archived investigation. Adds memory trace to log.
// Returns: { itemId, priorKnowledge: number, logLength: number }

InventoryBridge.getDisplayName(itemId)
// Returns the item's current name based on investigation knowledge level.
// Used by inventory render to show the correct tier name.
// Returns: string

InventoryBridge.getKnowledgeIndicator(itemId)
// Returns a 0–4 integer for rendering the inventory knowledge bar.
// Returns: number
```

### Inputs

| Input | Type | Source |
|-------|------|--------|
| `itemId` | string | Unreal Blueprint, player action, or manual registration |
| `reason` | `'dropped' \| 'sold' \| 'given' \| 'destroyed'` | Game event context |
| `ITEM_TEMPLATES[itemId]` | object | Static item definition |
| `S.items[itemId]` | object | Global investigation state |

### Outputs

| Output | Effect |
|--------|--------|
| New codex entry at KNW 0 | Item enters the journal as an Active investigation |
| `ITEM_ACQUIRED` API event | Backend notified. Web codex updates live. |
| Archived investigation | Prior knowledge preserved. Memory trace added to log. |
| Updated display name | Inventory shows tier-appropriate name immediately. |

### Dependencies

- **Knowledge Tier Engine** — to resolve the display name from the current KNW level
- **Global state `S.items`** — to create, update, and read investigation state
- **Storage layer** — to persist the change

### State Shape

```javascript
// Entry created by InventoryBridge.onPickup():
S.items[itemId] = {
  knowledge:     0,
  status:        'active',       // 'active' | 'archived' | 'echoing'
  entryType:     'physical',
  usedSources:   [],
  lockedSources: [],
  log:           [{ src:'Found', txt:'Item acquired.', timestamp }],
  note:          '',
  contested:     false,
  gatesOpened:   [],
  gatesClosed:   [],
  abandonment:   null,
}

// Memory trace added by InventoryBridge.onReacquire():
S.items[itemId].log.unshift({
  src:     'System',
  txt:     '[REACQUIRED] Prior investigation at KNW N preserved.',
  isTrace: true,
})
```

### Implementation

```javascript
function onPickup(itemId) {
  // Guard: item already in state means reacquire, not new entry
  if (S.items[itemId]) {
    return onReacquire(itemId);
  }

  // Create fresh investigation state
  S.items[itemId] = makeItemState({
    entryType: 'physical',
    log: [{ src:'Found', txt:'Item acquired.' }],
  });

  // Fire backend event (Unreal does this via Blueprint HTTP node)
  postEvent({
    event:     'ITEM_ACQUIRED',
    item_id:   itemId,
    new_level: 0,
  });

  saveState();
  render();
}

function onDrop(itemId, reason) {
  const s = S.items[itemId];
  if (!s) return;

  // Archive rather than delete — knowledge is preserved
  s.status = 'archived';
  s.abandonment = {
    category: 'item_no_longer_held',
    reason:   reason,
    note:     `Item ${reason}. Investigation suspended.`,
  };
  s.log.push({
    src:     'System',
    txt:     `[ARCHIVED — item ${reason}] Knowledge preserved at KNW ${s.knowledge}.`,
    isTrace: true,
  });

  postEvent({ event:'ITEM_REMOVED', item_id:itemId, reason });
  saveState();
  render();
}

function onReacquire(itemId) {
  const s = S.items[itemId];
  if (!s) return onPickup(itemId);

  // Reopen and add memory trace
  s.status      = 'active';
  s.abandonment = null;
  s.log.unshift({
    src:     'System',
    txt:     `[REACQUIRED] Prior investigation at KNW ${s.knowledge} preserved.`,
    isTrace: true,
  });

  postEvent({ event:'ITEM_REACQUIRED', item_id:itemId, prior_level:s.knowledge });
  saveState();
  render();
}

function getDisplayName(itemId) {
  const s    = S.items[itemId];
  const tmpl = getTemplate(itemId);
  if (!s || !tmpl) return 'Unknown Object';
  return tmpl.names[Math.min(s.knowledge, 4)];
}

function getKnowledgeIndicator(itemId) {
  return S.items[itemId]?.knowledge ?? 0;
}
```

### Extension

To support item degradation (an item that loses investigation progress when damaged):

```javascript
function onDegrade(itemId, levelsLost) {
  const s = S.items[itemId];
  if (!s) return;
  const prev    = s.knowledge;
  s.knowledge   = Math.max(0, s.knowledge - levelsLost);
  s.log.push({
    src:     'System',
    txt:     `[DEGRADED] KNW reduced from ${prev} to ${s.knowledge}.`,
    isTrace: true,
  });
  saveState(); render();
}
```

### Known Limits

- Does not manage inventory weight, slot constraints, or equip states — those belong to the game's inventory system
- Does not handle item stacking — each unique item maps to one investigation
- Environmental Echo entries (discovery before possession) are created separately and linked to this module's state after the fact

---

## M02 — Gate System

### Purpose

The Gate System manages the consequence of investigation choices. Every discovery source can declare which sources it opens and which it permanently closes. Mutual exclusion conflicts — where choosing one path locks another — are declared in a separate conflict table and fire automatically when their trigger source is used.

Gates are not hidden from the player. Every gate event is recorded in the item's state, displayed in the investigation view's gate history panel, and visible in the expanded journal entry. Closed paths are acknowledged with a reason, not silently removed.

### Narrative Role

The Gate System is the module that makes investigation choices feel real. In a world without gates, every source is always available regardless of what the player has done. Investigation has no cost and no consequence. A player can consult the Scholar and the Cultist on the same afternoon without friction.

With gates, choosing to align with the Scholar Guild marks the player to the Cult. The Elder will not speak with someone she considers an institutional enemy. This is not a punishment. It is the world behaving consistently. The gate is the mechanical expression of a narrative truth the world has already established.

Gates also create replay value. A player who completed the Scholar path knows that the Cultist path exists and was closed. That knowledge creates curiosity. A second playthrough with different choices produces a different investigation record — and a different understanding of the same item.

### Interface

```javascript
GateSystem.applyGates(sourceId, itemId)
// Called when a source is successfully fired.
// Applies all gate opens and checks for mutual exclusion conflicts.
// Mutates S.items[itemId].gatesOpened and gatesClosed.
// Returns: { opened: string[], closed: GateClosureRecord[] }

GateSystem.isLocked(sourceId, itemId)
// Returns true if the source has been locked by a prior gate conflict.
// Used by sourceAvailability() to determine button state.
// Returns: boolean

GateSystem.getHistory(itemId)
// Returns the full gate history for an item.
// Used by render functions for the gate log panel and journal entry.
// Returns: { opened: string[], closed: GateClosureRecord[] }
```

### Inputs

| Input | Type | Source |
|-------|------|--------|
| `sourceId` | string | The source just fired |
| `itemId` | string | The active investigation |
| `SOURCES[sourceId].gateOpens` | string[] | Static source definition |
| `GATE_CONFLICTS` | array | Static conflict table |
| `S.items[itemId].lockedSources` | string[] | Mutable investigation state |

### Outputs

| Output | Effect |
|--------|--------|
| `S.items[itemId].gatesOpened` | Updated with newly opened source IDs |
| `S.items[itemId].gatesClosed` | Updated with closure records including reason and permanence |
| `S.items[itemId].lockedSources` | Source IDs added to prevent future use |

### Dependencies

- **Global state `S.items`** — reads and writes gate history
- **`SOURCES` data** — reads `gateOpens` per source
- **`GATE_CONFLICTS` data** — reads mutual exclusion definitions

### State Shape

```javascript
// GateClosureRecord added to S.items[itemId].gatesClosed:
{
  id:        string,   // source ID that was closed
  reason:    string,   // human-readable explanation shown in UI
  permanent: boolean,  // true = cannot be reopened in this investigation
  triggeredBy: string, // source ID that caused the closure
  timestamp: string,
}

// Full gate state on item:
S.items[itemId].gatesOpened  = ['tome', 'bound_vampire']
S.items[itemId].gatesClosed  = [
  {
    id:          'cultist',
    reason:      'Aligning with the Scholar Guild marks you to the Cult.',
    permanent:   true,
    triggeredBy: 'scholar',
  }
]
S.items[itemId].lockedSources = ['cultist']
```

### Implementation

```javascript
// Static conflict table — add new conflicts here only
const GATE_CONFLICTS = [
  {
    trigger:   'scholar',
    locks:     ['cultist'],
    permanent: true,
    reason:    'Aligning with the Scholar Guild marks you to the Cult. Elder Serath will not speak with you.',
  },
  {
    trigger:   'cultist',
    locks:     ['scholar'],
    permanent: true,
    reason:    'The Cult considers the Guild an adversary. The Scholar will not assist you further.',
  },
];

function applyGates(sourceId, itemId) {
  const s   = S.items[itemId];
  const src = SOURCES.find(x => x.id === sourceId);
  if (!s || !src) return { opened:[], closed:[] };

  const opened = [];
  const closed = [];

  // 1. Apply gate opens declared on the source
  (src.gateOpens || []).forEach(gid => {
    if (!s.gatesOpened.includes(gid)) {
      s.gatesOpened.push(gid);
      opened.push(gid);
    }
  });

  // 2. Check mutual exclusion conflicts
  GATE_CONFLICTS
    .filter(c => c.trigger === sourceId)
    .forEach(conflict => {
      conflict.locks.forEach(lockId => {
        if (!s.lockedSources.includes(lockId)) {
          s.lockedSources.push(lockId);
          const record = {
            id:          lockId,
            reason:      conflict.reason,
            permanent:   conflict.permanent,
            triggeredBy: sourceId,
            timestamp:   new Date().toISOString(),
          };
          s.gatesClosed.push(record);
          closed.push(record);
        }
      });
    });

  return { opened, closed };
}

function isLocked(sourceId, itemId) {
  return S.items[itemId]?.lockedSources.includes(sourceId) ?? false;
}

function getHistory(itemId) {
  const s = S.items[itemId];
  if (!s) return { opened:[], closed:[] };
  return { opened: s.gatesOpened, closed: s.gatesClosed };
}
```

### Extension

To add a timed gate (closes after N in-game days):

```javascript
// Add to GATE_CONFLICTS:
{
  trigger:   'cult_meeting_location',
  locks:     ['cult_meeting'],
  permanent: false,
  expiresAfterDays: 7,
  reason:    'The meeting window has passed.',
}

// Check in sourceAvailability():
if (conflict.expiresAfterDays && daysSinceTrigger > conflict.expiresAfterDays) {
  applyGates(conflict.trigger, itemId);
}
```

### Known Limits

- Gates are per-item. A gate event in one investigation does not affect sources in another investigation, even if the same source IDs are involved
- Does not model faction reputation recovery — soft locks that can be reopened require a reputation system outside this module
- Gate conflicts are declared statically. Runtime-generated conflicts (e.g., emergent from player behaviour) require extending the conflict table at runtime

---

## M03 — Contested State

### Purpose

The Contested State module manages the lifecycle of uncertain knowledge. It is set when a misinfo source is used, tracks the conflict until a revision source resolves it, and withholds clean resolution from the Reconstruction Engine until the contest is cleared.

This module is responsible for two visual signals — the amber knowledge bar and the contested banner — and for one mechanical restriction: a contested investigation cannot trigger a reconstruction event regardless of knowledge level.

### Narrative Role

The Contested State is the module that makes the system honest about the unreliability of information. Without it, all sources are mechanically equivalent regardless of their declared type. A rumour and a primary source produce the same codex entry. Investigation becomes collection.

With the Contested State active, the player holds knowledge that has been questioned. The bar shows amber instead of the tier's characteristic colour. The banner says plainly: one of your sources was wrong. You know what you know — but you don't know if what you know is true.

This is not a punishment. It is accuracy. Most knowledge in a real investigation arrives through sources with incomplete information, biased perspectives, or active incentives to mislead. The module models that reality and asks the player to respond to it by seeking correction rather than accumulating sources indiscriminately.

### Interface

```javascript
ContestedState.set(itemId)
// Marks the investigation as contested.
// Called by fireDiscovery() when a misinfo source fires.
// Returns: void

ContestedState.clear(itemId)
// Clears the contested flag after a revision source fires.
// Called by fireDiscovery() when a revision source fires.
// Returns: void

ContestedState.isContested(itemId)
// Returns true if the investigation currently holds contested knowledge.
// Used by Reconstruction Engine to gate the payoff.
// Used by render functions to determine bar colour and banner visibility.
// Returns: boolean

ContestedState.getBarStyle(itemId)
// Returns CSS background gradient string for the knowledge bar.
// Amber if contested, tier colour if not.
// Returns: string

ContestedState.canResolve(itemId)
// Returns true only if KNW >= 4 AND contested is false.
// Used by Reconstruction Engine as the sole resolution gate.
// Returns: boolean
```

### Inputs

| Input | Type | Source |
|-------|------|--------|
| `itemId` | string | Active investigation |
| `S.items[itemId].contested` | boolean | Global state |
| `S.items[itemId].knowledge` | number | Global state |
| `TIERS[knowledge].fill` | string | Knowledge Tier Engine |

### Outputs

| Output | Effect |
|--------|--------|
| `S.items[itemId].contested = true` | Bar turns amber. Banner appears. Badge added. |
| `S.items[itemId].contested = false` | Bar returns to tier colour. Banner removed. |
| `canResolve()` returning false | Reconstruction Engine blocked. |

### Dependencies

- **Source Type System** — misinfo sources trigger `set()`, revision sources trigger `clear()`
- **Knowledge Tier Engine** — provides tier fill colour for `getBarStyle()`
- **Reconstruction Engine** — reads `canResolve()` before firing

### State Shape

```javascript
// On item state:
S.items[itemId].contested = boolean

// Log entries written by this module (via fireDiscovery):
{ src: sourceName, txt: logText, isMisinfo:  true }  // amber in log
{ src: sourceName, txt: logText, isRevision: true }  // green in log
```

### Implementation

```javascript
function set(itemId) {
  if (S.items[itemId]) S.items[itemId].contested = true;
}

function clear(itemId) {
  if (S.items[itemId]) S.items[itemId].contested = false;
}

function isContested(itemId) {
  return S.items[itemId]?.contested ?? false;
}

function getBarStyle(itemId) {
  const s    = S.items[itemId];
  const tier = TIERS[Math.min(s?.knowledge ?? 0, 4)];
  if (!s) return '';
  return s.contested
    ? 'linear-gradient(90deg, rgba(184,136,48,.5), var(--amber))'
    : `linear-gradient(90deg, ${tier.fill}88, ${tier.fill})`;
}

function canResolve(itemId) {
  const s = S.items[itemId];
  if (!s) return false;
  return s.knowledge >= 4 && !s.contested;
}

// Called from fireDiscovery() — not directly:
function handleMisinfo(itemId, src) {
  const s    = S.items[itemId];
  const prev = Math.min(4, Math.max(0, Math.round(s.knowledge)));
  s.knowledge = Math.min(4, prev + 1);
  set(itemId);  // <-- this module
  s.usedSources.push(src.id);
  s.log.push({
    src:      src.label,
    txt:      SOURCE_LOGS[src.id]?.[0] ?? src.label,
    isMisinfo: true,
  });
}

function handleRevision(itemId, src) {
  // gain: 0 — knowledge level unchanged
  clear(itemId);  // <-- this module
  S.items[itemId].usedSources.push(src.id);
  S.items[itemId].log.push({
    src:        src.label,
    txt:        SOURCE_LOGS[src.id]?.[0] ?? src.label,
    isRevision: true,
  });
}
```

### Contested at KNW 4 — Specific Behaviour

```javascript
// A player reaches KNW 4 through misinfo without revision:
S.items['dagger'] = { knowledge: 4, contested: true, ... }

// canResolve() returns false
// Reconstruction Engine does NOT fire
// UI shows:
//   - Knowledge bar: full width, amber colour
//   - Tier badge: "True Understanding"
//   - Status badge: "⚠ Contested"
//   - Banner: "You believe you understand this fully.
//              But one of your sources was wrong.
//              True understanding requires accurate knowledge,
//              not just complete knowledge."
//   - NO reconstruction event
//   - NO investigation complete notice
```

### Extension

To support partial correction (one misinfo cleared, another remains):

```javascript
// Replace contested: boolean with contested: string[] (array of source IDs)
S.items[itemId].contested = ['hunter', 'rumour_keeper']

// clear() removes one source ID:
function clear(itemId, sourceId) {
  const s = S.items[itemId];
  s.contested = s.contested.filter(id => id !== sourceId);
}

// isContested() returns true if array is non-empty:
function isContested(itemId) {
  return S.items[itemId]?.contested?.length > 0;
}
```

### Known Limits

- Tracks only whether knowledge is contested, not which specific claim is wrong
- Does not model partial revision — in the current implementation, one revision source clears all contested knowledge for that item
- Misinfo from one investigation does not propagate contested state to related investigations

---

## M04 — Journal Engine

### Purpose

The Journal Engine renders the complete investigation record as a browsable, filterable, searchable document. It reads from the global state, groups investigations by computed status, applies active filter and search criteria, and builds an expandable card for each investigation containing its full history.

The Journal Engine does not own any state. It is a pure render module — it reads, transforms, and displays. All state mutations happen through the action functions (reset, abandon, reopen) which call saveState() and render() after completing.

### Narrative Role

The journal is where the shape of the entire investigation becomes visible at once. Not one item at a time, as in the investigation view, but all of them together — grouped by their current status, with the full weight of every choice the player made visible in each expanded card.

At the end of a playthrough, the journal is a document that belongs to the player. It reflects how they investigated, what they trusted, what they chose to stop pursuing, and why. It does not evaluate any of this. It simply holds it accurately, with the same fidelity for an archived Protective Halt as for a cleanly resolved KNW 4.

The Journal Engine makes that document readable.

### Interface

```javascript
JournalEngine.render()
// Full render of the journal tab.
// Reads S.journalFilter and S.journalSearch.
// Builds grouped card layout into #journal-entries.
// Returns: void

JournalEngine.setFilter(status)
// Updates S.journalFilter and re-renders.
// status: 'all' | 'active' | 'contested' | 'resolved' | 'archived' | 'echoing'
// Returns: void

JournalEngine.setSearch(query)
// Updates S.journalSearch and re-renders.
// Highlights matching text within rendered card content.
// Returns: void

JournalEngine.toggleCard(itemId)
// Expands or collapses the card body for a given item.
// Does not re-render — manipulates DOM directly for performance.
// Returns: void

JournalEngine.computeStatus(itemId)
// Returns the derived status for an item based on its current state.
// Pure function — reads state, returns string, mutates nothing.
// Returns: 'active' | 'contested' | 'resolved' | 'archived' | 'echoing'
```

### Inputs

| Input | Type | Source |
|-------|------|--------|
| `S.items` | object | Global state — all investigation records |
| `S.journalFilter` | string | Tab filter button state |
| `S.journalSearch` | string | Search input value |
| `ITEM_TEMPLATES` | object | Item display data |
| `TIERS` | array | Knowledge tier colours |

### Outputs

| Output | Effect |
|--------|--------|
| DOM: `#journal-entries` | Complete grouped card layout rendered |
| DOM: card expand/collapse | Individual card body shown or hidden |
| `S.journalFilter` | Updated when filter button clicked |
| `S.journalSearch` | Updated when search input changes |

### Dependencies

- **Knowledge Tier Engine** — `computeStatus()` reads knowledge and contested flag
- **Contested State** — `computeStatus()` uses contested flag to distinguish active from contested
- **All item state** — reads log, gates, notes, abandonment, reconstruction
- **`ITEM_TEMPLATES`** — reads names, descriptions, reconstruction text

### State Shape

```javascript
// Journal-specific state on S:
S.journalFilter = 'all'   // current filter
S.journalSearch = ''      // current search query

// Journal does not add state to items — it reads existing item state
```

### Status Computation

```javascript
function computeStatus(itemId) {
  const s = S.items[itemId];
  if (!s) return 'active';

  // Explicit archived/echoing status set by Abandonment System
  if (s.status === 'archived') return 'archived';
  if (s.status === 'echoing')  return 'echoing';

  // Derive from knowledge + contested flag
  if (s.knowledge >= 4 && !s.contested) return 'resolved';
  if (s.contested)                       return 'contested';
  return 'active';
}
```

### Card Anatomy (Expanded)

```
┌──────────────────────────────────────────────────────┐
│ 🗡️  Blood Oath Ritual Weapon          [ ✓ Resolved ] │
│     ████████████████████  KNW 4/4  · 6 sources      │
│     Last: "It is a leash." — Cultist          [ － ] │
├──────────────────────────────────────────────────────┤
│ DISCOVERY LOG                                        │
│   [ Inspect Item ] Symbols along the fuller          │
│ ⚠ [ Hunter ] "Kills vampires. Seen it myself."       │
│ ↻ [ Scholar ] "It binds, not kills. Very different." │
│   [ Ritual Altar ] Hums near the stone.              │
│   [ Forbidden Tome ] Contract in living metal.       │
│   [ Cultist ] "It is a leash."                       │
│ ★ [ Bound Vampire ] "I chose this."                  │
│                                                      │
│ GATE HISTORY                                         │
│ 🔓 Opened: tome (via altar)                          │
│ 🔒 Closed: cultist (permanent) — Scholar alignment   │
│                                                      │
│ RECONSTRUCTION                                       │
│ "A hooded figure presses the blade against a         │
│  vampire's open palm — not to wound, but to seal…"  │
│                                                      │
│ PLAYER NOTES                                         │
│ "She paused before answering. Has seen it before."   │
│                                                      │
│ [ ⚔ Investigate ]  [ ↺ Reset ]  [ ⊘ Archive ]       │
└──────────────────────────────────────────────────────┘
```

### Implementation (Core)

```javascript
function render() {
  const el     = document.getElementById('journal-entries');
  const filter = S.journalFilter || 'all';
  const search = (S.journalSearch || '').toLowerCase().trim();

  // Group by status
  const groups = { active:[], contested:[], resolved:[], archived:[], echoing:[] };
  Object.entries(S.items).forEach(([id, s]) => {
    const status = computeStatus(id);
    if (filter !== 'all' && filter !== status) return;
    if (search) {
      const tmpl   = getTemplate(id);
      const needle = [
        tmpl.names[s.knowledge],
        ...s.log.map(l => l.txt),
        s.note,
      ].join(' ').toLowerCase();
      if (!needle.includes(search)) return;
    }
    groups[status]?.push({ id, s, status });
  });

  // Render groups in fixed order
  const order  = ['active','contested','resolved','archived','echoing'];
  const labels = {
    active:    'Active Investigations',
    contested: 'Contested — Accuracy Uncertain',
    resolved:  'Resolved — Truth Established',
    archived:  'Archived — Investigation Closed',
    echoing:   'Echoing — Source Not Yet Found',
  };

  el.innerHTML = '';
  order.forEach(status => {
    const list = groups[status];
    if (!list.length) return;
    const group = document.createElement('div');
    group.className = 'journal-group';
    group.innerHTML = `<div class="journal-group-label">
      ${labels[status]} <span class="group-count">(${list.length})</span>
    </div>`;
    list.forEach(({ id, s, status }) =>
      group.appendChild(buildCard(id, s, status, search))
    );
    el.appendChild(group);
  });
}

function toggleCard(itemId) {
  const body = document.getElementById(`jbody-${itemId}`);
  const btn  = document.querySelector(`.j-expand[data-expand="${itemId}"]`);
  if (!body) return;
  const open = body.classList.toggle('open');
  if (btn) btn.textContent = open ? '－' : '＋';
}
```

### Extension

To add a new journal view mode (e.g., sort by last activity date):

```javascript
// Add sort control to toolbar HTML
// Add S.journalSort to state: 'status' | 'recent' | 'knowledge'
// In render(), sort each group's list before building cards:
if (S.journalSort === 'recent') {
  list.sort((a,b) => (b.s.log.at(-1)?.timestamp||0) > (a.s.log.at(-1)?.timestamp||0) ? 1 : -1);
}
```

### Known Limits

- Does not paginate. All matching items render into the DOM. For large collections (50+ items) consider virtual scrolling
- Search highlights text in the last log entry preview only, not inside expanded log entries
- Card expand state is not persisted — all cards return to collapsed on re-render

---

## M05 — Evidence Board

### Purpose

The Evidence Board renders all investigations simultaneously as pinned cards on an open canvas, grouped loosely by status. Each pin shows the item's current name, icon, knowledge bar, status indicator, and source count. Clicking a pin navigates directly to that investigation in the Investigate tab.

The Evidence Board is a read-only overview module. It does not accept input other than navigation clicks. It does not modify state.

### Narrative Role

The investigation view shows one item at a time in depth. The journal shows all items as a structured list. The Evidence Board shows all items at once as a spatial overview — the way an investigator might spread case files across a desk to see the shape of everything simultaneously.

It makes visible things that are harder to see in the list view: how many investigations are currently contested, which items are still echoing without a found source, whether the player has been closing investigations without completing them, and whether any single item stands out as the most advanced or most neglected.

The board is not interactive in the investigation sense. It is observational. It answers the question: what does all of this look like at once?

### Interface

```javascript
EvidenceBoard.render()
// Renders all investigations as pin cards into #board-canvas.
// Reads all S.items. No filtering. No search.
// Returns: void

EvidenceBoard.navigateTo(itemId)
// Called when a pin is clicked.
// Switches to Investigate tab and selects the item.
// Returns: void
```

### Inputs

| Input | Type | Source |
|-------|------|--------|
| `S.items` | object | All investigation state |
| `ITEM_TEMPLATES` | object | Icon and tier names |
| `TIERS` | array | Fill colours per KNW level |
| `computeStatus(itemId)` | function | Journal Engine |

### Outputs

| Output | Effect |
|--------|--------|
| DOM: `#board-canvas` | All investigation pins rendered |
| Tab switch + item select | On pin click, navigates to Investigate tab |

### Dependencies

- **Knowledge Tier Engine** — fill colours for knowledge bars on pins
- **Journal Engine** — `computeStatus()` to determine pin CSS class
- **`ITEM_TEMPLATES`** — icon and current name per knowledge level

### Pin Anatomy

```
        📌
┌──────────────────┐
│ 🗡️               │  ← icon
│ Blood Oath        │  ← current name (tier-aware)
│ Ritual Weapon    │
│ ▓▓▓▓▓▓▓▓▓▓▓▓░░ │  ← knowledge bar
│ ● resolved  4/4  │  ← status dot + KNW
│ 6 sources used   │  ← source count
└──────────────────┘
```

### CSS Classes Per Status

```css
.board-pin.pin-active    { border-color: var(--k2); }
.board-pin.pin-contested { border-color: var(--amber); }
.board-pin.pin-resolved  { border-color: var(--green); }
.board-pin.pin-archived  { border-color: var(--muted); opacity: .55; }
.board-pin.pin-echoing   { border-color: var(--purple); border-style: dashed; }
```

### Implementation

```javascript
function render() {
  const el = document.getElementById('board-canvas');
  if (!el) return;
  el.innerHTML = '';

  Object.entries(S.items).forEach(([id, s]) => {
    const tmpl   = getTemplate(id);
    const status = computeStatus(id);   // from Journal Engine
    const tier   = TIERS[Math.min(s.knowledge, 4)];
    const pct    = (s.knowledge / 4) * 100;

    const pin = document.createElement('div');
    pin.className = `board-pin pin-${status}`;
    pin.innerHTML = `
      <span class="pin-icon">${tmpl.icon}</span>
      <div class="pin-name">${tmpl.names[s.knowledge]}</div>
      <div class="pin-bar">
        <div class="pin-bar-fill" style="
          width: ${pct}%;
          background: ${s.contested ? 'var(--amber)' : tier.fill};
        "></div>
      </div>
      <div class="pin-meta">
        <span>
          <span class="pin-status-dot dot-${status}"></span>
          ${status}
        </span>
        <span>KNW ${s.knowledge}/4</span>
      </div>
      <div class="pin-sources">
        ${s.usedSources.length} source${s.usedSources.length !== 1 ? 's' : ''} used
      </div>
    `;

    pin.addEventListener('click', () => navigateTo(id));
    el.appendChild(pin);
  });
}

function navigateTo(itemId) {
  S.activeItem = itemId;
  switchTab('investigate');
  renderInvestigateTab();
}
```

### Extension

To group pins visually by status on the board (columns):

```javascript
// Replace flat canvas with a column layout:
const columns = { active:[], contested:[], resolved:[], archived:[], echoing:[] };
Object.entries(S.items).forEach(([id]) => {
  const status = computeStatus(id);
  columns[status].push(id);
});

// Render each column as a labelled section
Object.entries(columns).forEach(([status, ids]) => {
  if (!ids.length) return;
  const col = document.createElement('div');
  col.className = 'board-column';
  col.innerHTML = `<div class="board-col-label">${status}</div>`;
  ids.forEach(id => col.appendChild(buildPin(id)));
  el.appendChild(col);
});
```

### Known Limits

- No search or filter — the board shows everything. Filtering is the Journal Engine's role
- No thread lines connecting related investigations. Thread visualisation would require a relationship model outside this module
- Pin layout is flow-wrapped, not spatially arranged. Spatial placement (drag-and-drop pin positioning) would require storing pin coordinates in state

---

## M06 — Reconstruction Engine

### Purpose

The Reconstruction Engine manages the narrative payoff that fires when an investigation reaches Knowledge Level 4 cleanly. It gates the event on `canResolve()` from the Contested State module, triggers the reconstruction modal once per clean resolution, renders the item-specific narrative text, and marks the investigation as having triggered the event so it does not fire again on subsequent renders.

### Narrative Role

The reconstruction event is the reward for finishing. Not a number going up. Not an achievement unlocking. A memory.

When the player reaches true understanding of an item, the codex shows them what actually happened — not a description of it, not a summary, but a witnessed account in the present tense. The hooded figure presses the blade against the palm. The vampire kneels. The words are spoken.

The player did not find this. They built toward it. Every source they consulted, every gate they navigated, every contested entry they corrected contributed to the understanding that unlocked it. The reconstruction is the proof that the investigation was real.

It fires once. It stays in the journal permanently. It is never shown for contested resolutions — because contested knowledge, however complete in quantity, is not true understanding.

### Interface

```javascript
ReconstructionEngine.checkAndFire(itemId)
// Called after every state change on an item.
// Fires the reconstruction modal if conditions are met.
// Conditions: KNW >= 4, contested === false, _reconShown !== true
// Returns: void

ReconstructionEngine.show(itemId)
// Directly triggers the reconstruction modal for an item.
// Called by checkAndFire() when all conditions pass.
// Returns: void

ReconstructionEngine.hasTriggered(itemId)
// Returns true if the reconstruction has already fired for this item.
// Prevents re-triggering on re-render.
// Returns: boolean

ReconstructionEngine.reset(itemId)
// Clears the _reconShown flag.
// Called by the reset module when an investigation is reset.
// Allows reconstruction to fire again if the item is re-resolved.
// Returns: void
```

### Inputs

| Input | Type | Source |
|-------|------|--------|
| `itemId` | string | Active investigation |
| `S.items[itemId].knowledge` | number | Global state |
| `S.items[itemId].contested` | boolean | Contested State module |
| `S.items[itemId]._reconShown` | boolean | Internal flag |
| `ITEM_TEMPLATES[itemId].reconstruction` | string | Item definition |
| `ITEM_TEMPLATES[itemId].names[4]` | string | True name at KNW 4 |
| `ITEM_TEMPLATES[itemId].classification[4]` | string | Final classification |

### Outputs

| Output | Effect |
|--------|--------|
| `S.items[itemId]._reconShown = true` | Prevents re-triggering |
| DOM: `#modal-reconstruction` | Modal displayed with item-specific content |
| `#recon-item-name` | Item's KNW 4 name |
| `#recon-body` | Reconstruction narrative text |
| `#recon-classification` | Final classification label |

### Dependencies

- **Contested State** — `canResolve()` must return true before firing
- **Knowledge Tier Engine** — KNW must equal 4
- **`ITEM_TEMPLATES`** — provides reconstruction text, KNW 4 name, classification

### Resolution Gate

```javascript
// All three conditions must be true:
const canFire = (
  s.knowledge   >= 4    &&   // knowledge complete
  s.contested  === false &&   // no unresolved misinfo
  !s._reconShown             // not already shown this investigation
);
```

### Implementation

```javascript
function checkAndFire(itemId) {
  const s = S.items[itemId];
  if (!s) return;

  const canFire = s.knowledge >= 4 && !s.contested && !s._reconShown;
  if (!canFire) return;

  // Delay slightly so the UI settles after the discovery event renders
  setTimeout(() => show(itemId), 600);
}

function show(itemId) {
  const s    = S.items[itemId];
  const tmpl = getTemplate(itemId);
  if (!s || !tmpl) return;

  // Mark as shown — must happen before modal opens
  s._reconShown = true;
  saveState();

  // Populate modal content
  document.getElementById('recon-item-name').textContent =
    tmpl.names[4];
  document.getElementById('recon-body').textContent =
    tmpl.reconstruction;
  document.getElementById('recon-classification').textContent =
    tmpl.classification[4];

  // Open modal
  openModal('modal-reconstruction');
}

function hasTriggered(itemId) {
  return S.items[itemId]?._reconShown === true;
}

function reset(itemId) {
  if (S.items[itemId]) {
    S.items[itemId]._reconShown = false;
  }
}
```

### Reconstruction Modal Structure

```
┌─────────────────────────────────────────────┐
│ ⚡ Reconstruction Event — Memory Unlocked   │
│                                             │
│ Blood Oath Ritual Weapon                    │  ← names[4]
│                                             │
│ A hooded figure presses the blade against   │  ← reconstruction text
│ a vampire's open palm — not to wound, but   │
│ to seal. The vampire kneels. Words are      │
│ spoken in a language older than the         │
│ kingdom. The blade glows. The oath is       │
│ bound. It was never meant to kill anything. │
│                                             │
│ Forbidden Relic          [ Close Memory ]   │  ← classification[4]
└─────────────────────────────────────────────┘
```

### Extension

To support path-specific reconstructions (Scholar path sees different text than Cultist path):

```javascript
// Extend ITEM_TEMPLATES to hold multiple reconstruction variants:
ITEM_TEMPLATES.dagger.reconstructions = {
  scholar:       'The text in the archive describes a weapon of subjugation…',
  cultist:       'A ceremony. Two figures. The blade between them willingly…',
  empiricist:    'You observed the binding. You did not see it chosen…',
  default:       'The full picture forms…',
};

// In show():
const primaryPath = s.usedSources.find(id =>
  ['scholar','cultist','empiricist'].includes(id)
) ?? 'default';

document.getElementById('recon-body').textContent =
  tmpl.reconstructions[primaryPath] ?? tmpl.reconstructions.default;
```

### Known Limits

- Fires once per investigation instance. If the investigation is reset and re-resolved, `reset()` must be called explicitly — this is handled by the reset action in `codex.js`
- Does not animate the transition into the modal beyond the CSS entrance animation — cinematic sequencing would require a dedicated cutscene system outside this module
- Reconstruction text is static per item (or per path with the extension above). Dynamic text generation from the player's specific discovery log would require a text assembly system outside this module

---

## Dependency Graph

```
                    ┌─────────────────────┐
                    │  Knowledge Tier     │
                    │  Engine (external)  │
                    └──────┬──────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
   ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
   │  Inventory  │  │  Contested  │  │  Evidence   │
   │  Bridge     │  │  State      │  │  Board      │
   │  M01        │  │  M03        │  │  M05        │
   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
          │                │                │
          │         ┌──────▼──────┐         │
          │         │Reconstruction│         │
          │         │  Engine     │         │
          │         │  M06        │         │
          │         └─────────────┘         │
          │                                 │
   ┌──────▼─────────────────────────────────▼──────┐
   │                Journal Engine                  │
   │                M04                             │
   └───────────────────┬────────────────────────────┘
                       │
               ┌───────▼───────┐
               │  Gate System  │
               │  M02          │
               └───────────────┘
```

---

*The Living Codex · Modular System Description · Implementation-Ready Reference*
