# The Living Codex
### A Knowledge-Based Progression & Investigation System

> *The inventory tells you what you carry. The codex tells you who you became while carrying it.*

**The Living Codex** is a fully functional, cross-platform investigation and knowledge-progression system built in plain HTML, CSS, and JavaScript. It is designed to connect to Unreal Engine via Blueprint HTTP nodes and serve as the live web layer of a game's codex — viewable in any browser, on any device, updating in real time.

---

## Live Demo

**[→ View The Living Codex](https://yourusername.github.io/living-codex)**

Open the link, select an investigation from the left sidebar, and use the right panel to fire discovery events. Everything updates live.

---

## What It Does

Most games treat a codex as a passive encyclopedia — you pick up an item, an entry unlocks. The Living Codex treats discovery as a mechanic in itself.

```
Standard system:   Pick up item → Codex entry unlocked

The Living Codex:  Find item → Inspect → Ask people → Experiment
                              → Compare evidence → Understand
```

Items are mysteries. The codex is the record of how you investigated them. Two players can investigate the same item through completely different paths and end up with genuinely different understandings — both valid, neither complete.

---

## File Structure

```
living-codex/
  index.html    — Structure only. All markup, zero logic.
  codex.css     — All visual styles. Change appearance here.
  codex.js      — All data, state, logic, and render functions.
  README.md     — This file.
```

Three files. No framework. No build step. Open `index.html` in a browser and it works.

---

## Features

### Four Views

| Tab | Purpose |
|-----|---------|
| **Investigate** | Active codex entry — discovery log, knowledge bar, source buttons, NPC teach grid, gate history, API payload |
| **Journal** | All investigations — filterable by status, searchable, expandable cards with full history |
| **NPC Network** | Every NPC's knowledge state across all items, with teach controls |
| **Evidence Board** | All investigations as pinned cards on a dark canvas |

### Knowledge System

Five tiers per item. Each tier changes the item's name, description, and classification.

| Level | Label | Meaning |
|-------|-------|---------|
| 0 | Unknown | Item found. Nothing understood. |
| 1 | Observed | Surface details. Named by appearance. |
| 2 | Practical | Functional use understood. |
| 3 | Historical | Origin and context known. |
| 4 | True Understanding | Full nature revealed. Reconstruction unlocks. |

### Source Types

| Type | Effect |
|------|--------|
| `normal` | +1 knowledge. Reliable. |
| `misinfo` | +1 knowledge but marks investigation as **Contested** |
| `revision` | +0 knowledge. Clears the Contested flag. |
| `terminal` | Available at KNW 4 only. Adds depth, no progression change. |

### Gate System

Choosing one investigation path can permanently close another. Talking to the Scholar locks out the Cultist. Talking to the Cultist locks out the Scholar. Both choices are recorded in the gate history with the reason stated.

### Abandonment (6 Categories)

Investigations can be archived with a specific reason:

- **Distraction** — moved on, no resolution
- **Apprehension** — sensed the cost of knowing, chose not to
- **Bribery** — paid to stop asking
- **Coercion** — threatened or blocked (sets `ACTIVE_INJUSTICE` flag)
- **Extortion** — something held against the investigation
- **Protective Halt** — chose not to know to protect someone

Each category is recorded permanently in the codex with the player's written explanation.

### Inventory Integration

Picking up an item triggers a codex entry automatically. The inventory and codex remain separate interfaces sharing the same data — the inventory shows the item's current name (which changes as knowledge grows), the codex holds the full investigation record. Dropping or selling an item archives the investigation rather than deleting it.

---

## Running Locally

```bash
# Clone the repository
git clone https://github.com/yourusername/living-codex.git
cd living-codex

# Serve over HTTP (required for storage to work)
python -m http.server 8080

# Open in browser
http://localhost:8080
```

> **Note:** Opening `index.html` directly as a `file://` URL works for viewing but persistent storage requires HTTP. Use the Python server for full functionality.

---

## Deploying to GitHub Pages

1. Push all files to a public GitHub repository
2. Go to **Settings → Pages**
3. Set source to **main branch / root**
4. Your codex is live at `https://yourusername.github.io/reponame`

Anyone with the URL can view the shared codex. State is shared across all sessions because storage is set to `shared: true`.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `I` | Switch to Investigate tab |
| `J` | Switch to Journal tab |
| `N` | Switch to NPC Network tab |
| `B` | Switch to Evidence Board tab |
| `Esc` | Close any open modal |

---

## Adding New Items

Open `codex.js` and add an entry to `ITEM_TEMPLATES`:

```javascript
const ITEM_TEMPLATES = {
  dagger: { ... },   // existing
  amulet: { ... },   // existing

  // Your new item:
  chalice: {
    id:    'chalice',
    icon:  '🏺',
    names: [
      'Tarnished Cup',
      'Ritual Vessel',
      'Binding Chalice',
      'Chalice of Willing Blood',
      'The First Cup — Origin of the Oath',
    ],
    descriptions: [
      'A dull metal cup. Older than it looks.',
      // ... four more tiers
    ],
    classification: ['Unknown', 'Unknown', 'Ritual Object', 'Forbidden Relic', 'Origin Artefact'],
    reconstruction: 'The cup was used before the blade. The oath began here.',
    weight: '0.4 kg',
    slot:   'Off Hand',
  },
};
```

The new item appears in the sidebar, inventory, journal, and evidence board automatically.

---

## Adding New Sources

Open `codex.js` and add an entry to `SOURCES`:

```javascript
{
  id:        'archivist',
  icon:      '🗂️',
  label:     'Talk to the Archivist',
  desc:      'Rogue historian — knows what the Guild suppressed',
  gain:      1,
  minLevel:  2,     // available from KNW 2
  maxLevel:  3,     // closes once investigation moves past KNW 3
  type:      'normal',
  event:     'NPC_DIALOGUE',
  gateOpens: [],
  gateLocks: [],
},
```

---

## Connecting to Unreal Engine

Every discovery event fires a POST request to your backend. In Unreal, create a Blueprint HTTP node that fires when the player:

- Picks up an item → `ITEM_ACQUIRED`
- Inspects an item → `PLAYER_INSPECT`
- Enters a location → `LOCATION_TRIGGER`
- Speaks to an NPC → `NPC_DIALOGUE`
- Uses an item → `ITEM_USED_ON`
- Reads a document → `BOOK_READ`

**Event payload format:**

```json
{
  "event":       "NPC_DIALOGUE",
  "item_id":     "dagger",
  "source_id":   "scholar",
  "source_type": "revision",
  "new_level":   3,
  "contested":   false,
  "timestamp":   "2026-03-11T14:22:10.000Z",
  "player_id":   "player_001",
  "session_id":  "ses_a7f3c2"
}
```

**Replacing the demo storage with a real backend:**

In `codex.js`, replace two functions:

```javascript
// Replace saveState():
async function saveState() {
  await fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(S),
  });
}

// Replace loadState():
async function loadState() {
  const r = await fetch(`/api/state?player_id=${S.settings.playerId}`);
  const data = await r.json();
  // merge data into S with same validation logic
}
```

Everything else stays identical.

---

## Design Principles

1. **Understanding is earned, not granted.** No information appears automatically from acquisition alone.
2. **Multiple valid paths.** No single discovery route is correct. Both paths are legitimate.
3. **Mistakes are progress.** Misinformation followed by revision is more valuable than having been right the first time.
4. **Stopping is recorded, not erased.** An archived investigation is not a neutral state. The reason matters.
5. **The world reads the record.** NPCs whose knowledge the player expanded may pass it on. Coerced suspensions leave flags the world responds to.
6. **Platform is irrelevant.** The codex is equally valid in the browser and in the game.
7. **The journal belongs to the player.** No two journals are the same. No pattern is evaluated for correctness.

---

## Technology

- **HTML** — Structure only. No inline styles or scripts.
- **CSS** — Custom properties, CSS animations, responsive grid. No framework.
- **JavaScript** — Vanilla ES6+. No libraries, no bundler, no build step.
- **Storage** — Shared storage layer for demo. Replace with any database for production.
- **Fonts** — Cinzel (display), IM Fell English (serif body), Share Tech Mono (monospace). Loaded from Google Fonts.

---

## License

MIT — use it, extend it, ship it.

---

*The Living Codex · Knowledge-Based Progression & Investigation System · Setting-Agnostic · Unreal Engine Ready*
