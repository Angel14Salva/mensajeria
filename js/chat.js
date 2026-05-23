let currentUser = null;
let currentConversationId = null;
let realtimeChannel = null;

// ─── Init ───────────────────────────────────────────────────────────────────
async function init() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = 'index.html'; return; }
  currentUser = session.user;

  // Load username from profile
  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('username')
    .eq('id', currentUser.id)
    .single();

  const username = profile?.username || currentUser.email.split('@')[0];
  document.getElementById('myUsername').textContent = username;
  document.getElementById('myAvatar').textContent = initials(username);

  document.getElementById('logoutBtn').addEventListener('click', logout);
  setupSearch();
  loadConversations();
}

// ─── Logout ──────────────────────────────────────────────────────────────────
async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
}

// ─── Search users ────────────────────────────────────────────────────────────
function setupSearch() {
  const input = document.getElementById('searchInput');
  const results = document.getElementById('searchResults');
  let timeout;

  input.addEventListener('input', () => {
    clearTimeout(timeout);
    const q = input.value.trim();
    if (!q) { results.classList.add('hidden'); return; }
    timeout = setTimeout(() => searchUsers(q), 300);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrap')) results.classList.add('hidden');
  });
}

async function searchUsers(q) {
  const results = document.getElementById('searchResults');
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('id, username')
    .ilike('username', `%${q}%`)
    .neq('id', currentUser.id)
    .limit(8);

  if (error || !data?.length) {
    results.innerHTML = '<div style="padding:10px 12px;font-size:13px;color:#9ca3af">Sin resultados</div>';
    results.classList.remove('hidden');
    return;
  }

  results.innerHTML = data.map(u => `
    <div class="search-result-item" onclick="startConversation('${u.id}','${u.username}')">
      <div class="avatar-sm" style="width:28px;height:28px;font-size:10px">${initials(u.username)}</div>
      <span>${u.username}</span>
    </div>
  `).join('');
  results.classList.remove('hidden');
}

// ─── Conversations ────────────────────────────────────────────────────────────
async function loadConversations() {
  const { data, error } = await supabaseClient
    .from('conversation_members')
    .select(`
      conversation_id,
      conversations (
        id,
        conversation_members (
          profiles ( id, username )
        )
      )
    `)
    .eq('user_id', currentUser.id);

  if (error || !data?.length) return;

  const list = document.getElementById('chatList');
  list.innerHTML = '';

  for (const row of data) {
    const conv = row.conversations;
    const other = conv.conversation_members
      .map(m => m.profiles)
      .find(p => p.id !== currentUser.id);
    if (!other) continue;

    const item = document.createElement('div');
    item.className = 'chat-item';
    item.dataset.convId = conv.id;
    item.dataset.userId = other.id;
    item.dataset.username = other.username;
    item.innerHTML = `
      <div class="avatar">${initials(other.username)}</div>
      <div class="chat-item-info">
        <div class="chat-item-name">${other.username}</div>
        <div class="chat-item-preview" id="preview-${conv.id}">...</div>
      </div>
    `;
    item.addEventListener('click', () => openChat(conv.id, other.username));
    list.appendChild(item);
    loadPreview(conv.id);
  }
}

async function loadPreview(convId) {
  const { data } = await supabaseClient
    .from('messages')
    .select('content')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: false })
    .limit(1);
  const el = document.getElementById(`preview-${convId}`);
  if (el && data?.[0]) el.textContent = data[0].content;
  else if (el) el.textContent = 'Sin mensajes aún';
}

async function startConversation(otherUserId, otherUsername) {
  document.getElementById('searchInput').value = '';
  document.getElementById('searchResults').classList.add('hidden');

  // Find existing conversation manually (no RPC)
  const { data: myConvs } = await supabaseClient
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', currentUser.id);

  const { data: theirConvs } = await supabaseClient
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', otherUserId);

  const myIds = new Set((myConvs || []).map(r => r.conversation_id));
  const shared = (theirConvs || []).find(r => myIds.has(r.conversation_id));

  let convId = shared?.conversation_id;

  if (!convId) {
    const { data: newConv, error } = await supabaseClient
      .from('conversations')
      .insert({})
      .select('id')
      .single();

    if (error || !newConv) {
      alert('Error al crear conversación: ' + (error?.message || 'desconocido'));
      return;
    }

    convId = newConv.id;

    await supabaseClient.from('conversation_members').insert([
      { conversation_id: convId, user_id: currentUser.id },
      { conversation_id: convId, user_id: otherUserId }
    ]);

    loadConversations();
  }

  openChat(convId, otherUsername);
}

// ─── Open Chat ───────────────────────────────────────────────────────────────
function goBack() {
  document.querySelector('.sidebar').classList.remove('hidden-mobile');
  document.getElementById('mainArea').classList.remove('visible-mobile');
}

async function openChat(convId, username) {
  currentConversationId = convId;

  document.querySelectorAll('.chat-item').forEach(el => {
    el.classList.toggle('active', el.dataset.convId === String(convId));
  });

  // Mobile: show chat, hide sidebar
  document.querySelector('.sidebar').classList.add('hidden-mobile');
  document.getElementById('mainArea').classList.add('visible-mobile');

  const main = document.getElementById('mainArea');
  main.innerHTML = `
    <div class="chat-view">
      <div class="chat-top">
        <button class="back-btn" onclick="goBack()" aria-label="Volver">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="avatar">${initials(username)}</div>
        <div class="chat-top-name">${username}</div>
      </div>
      <div class="messages-area" id="messagesArea"></div>
      <div class="input-row" style="position:relative;">
        <button id="emojiBtn" class="emoji-btn" aria-label="Emojis">😊</button>
        <input type="text" class="msg-input" id="msgInput" placeholder="Escribe un mensaje..." autocomplete="off"/>
        <button class="send-btn" onclick="sendMessage()" aria-label="Enviar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
        <div id="emojiPickerWrap" style="display:none;position:absolute;top:56px;left:0;right:0;z-index:100;"></div>
      </div>
    </div>
  `;

  document.getElementById('msgInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  setupEmojiPicker();
  await loadMessages(convId);
  subscribeToMessages(convId);
}

// ─── Messages ────────────────────────────────────────────────────────────────
async function loadMessages(convId) {
  const { data, error } = await supabaseClient
    .from('messages')
    .select('id, content, sender_id, created_at')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true });

  if (error) return;
  const area = document.getElementById('messagesArea');
  if (!area) return;
  area.innerHTML = '';
  let lastDate = '';

  for (const msg of (data || [])) {
    const d = new Date(msg.created_at);
    const dateStr = d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
    if (dateStr !== lastDate) {
      area.innerHTML += `<div class="date-sep"><span>${dateStr}</span></div>`;
      lastDate = dateStr;
    }
    appendMessageEl(area, msg);
  }
  area.scrollTop = area.scrollHeight;
}

function appendMessageEl(area, msg) {
  const mine = msg.sender_id === currentUser.id;
  const timeStr = new Date(msg.created_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  const div = document.createElement('div');
  div.className = `msg-row ${mine ? 'mine' : ''}`;
  div.innerHTML = `
    ${!mine ? `<div class="msg-avatar">?</div>` : ''}
    <div class="bubble ${mine ? 'mine' : 'theirs'}">${escapeHtml(msg.content)}</div>
    <div class="msg-time">${timeStr}</div>
  `;
  area.appendChild(div);
}

async function sendMessage() {
  const input = document.getElementById('msgInput');
  const content = input.value.trim();
  if (!content || !currentConversationId) return;
  input.value = '';

  await supabaseClient.from('messages').insert({
    conversation_id: currentConversationId,
    sender_id: currentUser.id,
    content
  });
}

function subscribeToMessages(convId) {
  if (realtimeChannel) supabaseClient.removeChannel(realtimeChannel);

  realtimeChannel = supabaseClient
    .channel(`messages:${convId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `conversation_id=eq.${convId}`
    }, (payload) => {
      const area = document.getElementById('messagesArea');
      if (!area) return;
      appendMessageEl(area, payload.new);
      area.scrollTop = area.scrollHeight;
      if (document.getElementById(`preview-${convId}`)) {
        document.getElementById(`preview-${convId}`).textContent = payload.new.content;
      }
    })
    .subscribe();
}

// ─── Emoji Picker ────────────────────────────────────────────────────────────
function setupEmojiPicker() {
  const btn = document.getElementById('emojiBtn');
  const wrap = document.getElementById('emojiPickerWrap');
  if (!btn || !wrap) return;
  let picker = null;
  let open = false;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!picker) {
      picker = document.createElement('emoji-picker');
      picker.style.cssText = 'width:100%;--num-columns:8;--emoji-size:1.4rem;';
      wrap.appendChild(picker);
      picker.addEventListener('emoji-click', (ev) => {
        const input = document.getElementById('msgInput');
        if (input) { input.value += ev.detail.unicode; input.focus(); }
      });
    }
    open = !open;
    wrap.style.display = open ? 'block' : 'none';
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.input-row')) {
      wrap.style.display = 'none';
      open = false;
    }
  });
}

// ─── Utils ───────────────────────────────────────────────────────────────────
function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Start ───────────────────────────────────────────────────────────────────
init();