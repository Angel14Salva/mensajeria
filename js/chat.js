let currentUser = null;
let currentConversationId = null;
let realtimeChannel = null;

async function init() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = 'index.html'; return; }
  currentUser = session.user;

  const { data: profile } = await supabaseClient.from('profiles').select('username').eq('id', currentUser.id).single();
  const username = profile?.username || currentUser.email.split('@')[0];
  document.getElementById('myUsername').textContent = username;
  document.getElementById('myAvatar').textContent = initials(username);
  document.getElementById('logoutBtn').addEventListener('click', logout);

  let inactivityTimer;
  function resetTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(async () => {
      await supabaseClient.auth.signOut();
      window.location.href = 'index.html';
    }, 30 * 60 * 1000);
  }
  ['click','keydown','mousemove','touchstart'].forEach(e => document.addEventListener(e, resetTimer, true));
  resetTimer();

  setupSearch();
  loadConversations();
}

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
}

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
  const { data, error } = await supabaseClient.from('profiles').select('id, username').ilike('username', `%${q}%`).neq('id', currentUser.id).limit(8);
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

async function loadConversations() {
  const { data, error } = await supabaseClient.from('conversation_members').select(`conversation_id, conversations (id, conversation_members (profiles ( id, username )))`).eq('user_id', currentUser.id);
  if (error || !data?.length) return;
  const list = document.getElementById('chatList');
  list.innerHTML = '';
  for (const row of data) {
    const conv = row.conversations;
    const other = conv.conversation_members.map(m => m.profiles).find(p => p.id !== currentUser.id);
    if (!other) continue;
    const item = document.createElement('div');
    item.className = 'chat-item';
    item.dataset.convId = conv.id;
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
  const { data } = await supabaseClient.from('messages').select('content').eq('conversation_id', convId).order('created_at', { ascending: false }).limit(1);
  const el = document.getElementById(`preview-${convId}`);
  if (el) el.textContent = data?.[0]?.content || 'Sin mensajes aún';
}

async function startConversation(otherUserId, otherUsername) {
  document.getElementById('searchInput').value = '';
  document.getElementById('searchResults').classList.add('hidden');
  const { data: myConvs } = await supabaseClient.from('conversation_members').select('conversation_id').eq('user_id', currentUser.id);
  const { data: theirConvs } = await supabaseClient.from('conversation_members').select('conversation_id').eq('user_id', otherUserId);
  const myIds = new Set((myConvs || []).map(r => r.conversation_id));
  const shared = (theirConvs || []).find(r => myIds.has(r.conversation_id));
  let convId = shared?.conversation_id;
  if (!convId) {
    const { data: newConv, error } = await supabaseClient.from('conversations').insert({}).select('id').single();
    if (error || !newConv) { alert('Error: ' + (error?.message || 'desconocido')); return; }
    convId = newConv.id;
    await supabaseClient.from('conversation_members').insert([
      { conversation_id: convId, user_id: currentUser.id },
      { conversation_id: convId, user_id: otherUserId }
    ]);
    loadConversations();
  }
  openChat(convId, otherUsername);
}

function goBack() {
  document.querySelector('.sidebar').classList.remove('hidden-mobile');
  document.getElementById('mainArea').classList.remove('visible-mobile');
}

async function openChat(convId, username) {
  currentConversationId = convId;
  document.querySelectorAll('.chat-item').forEach(el => el.classList.toggle('active', el.dataset.convId === String(convId)));
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
      <div class="input-row">
        <label class="attach-btn" aria-label="Adjuntar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          <input type="file" id="mediaInput" accept="image/*,video/*" style="display:none"/>
        </label>
        <input type="text" class="msg-input" id="msgInput" placeholder="Escribe un mensaje..." autocomplete="off"/>
        <button class="send-btn" onclick="sendMessage()" aria-label="Enviar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  `;

  document.getElementById('msgInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });
  document.getElementById('mediaInput').addEventListener('change', handleMediaUpload);
  await loadMessages(convId);
  subscribeToMessages(convId);
}

async function loadMessages(convId) {
  const { data, error } = await supabaseClient.from('messages').select('id, content, sender_id, created_at').eq('conversation_id', convId).order('created_at', { ascending: true });
  if (error) return;
  const area = document.getElementById('messagesArea');
  if (!area) return;
  area.innerHTML = '';
  let lastDate = '';
  for (const msg of (data || [])) {
    const dateStr = new Date(msg.created_at).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
    if (dateStr !== lastDate) { area.innerHTML += `<div class="date-sep"><span>${dateStr}</span></div>`; lastDate = dateStr; }
    appendMessageEl(area, msg);
  }
  area.scrollTop = area.scrollHeight;
}

function appendMessageEl(area, msg) {
  const mine = msg.sender_id === currentUser.id;
  const timeStr = new Date(msg.created_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  const div = document.createElement('div');
  div.className = `msg-row ${mine ? 'mine' : ''}`;

  let bubbleContent = '';
  if (msg.media_url) {
    if (msg.media_type && msg.media_type.startsWith('video')) {
      bubbleContent = `<video src="${msg.media_url}" controls style="max-width:100%;max-height:220px;border-radius:8px;display:block;"></video>`;
    } else {
      bubbleContent = `<img src="${msg.media_url}" style="max-width:100%;max-height:220px;border-radius:8px;display:block;cursor:pointer;" onclick="window.open('${msg.media_url}','_blank')"/>`;
    }
    if (msg.content) bubbleContent += `<div style="margin-top:4px;">${escapeHtml(msg.content)}</div>`;
  } else {
    bubbleContent = escapeHtml(msg.content);
  }

  div.innerHTML = `
    ${!mine ? `<div class="msg-avatar">?</div>` : ''}
    <div class="bubble ${mine ? 'mine' : 'theirs'}">${bubbleContent}</div>
    <div class="msg-time">${timeStr}</div>
  `;
  area.appendChild(div);
}

async function handleMediaUpload(e) {
  const file = e.target.files[0];
  if (!file || !currentConversationId) return;
  e.target.value = '';

  const area = document.getElementById('messagesArea');
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'msg-row mine';
  loadingDiv.innerHTML = '<div class="bubble mine" style="opacity:0.6;font-size:12px;">Subiendo...</div>';
  area.appendChild(loadingDiv);
  area.scrollTop = area.scrollHeight;

  const ext = file.name.split('.').pop();
  const path = `${currentUser.id}/${Date.now()}.${ext}`;
  const { data, error } = await supabaseClient.storage.from('chat-media').upload(path, file);

  loadingDiv.remove();

  if (error) { alert('Error al subir: ' + error.message); return; }

  const { data: urlData } = supabaseClient.storage.from('chat-media').getPublicUrl(path);

  await supabaseClient.from('messages').insert({
    conversation_id: currentConversationId,
    sender_id: currentUser.id,
    content: '',
    media_url: urlData.publicUrl,
    media_type: file.type
  });
}

async function sendMessage() {
  const input = document.getElementById('msgInput');
  const content = input.value.trim();
  if (!content || !currentConversationId) return;
  input.value = '';
  await supabaseClient.from('messages').insert({ conversation_id: currentConversationId, sender_id: currentUser.id, content });
}

function subscribeToMessages(convId) {
  if (realtimeChannel) supabaseClient.removeChannel(realtimeChannel);
  realtimeChannel = supabaseClient.channel(`messages:${convId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` }, (payload) => {
      const area = document.getElementById('messagesArea');
      if (!area) return;
      appendMessageEl(area, payload.new);
      area.scrollTop = area.scrollHeight;
      const prev = document.getElementById(`preview-${convId}`);
      if (prev) prev.textContent = payload.new.content;
    }).subscribe();
}

// ─── Emoji Picker ─────────────────────────────────────────────────────────────
const EMOJI_DATA = [
  ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖'],
  ['👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦵','🦶','👂','🦻','👃','🧠','🦷','🦴','👀','👁','👅','👄','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝'],
  ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦟','🦗','🦂','🐢','🐍','🦎','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🐃','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐈','🐓','🦃','🦚','🦜','🦢','🦩','🕊','🐇','🦝','🦨','🦡','🦦','🦥','🐁','🐀','🐿','🦔'],
  ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🥪','🥙','🧆','🌮','🌯','🥗','🥘','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🧃','🥤','🧋','☕','🍵','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🍾'],
  ['🏠','🏡','🏢','🏥','🏦','🏨','🏪','🏫','🏬','🏭','🏯','🏰','💒','🗼','🗽','⛪','🕌','⛩','🕋','⛲','⛺','🌁','🌃','🏙','🌄','🌅','🌆','🌇','🌉','🚂','🚃','🚄','🚅','🚇','🚌','🚑','🚒','🚓','🚕','🚗','🚙','🛻','🚚','🚛','🚜','🏎','🏍','🛵','🚲','🛴','🛹','⛽','🚨','🚥','🚦','⚓','⛵','🚤','🛥','🚢','✈️','🛩','💺','🚁','🚀','🛸','🌍','🌎','🌏','🌐','🗺','🏔','⛰','🌋','🗻','🏕','🏖','🏜','🏝','🏞','🌊','🌬','🌀','🌈','🌂','☂️','☔','⛱','⚡','❄️','🔥','💧','🌊'],
  ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🏓','🏸','🥊','🥋','🎽','🛹','🛷','⛸','🥌','🎿','⛷','🏋️','🤸','🏆','🥇','🥈','🥉','🏅','🎖','🎗','🎫','🎟','🎪','🎭','🎨','🎬','🎤','🎧','🎼','🎵','🎶','🎷','🎸','🎹','🎺','🎻','🥁','🎲','♟','🎯','🎳','🎮','🎰','🧩','🪅','🪆','🎠','🎡','🎢'],
  ['💡','🔦','🕯','💰','💸','💳','🪙','📈','📉','📊','📋','📌','📍','✂️','🔒','🔓','🔑','🗝','🔨','⚒','🛠','⚔️','🔫','🔧','🔩','⚙️','🔗','🧰','🧲','⚗️','🧪','🧬','🔬','🔭','📡','💉','💊','🩹','🚪','🛋','🚽','🚿','🛁','🧴','🧷','🧹','🧺','🧻','🧼','🧽','🛒','📱','💻','🖥','⌨️','🖱','💾','💿','📷','📹','🎥','📞','☎️','📺','📻','⌚','📦','📫','📬','✏️','📝','📁','📂','📰','📚','📖','🔖'],
  ['💯','✅','❌','⭕','🛑','⛔','📛','⚠️','🚸','🔞','♻️','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔶','🔷','🔸','🔹','🔺','🔻','💠','🔘','🔲','🔳','▶️','◀️','🔊','🔉','🔈','🔔','🔕','💬','💭','♠️','♣️','♥️','♦️','🃏','🎴','🀄','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','☮️','✝️','☪️','🕉','✡️','☯️','🛐','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','🆗','🆕','🆙','🆒','🆓','🆖','🆘','🅰️','🅱️','🅾️','🆎'],
];

const RECENT_KEY = 'recentEmojis';
const MAX_RECENT = 40;

function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}
function saveRecent(e) {
  let r = getRecent().filter(x => x !== e);
  r.unshift(e);
  localStorage.setItem(RECENT_KEY, JSON.stringify(r.slice(0, MAX_RECENT)));
}

function setupEmojiPicker() {
  const btn = document.getElementById('emojiBtn');
  const picker = document.getElementById('epicker');
  const grid = document.getElementById('epGrid');
  const cats = document.getElementById('epCats');
  if (!btn || !picker || !grid || !cats) return;

  let activeCat = 0;
  let isOpen = false;

  function renderGrid(cat) {
    const emojis = cat === 'recent' ? getRecent() : EMOJI_DATA[cat];
    grid.innerHTML = '';
    if (!emojis.length) {
      grid.innerHTML = '<div style="padding:20px;text-align:center;font-size:13px;color:var(--text-muted);width:100%">Sin emojis recientes</div>';
      return;
    }
    emojis.forEach(e => {
      const b = document.createElement('button');
      b.textContent = e;
      b.addEventListener('click', () => {
        const input = document.getElementById('msgInput');
        if (input) { input.value += e; input.focus(); }
        saveRecent(e);
        if (activeCat === 'recent') renderGrid('recent');
      });
      grid.appendChild(b);
    });
  }

  cats.querySelectorAll('.epicker-cat').forEach(c => {
    c.addEventListener('click', () => {
      cats.querySelectorAll('.epicker-cat').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      activeCat = c.dataset.cat === 'recent' ? 'recent' : parseInt(c.dataset.cat);
      renderGrid(activeCat);
    });
  });

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    isOpen = !isOpen;
    picker.classList.toggle('open', isOpen);
    if (isOpen) renderGrid(activeCat);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#epicker') && !e.target.closest('#emojiBtn')) {
      picker.classList.remove('open');
      isOpen = false;
    }
  });

  renderGrid(0);
}

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}
function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

init();