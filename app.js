// ============================================================
// BOODSCHAPPEN APP — app.js
// Firebase Auth (e-mail + wachtwoord) + Firestore realtime sync
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut as fbSignOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, collection, onSnapshot, setDoc, updateDoc,
  deleteDoc, addDoc, getDoc, serverTimestamp, query, orderBy, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── STATE ────────────────────────────────────────────────────
let currentUser       = null;
let householdId       = null;
let koppelCode        = null;
let items             = {};
let favs              = {};
let favOpenState      = {};   // bewaar open/dicht staat apart van Firestore data
let unsubItems        = null;
let unsubFavs         = null;
let goingInterval     = null;
let checkedOpen       = true;
let currentDealFilter = 'all';
let selectedEmoji     = '🛒';
let authMode          = 'login';
let activeItemId      = null;

// ── CAT DATA ─────────────────────────────────────────────────
const catWords = {
  zuivel:  ['melk','yoghurt','kwark','kaas','roomboter','eieren','slagroom','crème fraîche','skyr','kefir','vla','boter','karnemelk','ricotta'],
  sport:   ['proteïne','eiwitshake','creatine','pre-workout','proteinebar','proteineyoghurt','havermelk','amandelen','noten','cashews','walnoten','pindakaas'],
  groente: ['appel','banaan','tomaat','komkommer','paprika','spinazie','broccoli','wortel','sla','courgette','sinaasappel','aardappel','ui','knoflook','peer','druiven','snoeptomaatje','avocado','citroen','limoen'],
  vlees:   ['kip','gehakt','zalm','biefstuk','kipfilet','tonijn','garnalen','kalkoen','varkensvlees','vis','tartaar','shoarma','spek'],
  drank:   ['sap','cola','water','limonade','bier','wijn','thee','koffie','energiedrank','chocomel','ranja'],
};
const catMeta = {
  zuivel:  { label: 'Zuivel & koeling', icon: '🥛' },
  sport:   { label: 'Sportvoeding',      icon: '💪' },
  groente: { label: 'Groente & fruit',   icon: '🥦' },
  vlees:   { label: 'Vlees & vis',       icon: '🥩' },
  drank:   { label: 'Dranken',           icon: '🥤' },
  overig:  { label: 'Overig',            icon: '🛒' },
};
const catOrder = ['zuivel','sport','groente','vlees','drank','overig'];

function getCat(name) {
  const n = name.toLowerCase();
  for (const [cat, words] of Object.entries(catWords)) {
    if (words.some(w => n.includes(w))) return cat;
  }
  return 'overig';
}

// ── MOCK DEALS ───────────────────────────────────────────────
const DEALS = [
  { id:'d1', store:'ah',    name:'Optimel Kwark Aardbei 750g',  desc:'Was €2,49 → nu €1,79', pct:-28, catMatch:'zuivel'  },
  { id:'d2', store:'ah',    name:'Kipfilet (500g)',              desc:'Was €4,99 → nu €3,49', pct:-30, catMatch:'vlees'   },
  { id:'d3', store:'jumbo', name:'Skyr Naturel 450g',            desc:'Was €2,19 → nu €1,49', pct:-32, catMatch:'sport'   },
  { id:'d4', store:'jumbo', name:'Halfvolle melk 1L',            desc:'Was €1,09 → nu €0,89', pct:-18, catMatch:'zuivel'  },
  { id:'d5', store:'ah',    name:'Amandelen 200g',               desc:'Was €3,49 → nu €2,49', pct:-29, catMatch:'sport'   },
  { id:'d6', store:'jumbo', name:'Zalm filet (2 stuks)',         desc:'Was €5,99 → nu €4,29', pct:-28, catMatch:'vlees'   },
  { id:'d7', store:'ah',    name:'Broccoli (los)',               desc:'Was €0,99 → nu €0,69', pct:-30, catMatch:'groente' },
];

// ── KOPPELCODE ───────────────────────────────────────────────
function generateKoppelCode() {
  const n = Math.floor(100000 + Math.random() * 900000).toString();
  return n.slice(0,3) + '-' + n.slice(3);
}
async function isCodeTaken(code) {
  const snap = await getDocs(query(collection(db, 'households'), where('koppelCode', '==', code)));
  return !snap.empty;
}
async function generateUniqueCode() {
  let code, taken;
  do { code = generateKoppelCode(); taken = await isCodeTaken(code); } while (taken);
  return code;
}

// ── SCREENS ──────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById('screen-' + id).classList.remove('hidden');
}

// ── AUTH ─────────────────────────────────────────────────────
const authErrors = {
  'auth/invalid-email':        'Ongeldig e-mailadres.',
  'auth/user-not-found':       'Geen account gevonden.',
  'auth/wrong-password':       'Wachtwoord klopt niet.',
  'auth/invalid-credential':   'E-mail of wachtwoord klopt niet.',
  'auth/email-already-in-use': 'Dit e-mailadres is al in gebruik.',
  'auth/weak-password':        'Wachtwoord minimaal 6 tekens.',
  'auth/too-many-requests':    'Te veel pogingen, probeer later.',
};

window.switchAuthMode = function(mode) {
  authMode = mode;
  const reg = mode === 'register';
  document.getElementById('auth-title').textContent     = reg ? 'Account aanmaken' : 'Inloggen';
  document.getElementById('auth-btn-text').textContent  = reg ? 'Account aanmaken' : 'Inloggen';
  document.getElementById('auth-switch-text').innerHTML = reg
    ? 'Al een account? <a href="#" onclick="switchAuthMode(\'login\')">Inloggen</a>'
    : 'Nog geen account? <a href="#" onclick="switchAuthMode(\'register\')">Aanmaken</a>';
  document.getElementById('auth-forgot').style.display  = reg ? 'none' : '';
  document.getElementById('auth-error').classList.add('hidden');
};

window.handleAuth = async function() {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const btn      = document.getElementById('auth-btn-text');
  if (!email || !password) return;
  btn.textContent = '…';
  document.getElementById('auth-error').classList.add('hidden');
  try {
    if (authMode === 'register') {
      await createUserWithEmailAndPassword(auth, email, password);
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch(e) {
    const code = e.message.match(/auth\/[a-z-]+/)?.[0];
    const msg  = authErrors[code] || e.message;
    const el   = document.getElementById('auth-error');
    el.textContent = msg;
    el.classList.remove('hidden');
    btn.textContent = authMode === 'register' ? 'Account aanmaken' : 'Inloggen';
  }
};

window.handleForgotPassword = async function() {
  const email = document.getElementById('auth-email').value.trim();
  if (!email) { showAuthMsg('Vul eerst je e-mailadres in.'); return; }
  await sendPasswordResetEmail(auth, email);
  showAuthMsg('✓ Reset-link verstuurd!');
};

function showAuthMsg(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg; el.classList.remove('hidden');
}

// ── AUTH STATE ───────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    showScreen('loading');
    await ensureHousehold(user);
    initApp();
  } else {
    currentUser = null; householdId = null; koppelCode = null;
    if (unsubItems) unsubItems();
    if (unsubFavs)  unsubFavs();
    showScreen('auth');
  }
});

async function ensureHousehold(user) {
  const userRef = doc(db, 'users', user.uid);
  const snap    = await getDoc(userRef);
  if (snap.exists() && snap.data().householdId) {
    householdId = snap.data().householdId;
    const hSnap = await getDoc(doc(db, 'households', householdId));
    koppelCode  = hSnap.exists() ? hSnap.data().koppelCode : '???';
  } else {
    householdId = user.uid;
    koppelCode  = await generateUniqueCode();
    await setDoc(userRef, { householdId, email: user.email }, { merge: true });
    await setDoc(doc(db, 'households', householdId), { members: [user.uid], koppelCode, createdAt: serverTimestamp() }, { merge: true });
  }
}

window.signOut = async function() {
  await fbSignOut(auth);
  closeModal('modal-settings');
};

window.linkPartner = async function() {
  const code = document.getElementById('settings-partner-code').value.trim();
  if (!code) return;
  const snap = await getDocs(query(collection(db, 'households'), where('koppelCode', '==', code)));
  if (snap.empty) { alert('Koppelcode niet gevonden.'); return; }
  const targetId = snap.docs[0].id;
  if (targetId === householdId) { alert('Dit is al jouw eigen huishouden.'); return; }
  await updateDoc(doc(db, 'users', currentUser.uid), { householdId: targetId });
  householdId = targetId;
  if (unsubItems) unsubItems();
  if (unsubFavs)  unsubFavs();
  favOpenState = {};
  closeModal('modal-settings');
  initApp();
  alert('✓ Gekoppeld! Jullie zien nu dezelfde lijst.');
};

window.copyKoppelCode = function() {
  navigator.clipboard?.writeText(koppelCode);
  const el = document.getElementById('settings-koppelcode');
  const orig = el.textContent;
  el.textContent = '✓ Gekopieerd!';
  setTimeout(() => { el.textContent = orig; }, 1500);
};

// ── INIT APP ─────────────────────────────────────────────────
function initApp() {
  document.getElementById('settings-email').textContent      = currentUser.email;
  document.getElementById('settings-koppelcode').textContent = koppelCode;
  document.getElementById('avatars').innerHTML = `<div class="avatar avatar-me">${getInitial(currentUser.email)}</div>`;

  unsubItems = onSnapshot(
    query(collection(db, 'households', householdId, 'items'), orderBy('createdAt')),
    snap => {
      items = {};
      snap.forEach(d => { items[d.id] = { id: d.id, ...d.data() }; });
      renderList();
      document.getElementById('sync-status').textContent = 'Gesynchroniseerd · nu';
    },
    () => { document.getElementById('sync-status').textContent = 'Verbindingsfout'; }
  );

  unsubFavs = onSnapshot(
    collection(db, 'households', householdId, 'favorites'),
    snap => {
      favs = {};
      snap.forEach(d => { favs[d.id] = { id: d.id, ...d.data() }; });
      // Render alleen als de tab actief is
      if (document.getElementById('tab-favs').classList.contains('active')) {
        renderFavs();
      }
    }
  );

  renderDeals();
  showScreen('app');
}

function getInitial(e) { return (e || '?').charAt(0).toUpperCase(); }

// ── ITEMS ─────────────────────────────────────────────────────
window.toggleItem = async function(id) {
  const item = items[id]; if (!item) return;
  await updateDoc(doc(db, 'households', householdId, 'items', id), { checked: !item.checked });
};

window.clearChecked = async function() {
  const checked = Object.values(items).filter(i => i.checked);
  await Promise.all(checked.map(i => deleteDoc(doc(db, 'households', householdId, 'items', i.id))));
};

window.deleteItem = async function(id) {
  await deleteDoc(doc(db, 'households', householdId, 'items', id));
};

async function addItem(name) {
  const clean = name.trim(); if (!clean) return;
  await addDoc(collection(db, 'households', householdId, 'items'), {
    name: clean.charAt(0).toUpperCase() + clean.slice(1),
    cat: getCat(clean), checked: false,
    by: getInitial(currentUser.email),
    byName: currentUser.email.split('@')[0],
    deal: false, createdAt: serverTimestamp(),
  });
}

// ── AI INPUT ─────────────────────────────────────────────────
window.handleAIInput = async function() {
  const val = document.getElementById('ai-input').value.trim(); if (!val) return;
  const btn = document.getElementById('ai-btn');
  const parsing = document.getElementById('ai-parsing');
  btn.disabled = true; parsing.classList.remove('hidden');
  try {
    const parsed = await parseWithClaude(val);
    for (const name of parsed) await addItem(name);
    document.getElementById('ai-input').value = '';
  } catch {
    const parts = val.split(/[,&]+|\ben\b/i).map(s => s.trim()).filter(s => s.length > 1);
    for (const p of parts) await addItem(p);
    document.getElementById('ai-input').value = '';
  } finally {
    btn.disabled = false; parsing.classList.add('hidden');
  }
};

async function parseWithClaude(text) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': 'JOUW_ANTHROPIC_API_KEY', 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6', max_tokens: 200,
      system: 'Je bent een boodschappen-assistent. Geef ALLEEN een JSON-array van productnamen terug, geen markdown. Voorbeeld: ["Melk","Eieren"]',
      messages: [{ role: 'user', content: text }],
    }),
  });
  const data = await resp.json();
  return JSON.parse((data.content?.[0]?.text || '[]').replace(/```json|```/g,'').trim());
}

// ── RENDER LIST ───────────────────────────────────────────────
function renderList() {
  const todo = Object.values(items).filter(i => !i.checked);
  const done = Object.values(items).filter(i => i.checked);

  document.getElementById('todo-count').textContent = todo.length + ' items';
  document.getElementById('done-count').textContent = done.length;
  document.getElementById('empty-state').classList.toggle('hidden', todo.length > 0);

  let html = '';
  catOrder.forEach(cat => {
    const group = todo.filter(i => i.cat === cat);
    if (!group.length) return;
    html += `<div class="cat-header">${catMeta[cat].icon} ${catMeta[cat].label}</div><div class="items-list">`;
    group.forEach(item => { html += itemHTML(item); });
    html += `</div>`;
  });
  document.getElementById('todo-groups').innerHTML = html;

  document.getElementById('checked-section').classList.toggle('hidden', done.length === 0);
  document.getElementById('list-done').innerHTML = done.map(itemHTML).join('');
  document.getElementById('checked-body').style.display = checkedOpen ? '' : 'none';
  document.getElementById('checked-chevron').classList.toggle('open', checkedOpen);
}

function itemHTML(item) {
  const m = catMeta[item.cat] || catMeta.overig;
  return `<div class="item-card ${item.checked ? 'checked' : ''}" data-id="${item.id}">
    <div class="check-circle" onclick="toggleItem('${item.id}')">✓</div>
    <div class="item-info">
      <div class="item-name">${escHtml(item.name)}</div>
      <div class="item-by">door ${escHtml(item.byName || item.by || '?')}</div>
    </div>
    ${item.deal ? '<span class="item-deal-dot"></span>' : ''}
    <span class="item-cat cat-${item.cat}">${m.label.split(' ')[0].toLowerCase()}</span>
    <div class="item-actions">
      <button class="item-btn-fav" onclick="openItemFav('${item.id}')">⭐</button>
      <button class="item-btn-del" onclick="deleteItem('${item.id}')">🗑️</button>
    </div>
  </div>`;
}

window.toggleChecked = function() {
  checkedOpen = !checkedOpen;
  document.getElementById('checked-body').style.display = checkedOpen ? '' : 'none';
  document.getElementById('checked-chevron').classList.toggle('open', checkedOpen);
};

// ── ITEM → FAVORIET ───────────────────────────────────────────
window.openItemFav = function(id) {
  activeItemId = id;
  const item = items[id]; if (!item) return;
  const favList = Object.values(favs);

  if (favList.length === 0) {
    // Geen lijsten: maak nieuwe aan, daarna voeg product toe
    openModal('modal-new-fav');
    return;
  }

  document.getElementById('pick-fav-list').innerHTML = favList.map(f => `
    <div class="pick-fav-row" onclick="addItemToFav('${f.id}')">
      <span class="pick-fav-emoji">${f.emoji || '⭐'}</span>
      <div>
        <div class="pick-fav-name">${escHtml(f.name)}</div>
        <div class="pick-fav-count">${(f.items||[]).length} producten</div>
      </div>
    </div>`).join('');

  openModal('modal-pick-fav');
};

window.addItemToFav = async function(favId) {
  const f    = favs[favId];
  const item = items[activeItemId];
  if (!f || !item) return;
  closeModal('modal-pick-fav');
  if (!(f.items||[]).includes(item.name)) {
    await updateDoc(doc(db, 'households', householdId, 'favorites', favId), {
      items: [...(f.items||[]), item.name]
    });
  }
  // Bevestiging op de kaart
  const nameEl = document.querySelector(`[data-id="${activeItemId}"] .item-name`);
  if (nameEl) {
    const orig = nameEl.textContent;
    nameEl.textContent = '✓ Toegevoegd aan favoriet';
    nameEl.style.color = 'var(--green)';
    setTimeout(() => { nameEl.textContent = orig; nameEl.style.color = ''; }, 1500);
  }
};

window.pickFavNew = function() {
  closeModal('modal-pick-fav');
  openModal('modal-new-fav');
};

// ── FAVORITES ─────────────────────────────────────────────────
function renderFavs() {
  const list = Object.values(favs);
  const emptyEl = document.getElementById('fav-empty');
  const listEl  = document.getElementById('fav-list');

  if (list.length === 0) {
    listEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  listEl.innerHTML = list.map(f => {
    const isOpen    = favOpenState[f.id] || false;
    const itemsHtml = (f.items || []).map((item, idx) => `
      <div class="fav-item-row">
        <span class="fav-item-name">${escHtml(item)}</span>
        <button class="btn-add-single" onclick="addSingleFav('${f.id}',${idx})">+ Lijst</button>
        <button class="btn-fav-delete" onclick="removeFavItem('${f.id}',${idx})">✕</button>
      </div>`).join('');
    return `
      <div class="fav-card">
        <div class="fav-header" onclick="toggleFav('${f.id}')">
          <div class="fav-emoji" style="background:${f.bg||'#F3F3F1'}">${f.emoji||'⭐'}</div>
          <div>
            <div class="fav-name">${escHtml(f.name)}</div>
            <div class="fav-count">${(f.items||[]).length} producten</div>
          </div>
          <div class="fav-header-right">
            <button class="btn-add-all" onclick="event.stopPropagation(); addAllFav('${f.id}')">Voeg alles toe</button>
            <span class="fav-chevron ${isOpen?'open':''}">▾</span>
          </div>
        </div>
        <div class="fav-body ${isOpen?'open':''}">
          ${itemsHtml}
          <div class="fav-add-row">
            <input class="fav-add-input" id="fav-inp-${f.id}" placeholder="Product toevoegen…"
              onkeydown="if(event.key==='Enter') addToFav('${f.id}')" />
            <button class="btn-fav-confirm" onclick="addToFav('${f.id}')">+</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

window.toggleFav = function(id) {
  favOpenState[id] = !favOpenState[id];
  renderFavs();
};
window.addAllFav = async function(id) {
  const f = favs[id]; if (!f) return;
  for (const n of (f.items||[])) await addItem(n);
  switchTab('list');
};
window.addSingleFav = async function(favId, idx) {
  const f = favs[favId]; if (!f) return;
  await addItem(f.items[idx]);
  switchTab('list');
};
window.removeFavItem = async function(favId, idx) {
  const f = favs[favId]; if (!f) return;
  const updated = [...(f.items||[])]; updated.splice(idx, 1);
  await updateDoc(doc(db, 'households', householdId, 'favorites', favId), { items: updated });
};
window.addToFav = async function(favId) {
  const input = document.getElementById('fav-inp-' + favId);
  const val   = input?.value.trim(); if (!val) return;
  const f = favs[favId]; if (!f) return;
  await updateDoc(doc(db, 'households', householdId, 'favorites', favId), {
    items: [...(f.items||[]), val.charAt(0).toUpperCase() + val.slice(1)]
  });
  if (input) input.value = '';
};

// ── NEW FAV LIST ──────────────────────────────────────────────
const EMOJIS = ['🥛','🥩','🥦','💪','🍳','🛒','🥗','🍺','🧃','🍰','🐟','🌿','🧴','🏠'];

window.openNewFavModal = function() {
  document.getElementById('modal-fav-name').value = '';
  selectedEmoji = '🛒';
  document.getElementById('emoji-grid').innerHTML = EMOJIS.map((e,i) =>
    `<div class="emoji-opt ${i===12?'selected':''}" onclick="selectEmoji(this,'${e}')">${e}</div>`
  ).join('');
  openModal('modal-new-fav');
};
window.selectEmoji = function(el, emoji) {
  document.querySelectorAll('.emoji-opt').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected'); selectedEmoji = emoji;
};
window.createFavList = async function() {
  const name = document.getElementById('modal-fav-name').value.trim(); if (!name) return;
  const newDoc = await addDoc(collection(db, 'households', householdId, 'favorites'), {
    name, emoji: selectedEmoji, bg: '#F3F3F1', items: [], createdAt: serverTimestamp()
  });
  closeModal('modal-new-fav');
  // Als er een pending item is, voeg dat direct toe
  if (activeItemId && items[activeItemId]) {
    const item = items[activeItemId];
    await updateDoc(doc(db, 'households', householdId, 'favorites', newDoc.id), {
      items: [item.name]
    });
    activeItemId = null;
  }
};

// ── DEALS ─────────────────────────────────────────────────────
function renderDeals() {
  const listItems = Object.values(items);
  const filtered  = DEALS.filter(d => {
    if (currentDealFilter === 'match') return listItems.some(i => i.cat === d.catMatch);
    if (currentDealFilter !== 'all')   return d.store === currentDealFilter;
    return true;
  });
  document.getElementById('deals-match-count').textContent = '';
  document.getElementById('deals-badge').classList.add('hidden');
  document.getElementById('deals-list').innerHTML = filtered.map(d => `
    <div class="deal-card">
      <span class="deal-store-badge store-${d.store}">${d.store==='ah'?'AH':'Jumbo'}</span>
      <div class="deal-info">
        <div class="deal-name">${escHtml(d.name)}</div>
        <div class="deal-desc">${escHtml(d.desc)}</div>
      </div>
      <span class="deal-pct">${d.pct}%</span>
      <button class="btn-add-deal" onclick="addDeal('${escHtml(d.name)}')">+ Lijst</button>
    </div>`).join('');
}
window.filterDeals = function(filter) {
  currentDealFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
  renderDeals();
};
window.addDeal = async function(name) {
  await addDoc(collection(db, 'households', householdId, 'items'), {
    name, cat: getCat(name), checked: false,
    by: getInitial(currentUser.email), byName: currentUser.email.split('@')[0],
    deal: true, createdAt: serverTimestamp(),
  });
  switchTab('list');
};

// ── GOING SHOPPING ────────────────────────────────────────────
window.openGoingModal = function() { openModal('modal-going'); };
window.startGoing = async function() {
  closeModal('modal-going');
  await setDoc(doc(db, 'households', householdId, 'notifications', 'going'), {
    who: currentUser.email.split('@')[0], startedAt: serverTimestamp()
  });
  const banner = document.getElementById('going-banner');
  document.getElementById('going-who').textContent = `${currentUser.email.split('@')[0]} gaat zo boodschappen doen!`;
  banner.classList.remove('hidden');
  let secs = 600;
  clearInterval(goingInterval);
  goingInterval = setInterval(() => {
    secs--;
    const m = Math.floor(secs/60), s = secs%60;
    document.getElementById('going-timer').textContent = m + ':' + String(s).padStart(2,'0');
    if (secs <= 0) { clearInterval(goingInterval); banner.classList.add('hidden'); }
  }, 1000);
};

// ── ADD MODAL ─────────────────────────────────────────────────
window.openAddModal = function() {
  document.getElementById('modal-add-input').value = '';
  document.getElementById('modal-add-preview').innerHTML = '';
  openModal('modal-add');
  setTimeout(() => document.getElementById('modal-add-input').focus(), 100);
};
window.addFromModal = async function() {
  const val = document.getElementById('modal-add-input').value.trim();
  if (!val) return;
  await addItem(val);
  closeModal('modal-add');
};

// ── SETTINGS ─────────────────────────────────────────────────
window.openSettingsModal = function() { openModal('modal-settings'); };

// ── TABS ──────────────────────────────────────────────────────
window.switchTab = function(tab) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.getElementById('tab-' + tab).classList.add('active');
  if (tab === 'deals') renderDeals();
  if (tab === 'favs')  renderFavs();
};

// ── MODALS ────────────────────────────────────────────────────
window.openModal  = function(id) { document.getElementById(id)?.classList.remove('hidden'); };
window.closeModal = function(id) { document.getElementById(id)?.classList.add('hidden'); };
document.addEventListener('click', e => { if (e.target.classList.contains('modal-bg')) e.target.classList.add('hidden'); });

// ── DOM READY ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('auth-password')?.addEventListener('keydown', e => { if (e.key==='Enter') handleAuth(); });
  document.getElementById('modal-add-input')?.addEventListener('input', function() {
    const val = this.value.trim();
    const prev = document.getElementById('modal-add-preview');
    if (val.length < 2) { prev.innerHTML = ''; return; }
    const cat = getCat(val);
    prev.innerHTML = `<div class="preview-item"><span class="preview-check">✓</span>${escHtml(val)}<span class="item-cat cat-${cat}" style="margin-left:auto">${catMeta[cat].label.split(' ')[0].toLowerCase()}</span></div>`;
  });
  document.getElementById('modal-add-input')?.addEventListener('keydown', e => { if (e.key==='Enter') addFromModal(); });
  document.getElementById('ai-input')?.addEventListener('keydown', e => { if (e.key==='Enter') handleAIInput(); });
});

// ── UTILS ─────────────────────────────────────────────────────
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
