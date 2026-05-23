function showError(msg) {
  const el = document.getElementById('errorMsg');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function showSuccess(msg) {
  const el = document.getElementById('successMsg');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function setLoading(state, prefix = 'login') {
  const btn = document.getElementById(prefix + 'Btn');
  const text = document.getElementById(prefix + 'Text');
  const spinner = document.getElementById(prefix + 'Spinner');
  if (!btn) return;
  btn.disabled = state;
  text && text.classList.toggle('hidden', state);
  spinner && spinner.classList.toggle('hidden', !state);
}
