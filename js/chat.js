import { auth, db, CLOUDINARY_CLOUD, CLOUDINARY_PRESET } from './firebase.js';
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, doc, getDoc, setDoc, addDoc, query, where, orderBy,
  onSnapshot, serverTimestamp, getDocs, updateDoc, limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let currentUser = null;
let currentChatId = null;
let unsubMessages = null;
let unsubConvs = null;

// ─── Init ─────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = 'index.html'; return; }
  currentUser = user;

  // Load or create profile
  const profileRef = doc(db, 'profiles', user.uid);
  const profileSnap = await getDoc(profileRef);
  let username = user.email.split('@')[0];
  if (profileSnap.exists()) {
    username = profileSnap.data().username || username;
  } else {
    await setDoc(profileRef, { username, email: user.email, last_seen: serverTimestamp() });
  }

  document.getElementById('myUsername').textContent = username;
  document.getElementById('myAvatar').textContent = initials(username);
  document.getElementById('logoutBtn').addEventListener('click', () => signOut(auth).then(() => window.location.href = 'index.html'));

  // Ping last_seen every 10 seconds
  await updateDoc(profileRef, { last_seen: serverTimestamp() });
  setInterval(() => updateDoc(profileRef, { last_seen: serverTimestamp() }), 10000);

  // Auto logout after 30 min inactivity
  let inactivityTimer;
  function resetTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => signOut(auth).then(() => window.location.href = 'index.html'), 30 * 60 * 1000);
  }
  ['click','keydown','mousemove','touchstart'].forEach(e => document.addEventListener(e, resetTimer, true));
  resetTimer();

  setupSearch();
  loadConversations();
});

// ─── Search ───────────────────────────────────────────────────────────────────
function setupSearch() {
  const input = document.getElementById('searchInput');
  const results = document.getElementById('searchResults');
  let timeout;
  input.addEventListener('input', () => {
    clearTimeout(timeout);
    const q = input.value.trim().toLowerCase();
    if (!q) { results.classList.add('hidden'); return; }
    timeout = setTimeout(() => searchUsers(q), 300);
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrap')) results.classList.add('hidden');
  });
}

async function searchUsers(q) {
  const results = document.getElementById('searchResults');
  const snap = await getDocs(collection(db, 'profiles'));
  const matches = snap.docs
    .filter(d => d.id !== currentUser.uid && d.data().username?.toLowerCase().includes(q))
    .slice(0, 8);

  if (!matches.length) {
    results.innerHTML = '<div style="padding:10px 12px;font-size:13px;color:#9ca3af">Sin resultados</div>';
    results.classList.remove('hidden');
    return;
  }
  results.innerHTML = matches.map(d => `
    <div class="search-result-item" onclick="startConversation('${d.id}','${d.data().username}')">
      <div class="avatar-sm" style="width:28px;height:28px;font-size:10px">${initials(d.data().username)}</div>
      <span>${d.data().username}</span>
    </div>
  `).join('');
  results.classList.remove('hidden');
}

// ─── Conversations ────────────────────────────────────────────────────────────
function loadConversations() {
  if (unsubConvs) unsubConvs();
  const q = query(collection(db, 'conversations'), where('members', 'array-contains', currentUser.uid));
  unsubConvs = onSnapshot(q, async (snap) => {
    const list = document.getElementById('chatList');
    list.innerHTML = '';
    if (snap.empty) {
      list.innerHTML = '<div class="empty-state">No hay conversaciones aún.<br>Busca un usuario para empezar.</div>';
      return;
    }
    for (const convDoc of snap.docs) {
      const data = convDoc.data();
      const otherId = data.members.find(m => m !== currentUser.uid);
      if (!otherId) continue;
      const otherSnap = await getDoc(doc(db, 'profiles', otherId));
      const other = otherSnap.data();
      const username = other?.username || 'Usuario';
      const lastSeen = other?.last_seen?.toDate();
      const isOnline = lastSeen && (new Date() - lastSeen) < 20000;
      const diff = lastSeen ? Math.floor((new Date() - lastSeen) / 1000) : null;
      let lastSeenLabel = '';
      if (diff !== null) {
        if (diff < 20) lastSeenLabel = '<div style="color:#22c55e;font-size:11px;margin-top:1px;">En línea</div>';
        else if (diff < 3600) lastSeenLabel = `<div style="font-size:11px;color:var(--text-muted);margin-top:1px;">Hace ${Math.floor(diff/60)} min</div>`;
        else if (diff < 86400) lastSeenLabel = `<div style="font-size:11px;color:var(--text-muted);margin-top:1px;">Hace ${Math.floor(diff/3600)} h</div>`;
        else lastSeenLabel = `<div style="font-size:11px;color:var(--text-muted);margin-top:1px;">Últ. vez ${lastSeen.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}</div>`;
      }
      const preview = data.lastMessage || 'Sin mensajes aún';
      const item = document.createElement('div');
      item.className = 'chat-item' + (convDoc.id === currentChatId ? ' active' : '');
      item.dataset.convId = convDoc.id;
      item.innerHTML = `
        <div style="position:relative;flex-shrink:0;">
          <div class="avatar">${initials(username)}</div>
          ${isOnline ? `<div style="position:absolute;bottom:1px;right:1px;width:10px;height:10px;background:#22c55e;border-radius:50%;border:2px solid var(--sidebar-bg);"></div>` : ''}
        </div>
        <div class="chat-item-info">
          <div class="chat-item-name">${username}</div>
          <div class="chat-item-preview">${escapeHtml(String(preview))}</div>
          ${lastSeenLabel}
        </div>
      `;
      item.addEventListener('click', () => openChat(convDoc.id, username, otherId));
      list.appendChild(item);
    }
  });
}

async function startConversation(otherId, otherUsername) {
  document.getElementById('searchInput').value = '';
  document.getElementById('searchResults').classList.add('hidden');

  // Check if conversation exists
  const q = query(collection(db, 'conversations'), where('members', 'array-contains', currentUser.uid));
  const snap = await getDocs(q);
  const existing = snap.docs.find(d => d.data().members.includes(otherId));

  if (existing) {
    openChat(existing.id, otherUsername, otherId);
    return;
  }

  const convRef = await addDoc(collection(db, 'conversations'), {
    members: [currentUser.uid, otherId],
    lastMessage: '',
    updatedAt: serverTimestamp()
  });
  openChat(convRef.id, otherUsername, otherId);
}

// ─── Open Chat ────────────────────────────────────────────────────────────────
async function openChat(convId, username, otherId) {
  currentChatId = convId;
  document.querySelectorAll('.chat-item').forEach(el => el.classList.toggle('active', el.dataset.convId === convId));
  document.querySelector('.sidebar').classList.add('hidden-mobile');
  document.getElementById('mainArea').classList.add('visible-mobile');

  // Get other user's last seen
  const otherSnap = await getDoc(doc(db, 'profiles', otherId));
  const other = otherSnap.data();
  const lastSeen = other?.last_seen?.toDate();
  const diff = lastSeen ? Math.floor((new Date() - lastSeen) / 1000) : null;
  let lastSeenText = '';
  if (diff !== null) {
    if (diff < 20) lastSeenText = 'En línea';
    else if (diff < 3600) lastSeenText = `Hace ${Math.floor(diff/60)} min`;
    else if (diff < 86400) lastSeenText = `Hace ${Math.floor(diff/3600)} h`;
    else lastSeenText = `Últ. vez ${lastSeen.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}`;
  }
  const isOnline = diff !== null && diff < 20;

  const main = document.getElementById('mainArea');
  main.innerHTML = `
    <div class="chat-view">
      <div class="chat-top">
        <button class="back-btn" onclick="goBack()" aria-label="Volver">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style="position:relative;flex-shrink:0;">
          <div class="avatar">${initials(username)}</div>
          ${isOnline ? `<div style="position:absolute;bottom:1px;right:1px;width:10px;height:10px;background:#22c55e;border-radius:50%;border:2px solid var(--surface);"></div>` : ''}
        </div>
        <div>
          <div class="chat-top-name">${username}</div>
          ${lastSeenText ? `<div style="font-size:11px;color:${isOnline ? '#22c55e' : 'var(--text-muted)'};margin-top:1px;">${lastSeenText}</div>` : ''}
        </div>
      </div>
      <div class="messages-area" id="messagesArea"></div>
      <div class="input-row">
        <label class="attach-btn" aria-label="Adjuntar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          <input type="file" id="mediaInput" accept="image/*,video/*" style="display:none"/>
        </label>
        <input type="text" class="msg-input" id="msgInput" placeholder="Escribe un mensaje..." autocomplete="off"/>
        <button class="send-btn" id="sendBtn" aria-label="Enviar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  `;

  document.getElementById('msgInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(convId); });
  document.getElementById('sendBtn').addEventListener('click', () => sendMessage(convId));
  document.getElementById('mediaInput').addEventListener('change', (e) => handleMediaUpload(e, convId));

  loadMessages(convId);
  markMessagesAsRead(convId);
}

function goBack() {
  document.querySelector('.sidebar').classList.remove('hidden-mobile');
  document.getElementById('mainArea').classList.remove('visible-mobile');
}
window.goBack = goBack;

// ─── Messages ────────────────────────────────────────────────────────────────
function loadMessages(convId) {
  if (unsubMessages) unsubMessages();
  const q = query(
    collection(db, 'conversations', convId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(100)
  );
  unsubMessages = onSnapshot(q, (snap) => {
    const area = document.getElementById('messagesArea');
    if (!area) return;
    area.innerHTML = '';
    let lastDate = '';
    snap.docs.forEach(d => {
      const msg = { id: d.id, ...d.data() };
      const date = msg.createdAt?.toDate();
      if (date) {
        const dateStr = date.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
        if (dateStr !== lastDate) {
          area.innerHTML += `<div class="date-sep"><span>${dateStr}</span></div>`;
          lastDate = dateStr;
        }
      }
      appendMessageEl(area, msg);
    });
    area.scrollTop = area.scrollHeight;
  });
}

function appendMessageEl(area, msg) {
  const mine = msg.senderId === currentUser.uid;
  const date = msg.createdAt?.toDate();
  const timeStr = date ? date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '';
  const div = document.createElement('div');
  div.className = `msg-row ${mine ? 'mine' : ''}`;
  div.dataset.msgId = msg.id;

  const checks = mine ? `<span class="msg-checks" style="font-size:13px;margin-left:2px;${msg.readAt ? 'color:#378ADD;' : 'color:rgba(255,255,255,0.6);'}">${msg.readAt ? '✓✓' : '✓'}</span>` : '';

  let bubbleContent = '';
  if (msg.mediaUrl) {
    if (msg.mediaType?.startsWith('video')) {
      bubbleContent = `<video src="${msg.mediaUrl}" controls style="max-width:100%;max-height:220px;border-radius:8px;display:block;"></video>
        <button onclick="downloadMedia('${msg.mediaUrl}')" style="display:inline-flex;align-items:center;gap:5px;margin-top:5px;font-size:12px;color:inherit;opacity:0.75;background:none;border:none;cursor:pointer;padding:0;font-family:inherit;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Descargar
        </button>`;
    } else {
      bubbleContent = `<img src="${msg.mediaUrl}" style="max-width:100%;max-height:220px;border-radius:8px;display:block;cursor:pointer;" onclick="window.open('${msg.mediaUrl}','_blank')"/>
        <button onclick="downloadMedia('${msg.mediaUrl}')" style="display:inline-flex;align-items:center;gap:5px;margin-top:5px;font-size:12px;color:inherit;opacity:0.75;background:none;border:none;cursor:pointer;padding:0;font-family:inherit;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Descargar
        </button>`;
    }
    if (msg.content) bubbleContent += `<div style="margin-top:4px;">${escapeHtml(msg.content)}</div>`;
  } else {
    bubbleContent = escapeHtml(msg.content || '');
  }

  div.innerHTML = `
    ${!mine ? `<div class="msg-avatar">?</div>` : ''}
    <div class="bubble ${mine ? 'mine' : 'theirs'}">${bubbleContent}</div>
    <div class="msg-time">${timeStr}${checks}</div>
  `;
  area.appendChild(div);
}

async function sendMessage(convId) {
  const input = document.getElementById('msgInput');
  const content = input.value.trim();
  if (!content || !convId) return;
  input.value = '';

  const msgRef = await addDoc(collection(db, 'conversations', convId, 'messages'), {
    content,
    senderId: currentUser.uid,
    createdAt: serverTimestamp(),
    readAt: null,
    mediaUrl: null,
    mediaType: null
  });

  await updateDoc(doc(db, 'conversations', convId), {
    lastMessage: content,
    updatedAt: serverTimestamp()
  });
}

async function markMessagesAsRead(convId) {
  const q = query(
    collection(db, 'conversations', convId, 'messages'),
    where('senderId', '!=', currentUser.uid),
    where('readAt', '==', null)
  );
  const snap = await getDocs(q);
  snap.docs.forEach(d => updateDoc(d.ref, { readAt: serverTimestamp() }));
}

// ─── Media Upload ─────────────────────────────────────────────────────────────
async function handleMediaUpload(e, convId) {
  const file = e.target.files[0];
  if (!file || !convId) return;
  e.target.value = '';

  const area = document.getElementById('messagesArea');
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'msg-row mine';
  loadingDiv.innerHTML = '<div class="bubble mine" style="opacity:0.6;font-size:12px;">Subiendo...</div>';
  area?.appendChild(loadingDiv);
  if (area) area.scrollTop = area.scrollHeight;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_PRESET);

  const resourceType = file.type.startsWith('video') ? 'video' : 'image';
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/${resourceType}/upload`, {
    method: 'POST',
    body: formData
  });
  const data = await res.json();
  loadingDiv.remove();

  if (!data.secure_url) { alert('Error al subir archivo'); return; }

  const preview = file.type.startsWith('video') ? '🎥 Video' : '📷 Foto';
  await addDoc(collection(db, 'conversations', convId, 'messages'), {
    content: '',
    senderId: currentUser.uid,
    createdAt: serverTimestamp(),
    readAt: null,
    mediaUrl: data.secure_url,
    mediaType: file.type
  });

  await updateDoc(doc(db, 'conversations', convId), {
    lastMessage: preview,
    updatedAt: serverTimestamp()
  });
}

async function downloadMedia(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const ext = url.split('.').pop().split('?')[0];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `media_${Date.now()}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch(e) {
    window.open(url, '_blank');
  }
}
window.downloadMedia = downloadMedia;

// ─── Utils ────────────────────────────────────────────────────────────────────
function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}
function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
window.startConversation = startConversation;
