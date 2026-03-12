'use strict';
/* ════════════════════════════════════════════════════
   THE LIVING CODEX — JavaScript
   codex.js

   All systems:
   • Knowledge tiers (0–4)
   • Source types: normal | misinfo | revision | terminal
   • Knowledge window lockout (minLevel / maxLevel)
   • Gate system: opens + mutual exclusions
   • Contested state + revision clearing
   • Abandonment taxonomy (6 categories)
   • Dynamic item registration
   • Inventory panel (linked, not merged)
   • Evidence Board (4th tab)
   • NPC knowledge network with teach
   • Journal: filter, search, expand, actions
   • Reconstruction event modal
   • Progress reset with memory trace
   • Live cross-platform storage
   • Keyboard shortcuts
   ════════════════════════════════════════════════════ */

// ════════════════════════════════════════════════════
// KNOWLEDGE TIERS
// ════════════════════════════════════════════════════
const TIERS = [
  { level:0, label:'Unknown',            fill:'#3a3a5a', glow:'rgba(80,80,150,.2)'   },
  { level:1, label:'Observed',           fill:'#486078', glow:'rgba(72,96,120,.25)'  },
  { level:2, label:'Practical',          fill:'#287898', glow:'rgba(40,120,152,.3)'  },
  { level:3, label:'Historical',         fill:'#6848c0', glow:'rgba(104,72,192,.3)'  },
  { level:4, label:'True Understanding', fill:'#c03818', glow:'rgba(192,56,24,.35)'  },
];

// ════════════════════════════════════════════════════
// ITEM TEMPLATES  (built-in items with full 5-tier content)
// ════════════════════════════════════════════════════
const ITEM_TEMPLATES = {
  dagger: {
    id:'dagger', icon:'🗡️',
    names:['Unknown Blade','Strange Dagger','Ritual Knife','Cult Sacrifice Blade','Blood Oath Ritual Weapon'],
    descriptions:[
      'An unusual dagger. The metal feels cold to the touch. Something about it feels wrong.',
      'The blade bears strange symbols etched along the fuller. The metal seems older than it looks.',
      'Clearly designed for ceremony, not combat. The grip is wrapped in preserved leather. It has never drawn blood in battle.',
      'Used by the Blood Cult in ritual sacrifice. The symbols are prayers to something ancient that predates the current age.',
      'This blade binds vampires to an unbreakable blood oath. It is not a weapon. It is a contract written in living metal.',
    ],
    classification:['Unknown','Unknown','Ritual Object','Forbidden Relic','Forbidden Relic'],
    reconstruction:'A hooded figure presses the blade against a vampire\'s open palm — not to wound, but to seal. The vampire kneels. Words are spoken in a language older than the kingdom. The blade glows. The oath is bound. It was never meant to kill anything.',
    weight:'0.8 kg', slot:'Main Hand',
  },
  amulet: {
    id:'amulet', icon:'📿',
    names:['Strange Amulet','Carved Bone Pendant','Ward of the Hollow','Cultist Identifier','The Hollow Mark'],
    descriptions:[
      'A small amulet carved from bone. It feels lighter than it should.',
      'The carving depicts a figure with a hollow where the face should be. The style is unfamiliar.',
      'Worn as protection against something — the symbols suggest warding rather than worship.',
      'Members of the Hollow Sect wear these to identify each other in public without speaking.',
      'A mark of rank within the Hollow Sect. The number of rings carved into the bone indicates seniority. This one has three.',
    ],
    classification:['Unknown','Unknown','Ritual Object','Cult Identifier','Faction Artifact'],
    reconstruction:'A crowded marketplace. Two strangers pass. One glances at the other\'s collar — sees the amulet — gives a single nod. No words. They part. The sect has been operating in plain sight for decades.',
    weight:'0.1 kg', slot:'Neck',
  },
};

// ════════════════════════════════════════════════════
// SOURCES
// ════════════════════════════════════════════════════
const SOURCES = [
  { id:'inspect',       icon:'🔍', label:'Inspect Item',        desc:'Examine the object closely',
    gain:1, minLevel:0, maxLevel:3, type:'normal',   event:'PLAYER_INSPECT',
    gateOpens:[], gateLocks:[] },
  { id:'altar',         icon:'⛩️', label:'Ritual Altar Found',  desc:'Environment: BloodAltar zone',
    gain:1, minLevel:0, maxLevel:3, type:'normal',   event:'LOCATION_TRIGGER',
    gateOpens:['tome'], gateLocks:[] },
  { id:'hunter',        icon:'🏹', label:'Talk to Hunter',       desc:'Confident — but spreading a rumour',
    gain:1, minLevel:0, maxLevel:4, type:'misinfo',  event:'NPC_DIALOGUE',
    contestedBy:'scholar', gateOpens:['scholar'], gateLocks:[] },
  { id:'scholar',       icon:'📜', label:'Talk to Scholar',      desc:'Corrects the Hunter\'s account',
    gain:0, minLevel:1, maxLevel:4, type:'revision', event:'NPC_DIALOGUE',
    revisesSource:'hunter', gateOpens:[], gateLocks:[] },
  { id:'combat',        icon:'⚔️', label:'Use in Combat',        desc:'Experimentation — observe the result',
    gain:1, minLevel:1, maxLevel:3, type:'normal',   event:'ITEM_USED_ON',
    gateOpens:[], gateLocks:[] },
  { id:'tome',          icon:'📖', label:'Read Forbidden Tome',  desc:'Archive: Blood Cult Rituals',
    gain:1, minLevel:2, maxLevel:3, type:'normal',   event:'BOOK_READ',
    gateOpens:[], gateLocks:[] },
  { id:'cultist',       icon:'🕯️', label:'Talk to Cultist',      desc:'Living tradition — full truth',
    gain:1, minLevel:3, maxLevel:3, type:'normal',   event:'NPC_DIALOGUE',
    gateOpens:['bound_vampire'], gateLocks:[] },
  { id:'bound_vampire', icon:'🧛', label:'Bound Vampire Speaks', desc:'Terminal lore — only at max knowledge',
    gain:0, minLevel:4, maxLevel:4, type:'terminal', event:'NPC_DIALOGUE_SPECIAL',
    gateOpens:[], gateLocks:[] },
];

// Mutual exclusion gates — choosing one path locks the other
const GATE_CONFLICTS = [
  { trigger:'scholar',  locks:['cultist'],  permanent:true,
    reason:'Aligning with the Scholar Guild marks you to the Cult. Elder Serath will not speak with you.' },
  { trigger:'cultist',  locks:['scholar'],  permanent:true,
    reason:'The Cult considers the Guild an adversary. The Scholar will not assist you further.' },
];

const SOURCE_LOGS = {
  inspect:       ['You turn the blade over. Strange symbols are etched along the fuller.',
                  'The symbols appear to be a prayer of some kind. Or a contract.'],
  altar:         ['Near the altar, the blade hums faintly. The symbols align with the carvings in the stone. The archive access point is visible.'],
  hunter:        ['"I know that blade. Cult killers use it to drain vampires. Touch one with it and it\'s dead. Seen it myself."'],
  scholar:       ['"I have to stop you there. The blade does not kill vampires — it binds them. The Hunter saw a binding and mistook stillness for death. Very different things."'],
  combat:        ['The blade reacts — but does not kill. Something else is happening. The reaction was not what was expected.'],
  tome:          ['"The Oath Blade was never a weapon of death. It is a contract, bound in living metal." — Blood Cult Rituals, Vol. III'],
  cultist:       ['"You already know, don\'t you. That blade binds a vampire to an oath they cannot break. It is not a weapon. It is a leash."'],
  bound_vampire: ['"I chose this. You think you bound me. I came to you. The blade works both ways — it formalises consent, not capture. You were just the witness it needed."'],
};

// ════════════════════════════════════════════════════
// NPC DEFINITIONS
// ════════════════════════════════════════════════════
const NPC_DEFS = [
  { id:'hunter',   name:'Hunter',       icon:'🏹', role:'Tracker & Scout',      baseKnw:1 },
  { id:'merchant', name:'Merchant',     icon:'🛒', role:'Trade Network',         baseKnw:0 },
  { id:'guard',    name:'City Guard',   icon:'⚔️', role:'Watch Captain',         baseKnw:0 },
  { id:'scholar',  name:'Scholar',      icon:'📜', role:'Guild Historian',       baseKnw:3 },
  { id:'elder',    name:'Elder Serath', icon:'🕯️', role:'Cult, Third Circle',   baseKnw:4 },
];

// ════════════════════════════════════════════════════
// STATE FACTORY
// ════════════════════════════════════════════════════
function makeItemState(o={}) {
  return {
    knowledge:    0,
    usedSources:  [],
    lockedSources:[],
    log:          [],
    note:         '',
    isNew:        false,
    contested:    false,
    status:       'active',
    entryType:    'physical',
    abandonment:  null,
    gatesOpened:  [],
    gatesClosed:  [],
    customIcon:   null,
    customName:   null,
    ...o,
  };
}

// ════════════════════════════════════════════════════
// GLOBAL STATE
// ════════════════════════════════════════════════════
let S = {
  activeItem:    'dagger',
  activeTab:     'investigate',
  journalFilter: 'all',
  journalSearch: '',
  settings:      { mode:'demo', backendUrl:'', playerId:'player_001' },
  items: {
    dagger: makeItemState({ entryType:'physical' }),
    amulet: makeItemState({ entryType:'physical' }),
  },
  npcs:       { hunter:1, merchant:0, guard:0, scholar:3, elder:4 },
  npcTaught:  {},
  pendingAbandon: null,
};

// ════════════════════════════════════════════════════
// STORAGE
// ════════════════════════════════════════════════════
async function saveState() {
  try {
    await window.storage.set('living-codex-v4', JSON.stringify(S), true);
  } catch(e) { console.warn('[Codex] Storage save failed:', e); }
}

async function loadState() {
  try {
    const r = await window.storage.get('living-codex-v4', true);
    if (!r || !r.value) return;
    const L = JSON.parse(r.value);
    if (L.items) {
      Object.entries(L.items).forEach(([id, saved]) => {
        const knw = Number(saved.knowledge);
        S.items[id] = makeItemState({
          ...saved,
          knowledge: Number.isFinite(knw) ? Math.min(4,Math.max(0,Math.round(knw))) : 0,
        });
      });
    }
    if (L.npcs) {
      Object.entries(L.npcs).forEach(([id,v]) => {
        const n = Number(v);
        S.npcs[id] = Number.isFinite(n) ? Math.min(4,Math.max(0,Math.round(n))) : 0;
      });
    }
    if (L.npcTaught)    S.npcTaught    = L.npcTaught;
    if (L.settings)     S.settings     = { ...S.settings, ...L.settings };
    if (L.activeItem && S.items[L.activeItem]) S.activeItem = L.activeItem;
    if (L.activeTab)    S.activeTab    = L.activeTab;
  } catch(e) { console.info('[Codex] Starting fresh — no saved state.'); }
}

// ════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════
function getTier(knw)   { return TIERS[Math.min(4,Math.max(0,knw))]; }
function getTemplate(id) {
  if (S.items[id]?.customName) {
    const s = S.items[id];
    return {
      id, icon: s.customIcon||'🔮',
      names: Array(5).fill(s.customName),
      descriptions:[
        'Something you found or noticed. Its nature is unclear.',
        'On closer inspection, some details emerge.',
        'You understand what this does, if not what it is.',
        'Its history is becoming clear.',
        'You understand this fully — what it is, where it came from, and what it means.',
      ],
      classification:['Unknown','Unknown','Under Investigation','Identified','Fully Classified'],
      reconstruction: 'The full picture forms. Everything you learned leads here.',
      weight:'?', slot:'Misc',
    };
  }
  return ITEM_TEMPLATES[id] || {
    id, icon:'🔮',
    names:['Unknown Object','Observed Object','Studied Object','Identified Object','Fully Known Object'],
    descriptions:['Something you found.','Details emerge.','Practical use understood.','History known.','Fully understood.'],
    classification:['Unknown','Unknown','Under Investigation','Identified','Classified'],
    reconstruction:'The full picture forms.',
    weight:'?', slot:'Misc',
  };
}

function computeStatus(s) {
  if (s.status === 'archived') return 'archived';
  if (s.status === 'echoing')  return 'echoing';
  if (s.knowledge >= 4 && !s.contested) return 'resolved';
  if (s.contested) return 'contested';
  return 'active';
}

function sourceAvailability(src, s) {
  const knw  = s.knowledge;
  const used = s.usedSources.includes(src.id);
  const locked = s.lockedSources.includes(src.id);
  if (used)   return { state:'used' };
  if (locked) return { state:'locked', reason:'Closed by an earlier choice.' };
  if (src.type === 'terminal')
    return knw >= 4 ? {state:'available'} : {state:'locked', reason:'Unlocks at max knowledge'};
  if (src.type === 'revision') {
    if (!s.usedSources.includes(src.revisesSource))
      return {state:'locked', reason:'Nothing to correct yet'};
    if (knw < src.minLevel) return {state:'locked', reason:`Requires KNW ${src.minLevel}`};
    return {state:'available'};
  }
  if (knw < src.minLevel) return {state:'locked', reason:`Requires KNW ${src.minLevel}`};
  if (knw > src.maxLevel) return {state:'closed',  reason:'Investigation moved past this'};
  return {state:'available'};
}

function highlight(text, query) {
  if (!query) return escHtml(text);
  const esc = query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return escHtml(text).replace(new RegExp(`(${esc})`,'gi'),'<mark class="highlight">$1</mark>');
}
function escHtml(t) {
  return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ════════════════════════════════════════════════════
// API MOCK
// ════════════════════════════════════════════════════
function renderApiMock(srcId, itemId, newLevel, type) {
  const src = SOURCES.find(s=>s.id===srcId)||{event:'MANUAL'};
  const payload = {
    event:       src.event,
    item_id:     itemId,
    source_id:   srcId,
    source_type: type,
    new_level:   newLevel,
    contested:   S.items[itemId]?.contested||false,
    timestamp:   new Date().toISOString(),
    player_id:   S.settings.playerId||'player_001',
    session_id:  'ses_'+Math.random().toString(36).slice(2,8),
  };
  const el = document.getElementById('api-mock');
  if (!el) return;
  el.innerHTML = `
    <div><span class="api-event">POST</span> /api/codex/event</div>
    <div class="api-comment">──────────────────</div>
    ${Object.entries(payload).map(([k,v])=>
      `<div><span class="api-key">"${k}"</span>: <span class="api-val">"${v}"</span></div>`
    ).join('')}
    <div class="api-comment">──────────────────</div>
    <div class="api-comment">// Broadcasting to all clients.</div>
  `;
}

function setSyncLabel(text) {
  const el = document.getElementById('sync-label');
  if (el) el.textContent = text;
}

// ════════════════════════════════════════════════════
// RENDER — LEFT SIDEBAR
// ════════════════════════════════════════════════════
function renderItemList() {
  const el = document.getElementById('item-list');
  if (!el) return;
  el.innerHTML = '';

  Object.entries(S.items).forEach(([id]) => {
    const s      = S.items[id];
    const tmpl   = getTemplate(id);
    const status = computeStatus(s);
    const div    = document.createElement('div');
    div.className = 'item-entry' + (S.activeItem===id ? ' active' : '');
    div.addEventListener('click', () => selectItem(id));

    const pips = Array.from({length:4},(_,i)=>
      `<div class="pip ${i<s.knowledge?'filled':''}"></div>`).join('');

    let badge = '';
    if (status==='contested') badge='<div class="entry-badge badge-contested">⚠</div>';
    else if (status==='resolved')  badge='<div class="entry-badge badge-resolved">✓</div>';
    else if (status==='archived')  badge='<div class="entry-badge badge-archived">⊘</div>';
    else if (status==='echoing')   badge='<div class="entry-badge badge-echoing">~</div>';
    else if (s.isNew)              badge='<div class="entry-badge badge-new">New</div>';

    div.innerHTML = `
      <div class="item-entry-name">${tmpl.icon} ${tmpl.names[s.knowledge]}</div>
      <div class="item-entry-meta">
        <div class="knw-pip">${pips}</div>
        <div class="item-entry-level">KNW ${s.knowledge}</div>
      </div>${badge}`;
    el.appendChild(div);
  });
}

function renderInventory() {
  const el = document.getElementById('inventory-panel');
  if (!el) return;
  const ids = Object.keys(S.items);
  if (!ids.length) { el.innerHTML='<div class="inventory-empty">Nothing in hand.</div>'; return; }

  el.innerHTML = ids.map(id => {
    const s    = S.items[id];
    const tmpl = getTemplate(id);
    const status = computeStatus(s);
    const tier = getTier(s.knowledge);
    const pct  = (s.knowledge/4)*100;
    const isActive = S.activeItem===id;
    return `
      <div class="inventory-item ${isActive?'active-inv':''}" data-id="${id}">
        <div class="inventory-item-name">${tmpl.icon} ${tmpl.names[s.knowledge]}</div>
        <div class="inventory-item-meta">${tmpl.slot} · ${tmpl.weight} · KNW ${s.knowledge}</div>
        <div class="inventory-knw-bar">
          <div class="inventory-knw-fill" style="width:${pct}%;background:${s.contested?'var(--amber)':tier.fill};"></div>
        </div>
      </div>`;
  }).join('');

  el.querySelectorAll('.inventory-item').forEach(el => {
    el.addEventListener('click', () => selectItem(el.dataset.id));
  });
}

function selectItem(id) {
  if (!S.items[id]) return;
  S.activeItem = id;
  S.items[id].isNew = false;
  saveState();
  renderInvestigateTab();
}

// ════════════════════════════════════════════════════
// RENDER — MAIN PANEL
// ════════════════════════════════════════════════════
function renderMain() {
  const panel  = document.getElementById('main-panel');
  if (!panel) return;
  const id     = S.activeItem;
  const s      = S.items[id];
  const tmpl   = getTemplate(id);
  const tier   = getTier(s.knowledge);
  const status = computeStatus(s);
  const pct    = (s.knowledge/4)*100;
  const done   = status==='resolved';
  const archived = status==='archived';

  if (!s) { panel.innerHTML=''; return; }

  // Log HTML
  const logHtml = s.log.length===0
    ? '<span style="color:#1a1a30;font-style:italic;">No entries yet.</span>'
    : s.log.map((e,i)=>{
        let cls='log-entry';
        if (e.isTrace)     cls+=' log-trace';
        else if (e.isMisinfo)  cls+=' log-misinfo';
        else if (e.isRevision) cls+=' log-revision';
        else if (i===s.log.length-1) cls+=' log-latest';
        else if (i>=s.log.length-3)  cls+=' log-new';
        const pre = e.isMisinfo?'⚠ ':e.isRevision?'↻ ':e.isTrace?'~ ':'';
        return `<div class="${cls}"><span class="log-src">${pre}[ ${escHtml(e.src)} ]</span><span class="log-txt"> ${escHtml(e.txt)}</span></div>`;
      }).join('');

  // Bar style
  const barBg = s.contested
    ? 'linear-gradient(90deg,rgba(184,136,48,.5),var(--amber))'
    : `linear-gradient(90deg,${tier.fill}88,${tier.fill})`;
  const barGlow = s.contested ? 'rgba(184,136,48,.4)' : tier.glow;
  const barClass = s.contested ? ' contested' : '';

  // Extra badges
  const extraBadge = done ? `<div class="tier-badge status-badge-resolved">✓ Resolved</div>`
    : s.contested ? `<div class="tier-badge status-badge-contested">⚠ Contested</div>`
    : archived    ? `<div class="tier-badge status-badge-archived">⊘ Archived</div>`
    : status==='echoing' ? `<div class="tier-badge status-badge-echoing">~ Echoing</div>` : '';

  // Gate banner
  const gateItems = [
    ...s.gatesOpened.map(g=>`<div class="gate-opened">🔓 Opened: ${escHtml(g)}</div>`),
    ...s.gatesClosed.map(g=>`<div class="${g.permanent?'gate-closed-perm':'gate-closed-temp'}">🔒 ${g.permanent?'Permanently locked':'Locked'}: ${escHtml(g.id)}<div class="gate-reason">${escHtml(g.reason)}</div></div>`),
  ].join('');
  const gateBanner = gateItems ? `
    <div class="banner banner-gate">
      <div class="banner-eyebrow">🔀 Gate Events</div>
      <div class="banner-text">${gateItems}</div>
    </div>` : '';

  // Abandonment banner
  const abandonBanner = archived && s.abandonment ? `
    <div class="banner banner-archived">
      <div class="banner-eyebrow">⊘ Archived — ${escHtml(s.abandonment.category)}</div>
      <div class="banner-text">${escHtml(s.abandonment.note||'No reason recorded.')}
        ${s.abandonment.injustice?'<br><span style="color:#a83030;font-family:var(--mono);font-size:9px;">⚠ ACTIVE_INJUSTICE flag set in world state</span>':''}
      </div>
    </div>` : '';

  // Contested banner
  const contestedBanner = s.contested ? `
    <div class="banner banner-contested">
      <div class="banner-eyebrow">⚠ Contested Knowledge</div>
      <div class="banner-text">One or more sources conflict with each other. Your current understanding may be inaccurate. Find a correcting source to resolve.</div>
    </div>` : '';

  // Resolved notice (reconstruction triggered separately)
  const resolvedBanner = done ? `
    <div class="banner banner-resolved">
      <div class="banner-eyebrow">✓ Investigation Complete</div>
      <div class="banner-text">All discoverable knowledge has been recorded. Further sources are unavailable — the investigation is closed. A memory has unlocked. Use Reset to re-examine from first principles.</div>
    </div>` : '';

  // Action buttons
  const actions = archived
    ? `<button class="action-btn primary" data-action="reopen">↺ Reopen</button>`
    : `<button class="action-btn primary" data-action="save-note">Save Note</button>
       <button class="action-btn" data-action="reset">↺ Reset</button>
       <button class="action-btn warn" data-action="archive">⊘ Archive</button>`;

  panel.innerHTML = `
    <div class="codex-card level-${s.knowledge}">
      <div class="card-header">
        <div>
          <div class="card-eyebrow">Codex Entry · ${escHtml(tmpl.icon)} · ${escHtml(s.entryType)}</div>
          <div class="card-item-name">${escHtml(tmpl.names[s.knowledge])}</div>
        </div>
        <div class="card-badges">
          <div class="tier-badge">${escHtml(tier.label)}</div>
          ${extraBadge}
        </div>
      </div>

      <div class="card-divider"></div>
      <div class="card-description">"${escHtml(tmpl.descriptions[s.knowledge])}"</div>

      <div class="knw-bar-wrap">
        <div class="knw-bar-label">
          <span>Knowledge Progress</span>
          <span>${s.knowledge} / 4${s.contested?' — contested':done?' — complete':''}</span>
        </div>
        <div class="knw-bar-track">
          <div class="knw-bar-fill${barClass}" style="width:${pct}%;background:${barBg};box-shadow:0 0 8px ${barGlow};"></div>
        </div>
      </div>

      <div class="card-meta">
        <div><span>ID: </span><strong>${escHtml(id)}</strong></div>
        <div><span>Class: </span><strong>${escHtml(tmpl.classification[s.knowledge])}</strong></div>
        <div><span>Sources: </span><strong>${s.usedSources.length}</strong></div>
        <div><span>Status: </span><strong>${escHtml(status)}</strong></div>
      </div>

      <div class="log-wrap">
        <div class="log-label">Discovery Log</div>
        <div class="log-scroll">${logHtml}</div>
      </div>

      <div class="note-wrap">
        <div class="note-label">Player Notes — synced across all platforms</div>
        <textarea class="note-input" id="note-input"
          placeholder="Write theories, mark for follow-up, pin a question…"
          ${archived?'readonly':''}>${escHtml(s.note)}</textarea>
        <div class="action-row">${actions}</div>
      </div>
    </div>

    ${gateBanner}
    ${contestedBanner}
    ${resolvedBanner}
    ${abandonBanner}
  `;

  // Wire action buttons
  panel.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = btn.dataset.action;
      if (a==='save-note') saveNote();
      else if (a==='reset')   confirmReset(id);
      else if (a==='archive') openAbandonModal(id);
      else if (a==='reopen')  reopenItem(id);
    });
  });

  // Scroll log to bottom
  const logEl = panel.querySelector('.log-scroll');
  if (logEl) logEl.scrollTop = logEl.scrollHeight;

  // Trigger reconstruction if newly resolved
  if (done && !s._reconShown) {
    s._reconShown = true;
    setTimeout(() => showReconstruction(id), 600);
  }
}

// ════════════════════════════════════════════════════
// RENDER — SOURCE BUTTONS
// ════════════════════════════════════════════════════
function renderSources() {
  const el = document.getElementById('source-buttons');
  if (!el) return;
  el.innerHTML = '';

  const s = S.items[S.activeItem];
  if (!s) return;

  if (computeStatus(s)==='archived') {
    el.innerHTML='<div style="font-family:var(--mono);font-size:9px;color:#28284a;padding:4px 0;">Investigation archived. Reopen to continue.</div>';
    return;
  }

  SOURCES.forEach(src => {
    const avail = sourceAvailability(src, s);
    const btn   = document.createElement('button');
    btn.className = 'src-btn'
      + (avail.state==='used'   ? ' used'   : '')
      + (avail.state==='closed' ? ' closed' : '');
    btn.disabled = avail.state !== 'available';
    if (avail.reason) btn.title = avail.reason;

    let gainHtml = '';
    if (avail.state==='available') {
      if (src.type==='normal')   gainHtml=`<span class="src-gain gain-normal">+1 KNW</span>`;
      if (src.type==='misinfo')  gainHtml=`<span class="src-gain gain-misinfo">+1 ⚠</span>`;
      if (src.type==='revision') gainHtml=`<span class="src-gain gain-revision">↻ revise</span>`;
      if (src.type==='terminal') gainHtml=`<span class="src-gain gain-terminal">★ lore</span>`;
    } else if (avail.state==='locked') {
      gainHtml=`<span class="src-gain gain-status">${avail.reason}</span>`;
    } else if (avail.state==='closed') {
      gainHtml=`<span class="src-gain gain-closed">no longer relevant</span>`;
    } else {
      gainHtml=`<span class="src-gain gain-status">✓ done</span>`;
    }

    btn.innerHTML=`
      <span class="src-icon">${src.icon}</span>
      <span class="src-info">
        <span class="src-name">${escHtml(src.label)}</span>
        <span class="src-desc">${escHtml(src.desc)}</span>
      </span>
      ${gainHtml}`;

    if (avail.state==='available') btn.addEventListener('click',()=>fireDiscovery(src.id));
    el.appendChild(btn);
  });
}

// ════════════════════════════════════════════════════
// RENDER — NPC GRID (sidebar)
// ════════════════════════════════════════════════════
function renderNPCGrid() {
  const el = document.getElementById('npc-grid');
  if (!el) return;
  el.innerHTML = '';
  const s = S.items[S.activeItem];
  if (!s) return;
  const archived = computeStatus(s)==='archived';

  NPC_DEFS.forEach(npc => {
    const npcKnw   = S.npcs[npc.id] ?? npc.baseKnw;
    const canTeach = !archived && s.knowledge > npcKnw;
    const tier     = getTier(npcKnw);
    const row = document.createElement('div');
    row.className='npc-row';
    row.innerHTML=`
      <span class="npc-icon">${npc.icon}</span>
      <span class="npc-name">${escHtml(npc.name)}</span>
      <span class="npc-knw" style="color:${tier.fill}">KNW ${npcKnw}</span>
      ${canTeach?`<button class="teach-btn" data-npc="${npc.id}" data-knw="${npcKnw}">Teach</button>`:''}
    `;
    el.appendChild(row);
  });

  el.querySelectorAll('.teach-btn').forEach(b=>
    b.addEventListener('click',()=>teachNPC(b.dataset.npc,parseInt(b.dataset.knw,10))));
}

// ════════════════════════════════════════════════════
// RENDER — GATE LOG (sidebar)
// ════════════════════════════════════════════════════
function renderGateLog() {
  const el = document.getElementById('gate-log');
  if (!el) return;
  const s = S.items[S.activeItem];
  if (!s) { el.innerHTML='<div style="color:#1a1a30;font-family:var(--mono);font-size:9px;">Select an item.</div>'; return; }

  const entries = [
    ...s.gatesOpened.map(g=>({cls:'gate-opened',  text:`🔓 Opened: ${g}`})),
    ...s.gatesClosed.map(g=>({cls:g.permanent?'gate-closed-perm':'gate-closed-temp', text:`🔒 ${g.id}`, reason:g.reason})),
  ];
  if (!entries.length) { el.innerHTML='<div style="color:#1a1a30;font-family:var(--mono);font-size:9px;">No gate events yet.</div>'; return; }

  el.innerHTML='<div class="gate-log-wrap">'
    +entries.map(e=>`<div class="gate-entry ${e.cls}">${escHtml(e.text)}${e.reason?`<div class="gate-reason">${escHtml(e.reason)}</div>`:''}</div>`).join('')
    +'</div>';
}

// ════════════════════════════════════════════════════
// RENDER — JOURNAL
// ════════════════════════════════════════════════════
function renderJournal() {
  const el = document.getElementById('journal-entries');
  if (!el) return;
  const filter = S.journalFilter || 'all';
  const search = (S.journalSearch||'').toLowerCase().trim();

  const groups = { active:[], contested:[], resolved:[], archived:[], echoing:[] };

  Object.entries(S.items).forEach(([id,s]) => {
    const status = computeStatus(s);
    const tmpl   = getTemplate(id);
    if (filter!=='all' && filter!==status) return;
    if (search) {
      const hay = [tmpl.names[s.knowledge],...s.log.map(l=>l.txt),s.note].join(' ').toLowerCase();
      if (!hay.includes(search)) return;
    }
    groups[status]?.push({id,s,tmpl,status});
  });

  const order  = ['active','contested','resolved','archived','echoing'];
  const labels = {
    active:'Active Investigations', contested:'Contested — Accuracy Uncertain',
    resolved:'Resolved — Truth Established', archived:'Archived — Investigation Closed',
    echoing:'Echoing — Source Not Yet Found',
  };

  el.innerHTML='';
  let any=false;

  order.forEach(st => {
    const list = groups[st];
    if (!list.length) return;
    any=true;
    const g=document.createElement('div');
    g.className='journal-group';
    g.innerHTML=`<div class="journal-group-label">${escHtml(labels[st])} <span class="group-count">(${list.length})</span></div>`;
    list.forEach(({id,s,tmpl,status})=>g.appendChild(buildJCard(id,s,tmpl,status,search)));
    el.appendChild(g);
  });

  if (!any) {
    el.innerHTML=`<div class="empty-state" style="height:300px;">
      <div class="empty-glyph" style="font-size:28px;opacity:.2;">📖</div>
      <div class="empty-sub">${search?'No matching entries':'No investigations yet'}</div>
    </div>`;
  }
}

function buildJCard(id, s, tmpl, status, search='') {
  const card = document.createElement('div');
  card.className=`j-card j-${status}`;

  const pips = Array.from({length:4},(_,i)=>`<div class="j-pip ${i<s.knowledge?'filled':''}"></div>`).join('');
  const tagText = {active:'Active',contested:'⚠ Contested',resolved:'✓ Resolved',archived:'⊘ Archived',echoing:'~ Echoing'}[status];
  const lastLog = s.log.filter(e=>!e.isTrace).slice(-1)[0];
  const lastTxt = lastLog ? `[ ${lastLog.src} ] ${lastLog.txt}` : 'No entries yet.';

  card.innerHTML=`
    <div class="j-card-header">
      <div class="j-icon">${tmpl.icon}</div>
      <div class="j-info">
        <div class="j-name">${highlight(tmpl.names[s.knowledge],search)}</div>
        <div class="j-meta">
          <div class="j-pips">${pips}</div>
          <span class="j-knw">KNW ${s.knowledge}/4</span>
          <span class="j-tag j-tag-${status}">${tagText}</span>
          <span class="j-knw">${s.usedSources.length} source${s.usedSources.length!==1?'s':''}</span>
        </div>
        <div class="j-last-log">${highlight(lastTxt,search)}</div>
      </div>
      <button class="j-expand" data-expand="${id}">＋</button>
    </div>
    <div class="j-body" id="jbody-${id}">${buildJBody(id,s,tmpl,status)}</div>
  `;

  card.querySelector('.j-card-header').addEventListener('click', e => {
    if (e.target.closest('.j-expand')) return;
    toggleJCard(id);
  });
  card.querySelector('.j-expand').addEventListener('click', ()=>toggleJCard(id));
  setTimeout(()=>wireJActions(id,status),0);
  return card;
}

function buildJBody(id, s, tmpl, status) {
  const logHtml = s.log.length===0
    ? '<span style="color:#1a1a30;">No entries yet.</span>'
    : s.log.map(e=>{
        let cls='log-entry';
        if (e.isTrace)     cls+=' log-trace';
        else if(e.isMisinfo)  cls+=' log-misinfo';
        else if(e.isRevision) cls+=' log-revision';
        const pre=e.isMisinfo?'⚠ ':e.isRevision?'↻ ':e.isTrace?'~ ':'';
        return `<div class="${cls}"><span class="log-src">${pre}[ ${escHtml(e.src)} ]</span><span class="log-txt"> ${escHtml(e.txt)}</span></div>`;
      }).join('');

  const gateHtml = (s.gatesOpened.length+s.gatesClosed.length)>0
    ? `<div class="j-gate-list">
        ${s.gatesOpened.map(g=>`<div class="j-gate-o">🔓 Opened: ${escHtml(g)}</div>`).join('')}
        ${s.gatesClosed.map(g=>`<div class="j-gate-c">🔒 ${g.permanent?'Permanent':'Temp'}: ${escHtml(g.id)} — ${escHtml(g.reason)}</div>`).join('')}
      </div>`
    : '<span style="color:#1a1a30;font-family:var(--mono);font-size:9px;">No gate events.</span>';

  const reconHtml = status==='resolved'
    ? `<div class="j-recon">${escHtml(tmpl.reconstruction)}</div>`
    : '<span style="color:#1a1a30;font-family:var(--mono);font-size:9px;">Not yet reached.</span>';

  const abandonHtml = status==='archived'&&s.abandonment
    ? `<div class="j-abandon"><strong>${escHtml(s.abandonment.category)}</strong>${s.abandonment.agent?` — Agent: ${escHtml(s.abandonment.agent)}`:''}<br>${escHtml(s.abandonment.note||'No reason recorded.')}${s.abandonment.injustice?'<br><span style="color:#a83030;">⚠ ACTIVE_INJUSTICE</span>':''}</div>`
    : '';

  const noteHtml = s.note
    ? `<div class="j-note">"${escHtml(s.note)}"</div>`
    : '<span style="color:#1a1a30;font-family:var(--mono);font-size:9px;">No notes recorded.</span>';

  const isArchived = status==='archived';
  return `
    <div class="j-sec-label">Discovery Log</div>
    <div class="j-log-full">${logHtml}</div>
    <div class="j-sec-label">Gate History</div>
    ${gateHtml}
    <div class="j-sec-label">Reconstruction</div>
    ${reconHtml}
    ${status==='archived'?`<div class="j-sec-label">Reason for Closing</div>${abandonHtml}`:''}
    <div class="j-sec-label">Player Notes</div>
    ${noteHtml}
    <div class="j-actions" id="jact-${id}">
      ${!isArchived?`<button class="j-act j-investigate" data-goto="${id}">⚔ Investigate</button>`:''}
      <button class="j-act" data-jreset="${id}">↺ Reset</button>
      ${!isArchived?`<button class="j-act j-danger" data-jabandon="${id}">⊘ Archive</button>`:''}
      ${isArchived?`<button class="j-act j-investigate" data-jreopen="${id}">↺ Reopen</button>`:''}
    </div>`;
}

function wireJActions(id, status) {
  const c = document.getElementById(`jact-${id}`);
  if (!c) return;
  c.querySelector(`[data-goto="${id}"]`)?.addEventListener('click',()=>{ switchTab('investigate'); selectItem(id); });
  c.querySelector(`[data-jreset="${id}"]`)?.addEventListener('click',()=>confirmReset(id));
  c.querySelector(`[data-jabandon="${id}"]`)?.addEventListener('click',()=>openAbandonModal(id));
  c.querySelector(`[data-jreopen="${id}"]`)?.addEventListener('click',()=>{ reopenItem(id); });
}

function toggleJCard(id) {
  const body = document.getElementById(`jbody-${id}`);
  const btn  = document.querySelector(`.j-expand[data-expand="${id}"]`);
  if (!body) return;
  const open = body.classList.toggle('open');
  if (btn) btn.textContent = open ? '－' : '＋';
}

// ════════════════════════════════════════════════════
// RENDER — NETWORK TAB
// ════════════════════════════════════════════════════
function renderNetwork() {
  const el = document.getElementById('network-grid');
  if (!el) return;
  el.innerHTML='';
  NPC_DEFS.forEach(npc=>{
    const card = document.createElement('div');
    card.className='npc-card';
    card.innerHTML=buildNPCCard(npc);
    el.appendChild(card);
  });
  el.querySelectorAll('.npc-teach-btn').forEach(b=>{
    b.addEventListener('click',()=>teachNPCItem(b.dataset.npc,b.dataset.item,parseInt(b.dataset.knw,10)));
  });
}

function buildNPCCard(npc) {
  const npcKnw = S.npcs[npc.id]??npc.baseKnw;
  const tier   = getTier(npcKnw);
  const taught = S.npcTaught[npc.id]||[];
  const itemRows = Object.entries(S.items).map(([id,s])=>{
    const tmpl = getTemplate(id);
    const canTeach = s.knowledge>npcKnw && computeStatus(s)!=='archived';
    const wasTaught = taught.includes(id);
    return `
      <div class="npc-item-row">
        <span class="npc-item-name">${tmpl.icon} ${escHtml(tmpl.names[0])}</span>
        <div class="npc-item-right">
          ${wasTaught?'<span class="npc-taught">taught</span>':''}
          <span class="npc-item-knw knw-chip-${Math.min(npcKnw,4)}">KNW ${npcKnw}</span>
          ${canTeach?`<button class="npc-teach-btn" data-npc="${npc.id}" data-item="${id}" data-knw="${npcKnw}">Teach</button>`:''}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="npc-card-header">
      <div class="npc-card-icon">${npc.icon}</div>
      <div>
        <div class="npc-card-name">${escHtml(npc.name)}</div>
        <div class="npc-card-role">${escHtml(npc.role)}</div>
      </div>
    </div>
    <div class="npc-global-knw" style="color:${tier.fill};">Global KNW ${npcKnw} — ${escHtml(tier.label)}</div>
    <div class="npc-items">${itemRows}</div>`;
}

// ════════════════════════════════════════════════════
// RENDER — EVIDENCE BOARD
// ════════════════════════════════════════════════════
function renderBoard() {
  const el = document.getElementById('board-canvas');
  if (!el) return;
  el.innerHTML='';
  Object.entries(S.items).forEach(([id,s])=>{
    const tmpl   = getTemplate(id);
    const status = computeStatus(s);
    const tier   = getTier(s.knowledge);
    const pct    = (s.knowledge/4)*100;
    const pin    = document.createElement('div');
    pin.className=`board-pin pin-${status}`;
    pin.innerHTML=`
      <span class="pin-icon">${tmpl.icon}</span>
      <div class="pin-name">${escHtml(tmpl.names[s.knowledge])}</div>
      <div class="pin-bar">
        <div class="pin-bar-fill" style="width:${pct}%;background:${s.contested?'var(--amber)':tier.fill};"></div>
      </div>
      <div class="pin-meta">
        <span><span class="pin-status-dot dot-${status}"></span>${escHtml(status)}</span>
        <span>KNW ${s.knowledge}/4</span>
      </div>
      <div class="pin-sources">${s.usedSources.length} source${s.usedSources.length!==1?'s':''} used</div>
    `;
    pin.addEventListener('click',()=>{ switchTab('investigate'); selectItem(id); });
    el.appendChild(pin);
  });
}

// ════════════════════════════════════════════════════
// SYNC CLOCK
// ════════════════════════════════════════════════════
function updateClock() {
  const el = document.getElementById('sync-time');
  if (el) el.textContent = new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
}

// ════════════════════════════════════════════════════
// ORCHESTRATION
// ════════════════════════════════════════════════════
function renderInvestigateTab() {
  renderItemList();
  renderInventory();
  renderMain();
  renderSources();
  renderNPCGrid();
  renderGateLog();
}

function render() {
  renderInvestigateTab();
  renderJournal();
  renderNetwork();
  renderBoard();
  updateClock();
}

// ════════════════════════════════════════════════════
// ACTIONS — DISCOVERY
// ════════════════════════════════════════════════════
function fireDiscovery(srcId) {
  const id  = S.activeItem;
  const s   = S.items[id];
  const src = SOURCES.find(x=>x.id===srcId);
  if (!src||!s) return;
  if (sourceAvailability(src,s).state!=='available') return;

  // Apply gate opens
  src.gateOpens?.forEach(gid => {
    if (!s.gatesOpened.includes(gid)) s.gatesOpened.push(gid);
  });

  // Apply gate conflicts
  const conflict = GATE_CONFLICTS.find(c=>c.trigger===srcId);
  if (conflict) {
    conflict.locks.forEach(lockId => {
      if (!s.lockedSources.includes(lockId)) {
        s.lockedSources.push(lockId);
        s.gatesClosed.push({id:lockId,reason:conflict.reason,permanent:conflict.permanent});
      }
    });
  }

  const prev = Math.min(4,Math.max(0,Math.round(s.knowledge)));

  if (src.type==='misinfo') {
    s.knowledge = Math.min(4,prev+1);
    s.contested = true;
    s.usedSources.push(srcId);
    s.log.push({src:src.label,txt:(SOURCE_LOGS[srcId]||[src.label])[0],isMisinfo:true});
    showToast(`${src.icon} ${src.label} — ⚠ Contested: accuracy uncertain`);
  }
  else if (src.type==='revision') {
    s.contested = false;
    s.usedSources.push(srcId);
    s.log.push({src:src.label,txt:(SOURCE_LOGS[srcId]||[src.label])[0],isRevision:true});
    showToast(`${src.icon} ${src.label} — ↻ Prior account revised. Contested cleared`);
  }
  else if (src.type==='terminal') {
    s.usedSources.push(srcId);
    s.log.push({src:src.label,txt:(SOURCE_LOGS[srcId]||[src.label])[0]});
    showToast(`${src.icon} ${src.label} — ★ Terminal lore recorded`);
  }
  else {
    s.knowledge = Math.min(4,prev+1);
    s.usedSources.push(srcId);
    const logs = SOURCE_LOGS[srcId]||[src.label];
    s.log.push({src:src.label,txt:logs[Math.floor(Math.random()*logs.length)]});
    showToast(`${src.icon} ${src.label} — Knowledge updated to ${s.knowledge}`);
  }

  s.status = computeStatus(s);
  s.isNew  = true;
  s._reconShown = false; // allow reconstruction re-trigger if reset then resolved again

  renderApiMock(srcId,id,s.knowledge,src.type);
  setSyncLabel(`Event received: ${src.event}`);
  saveState(); render();
}

// ════════════════════════════════════════════════════
// ACTIONS — TEACH NPC
// ════════════════════════════════════════════════════
function teachNPC(npcId, currentKnw) {
  S.npcs[npcId] = currentKnw+1;
  const npc = NPC_DEFS.find(n=>n.id===npcId);
  const s   = S.items[S.activeItem];
  s?.log.push({src:`You → ${npc.name}`,txt:'You share your findings. Their understanding shifts.'});
  setSyncLabel(`Knowledge spread → ${npc.name}`);
  saveState(); render();
  showToast(`${npc.icon} ${npc.name} now knows more`);
}

function teachNPCItem(npcId, itemId, currentKnw) {
  S.npcs[npcId] = Math.min(4,currentKnw+1);
  if (!S.npcTaught[npcId]) S.npcTaught[npcId]=[];
  if (!S.npcTaught[npcId].includes(itemId)) S.npcTaught[npcId].push(itemId);
  const npc  = NPC_DEFS.find(n=>n.id===npcId);
  const tmpl = getTemplate(itemId);
  showToast(`${npc.icon} ${npc.name} knows more about ${tmpl.names[0]}`);
  saveState(); renderNetwork();
}

// ════════════════════════════════════════════════════
// ACTIONS — SAVE NOTE
// ════════════════════════════════════════════════════
function saveNote() {
  const input = document.getElementById('note-input');
  if (!input) return;
  S.items[S.activeItem].note = input.value;
  setSyncLabel('Note synced');
  saveState();
  showToast('📝 Note saved — synced across all platforms');
}

// ════════════════════════════════════════════════════
// ACTIONS — RESET
// ════════════════════════════════════════════════════
function confirmReset(id) {
  if (!confirm('Reset this investigation? Notes will be kept. Progress and sources will be cleared. A memory trace will remain.')) return;
  resetItem(id);
}

function resetItem(id) {
  const s    = S.items[id];
  const tmpl = getTemplate(id);
  if (!s) return;
  const trace = s.log.length>0
    ? `[RESET] Prior investigation reached KNW ${s.knowledge} using ${s.usedSources.length} source(s). Log archived as memory trace.`
    : `[RESET] Investigation returned to KNW 0.`;

  S.items[id] = makeItemState({
    entryType:  s.entryType,
    customIcon: s.customIcon,
    customName: s.customName,
    note:       s.note,
    log: [
      {src:'System',txt:trace,isTrace:true},
      ...s.log.map(e=>({...e,isTrace:true})),
    ],
  });

  setSyncLabel(`Investigation reset: ${tmpl.names[0]}`);
  showToast(`↺ ${tmpl.icon} Investigation reset — memory trace preserved`);
  saveState(); render();
}

function reopenItem(id) {
  S.items[id].status='active';
  S.items[id].abandonment=null;
  setSyncLabel('Investigation reopened');
  showToast(`↺ Investigation reopened`);
  saveState(); render();
}

// ════════════════════════════════════════════════════
// ACTIONS — ARCHIVE / ABANDON
// ════════════════════════════════════════════════════
function openAbandonModal(id) {
  S.pendingAbandon=id;
  document.getElementById('abandon-note').value='';
  document.querySelectorAll('.abandon-btn').forEach(b=>b.classList.remove('active'));
  openModal('modal-abandon');
}

function confirmAbandon() {
  const id = S.pendingAbandon;
  if (!id) return;
  const s        = S.items[id];
  const activeEl = document.querySelector('.abandon-btn.active');
  const category = activeEl?.dataset.reason||'distraction';
  const note     = document.getElementById('abandon-note').value.trim();
  const isInjustice = ['coercion','extortion'].includes(category);

  s.status='archived';
  s.abandonment={
    category:{
      distraction:'Distraction',apprehension:'Apprehension',
      bribery:'Bribery',coercion:'Coercion',
      extortion:'Extortion',protective:'Protective Halt',
    }[category]||category,
    note:note||null,
    agent:null,
    injustice:isInjustice,
  };
  s.log.push({
    src:'System',
    txt:`[ARCHIVED — ${s.abandonment.category}]${isInjustice?' ACTIVE_INJUSTICE flag set.':''} ${note||''}`,
    isTrace:true,
  });

  closeModal('modal-abandon');
  showToast(`⊘ Investigation archived — ${s.abandonment.category}`);
  saveState(); render();
}

// ════════════════════════════════════════════════════
// ACTIONS — NEW INVESTIGATION
// ════════════════════════════════════════════════════
function openNewModal() {
  document.getElementById('new-item-name').value='';
  document.getElementById('new-item-note').value='';
  document.querySelectorAll('.entry-type-btn').forEach((b,i)=>b.classList.toggle('active',i===0));
  document.querySelectorAll('.icon-btn').forEach((b,i)=>b.classList.toggle('active',i===0));
  openModal('modal-new');
}

function confirmNewItem() {
  const name = document.getElementById('new-item-name').value.trim();
  if (!name) { showToast('Please enter a name for the investigation'); return; }

  const entryType = document.querySelector('.entry-type-btn.active')?.dataset.type||'physical';
  const icon      = document.querySelector('.icon-btn.active')?.dataset.icon||'🔮';
  const note      = document.getElementById('new-item-note').value.trim();

  const id = 'item_'+name.toLowerCase().replace(/[^a-z0-9]/g,'_').slice(0,18)+'_'+Date.now().toString(36);

  S.items[id] = makeItemState({
    entryType,
    customIcon: icon,
    customName: name,
    note,
    status: entryType==='echo'?'echoing':'active',
    log: note?[{src:'Player Observation',txt:note}]:[],
  });
  S.activeItem=id;

  closeModal('modal-new');
  showToast(`📖 New investigation opened: ${name}`);
  saveState(); switchTab('investigate'); render();
}

// ════════════════════════════════════════════════════
// RECONSTRUCTION MODAL
// ════════════════════════════════════════════════════
function showReconstruction(id) {
  const tmpl = getTemplate(id);
  document.getElementById('recon-item-name').textContent = tmpl.names[4];
  document.getElementById('recon-body').textContent       = tmpl.reconstruction;
  document.getElementById('recon-classification').textContent = tmpl.classification[4];
  openModal('modal-reconstruction');
}

// ════════════════════════════════════════════════════
// TAB SWITCHING
// ════════════════════════════════════════════════════
function switchTab(tab) {
  S.activeTab=tab;
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  document.querySelectorAll('.tab-content').forEach(c=>c.classList.toggle('active',c.id===`tab-${tab}`));
  if (tab==='journal')     renderJournal();
  if (tab==='network')     renderNetwork();
  if (tab==='board')       renderBoard();
  if (tab==='investigate') renderInvestigateTab();
}

// ════════════════════════════════════════════════════
// MODAL HELPERS
// ════════════════════════════════════════════════════
function openModal(id)  { const el=document.getElementById(id); if(el) el.style.display='flex'; }
function closeModal(id) { const el=document.getElementById(id); if(el) el.style.display='none'; }

// ════════════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════════════
let toastTimer;
function showToast(msg) {
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove('show'),3400);
}

// ════════════════════════════════════════════════════
// EVENT WIRING
// ════════════════════════════════════════════════════
function wireEvents() {

  // Tab buttons
  document.querySelectorAll('.tab-btn').forEach(b=>
    b.addEventListener('click',()=>switchTab(b.dataset.tab)));

  // Sidebar new item button
  document.getElementById('sidebar-add-btn')?.addEventListener('click',openNewModal);
  document.getElementById('empty-cta')?.addEventListener('click',openNewModal);

  // Journal toolbar
  document.getElementById('journal-filters')?.addEventListener('click',e=>{
    const b=e.target.closest('.filter-btn'); if(!b) return;
    document.querySelectorAll('.filter-btn').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    S.journalFilter=b.dataset.filter; renderJournal();
  });
  const jsearch = document.getElementById('journal-search');
  const sclear  = document.getElementById('search-clear');
  jsearch?.addEventListener('input',e=>{
    S.journalSearch=e.target.value;
    sclear.style.display=e.target.value?'block':'none';
    renderJournal();
  });
  sclear?.addEventListener('click',()=>{
    if(jsearch) jsearch.value='';
    S.journalSearch='';
    sclear.style.display='none';
    renderJournal();
  });
  document.getElementById('new-investigation-btn')?.addEventListener('click',openNewModal);

  // New item modal
  document.getElementById('modal-new-confirm')?.addEventListener('click',confirmNewItem);
  document.querySelectorAll('.entry-type-btn').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('.entry-type-btn').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
  }));
  document.querySelectorAll('.icon-btn').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('.icon-btn').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
  }));

  // Abandon modal
  document.getElementById('abandon-confirm')?.addEventListener('click',confirmAbandon);
  document.getElementById('abandon-grid')?.addEventListener('click',e=>{
    const b=e.target.closest('.abandon-btn'); if(!b) return;
    document.querySelectorAll('.abandon-btn').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
  });

  // Reconstruction modal
  document.getElementById('recon-close')?.addEventListener('click',()=>closeModal('modal-reconstruction'));

  // Settings
  document.getElementById('settings-btn')?.addEventListener('click',()=>openModal('modal-settings'));
  document.getElementById('settings-save')?.addEventListener('click',()=>{
    S.settings.backendUrl = document.getElementById('backend-url').value.trim();
    S.settings.playerId   = document.getElementById('player-id').value.trim()||'player_001';
    const activeMode = document.querySelector('.toggle-btn.active')?.dataset.mode||'demo';
    S.settings.mode = activeMode;
    closeModal('modal-settings');
    saveState(); showToast('⚙ Settings saved');
  });
  document.querySelectorAll('.toggle-btn').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('.toggle-btn').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
  }));

  // Universal modal close (data-close attribute & overlay click)
  document.querySelectorAll('[data-close]').forEach(b=>
    b.addEventListener('click',()=>closeModal(b.dataset.close)));
  document.querySelectorAll('.modal-overlay').forEach(overlay=>
    overlay.addEventListener('click',e=>{ if(e.target===overlay) closeModal(overlay.id); }));

  // Keyboard shortcuts
  document.addEventListener('keydown',e=>{
    if (e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return;
    if (e.key==='i'||e.key==='I') switchTab('investigate');
    if (e.key==='j'||e.key==='J') switchTab('journal');
    if (e.key==='n'||e.key==='N') switchTab('network');
    if (e.key==='b'||e.key==='B') switchTab('board');
    if (e.key==='Escape') {
      document.querySelectorAll('.modal-overlay').forEach(m=>{ if(m.style.display!=='none') closeModal(m.id); });
    }
  });

  // Keyboard hint
  const hint = document.createElement('div');
  hint.className='kbd-hint';
  hint.innerHTML='I — Investigate&nbsp;&nbsp;J — Journal&nbsp;&nbsp;N — Network&nbsp;&nbsp;B — Board&nbsp;&nbsp;Esc — Close';
  document.body.appendChild(hint);

  // Live clock
  setInterval(updateClock,1000);
}

// ════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════
(async () => {
  await loadState();
  wireEvents();
  switchTab(S.activeTab||'investigate');
  render();
  console.log('[The Living Codex] Initialised. Keyboard: I J N B Esc');
})();
