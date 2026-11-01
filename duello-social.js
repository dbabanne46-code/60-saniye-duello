'use strict';
const socialEl = id => document.getElementById(id);
const cfg = window.DUELLO_CONFIG || {};
const api = cfg.url && cfg.anonKey && window.supabase ? window.supabase.createClient(cfg.url, cfg.anonKey) : null;
let socialUser = null;
function status(message) { socialEl('socialStatus').textContent = message; }
async function refreshSocial() {
  if (!api) {
    socialEl('setupNotice').hidden = false;
    socialEl('authPanel').hidden = true;
    socialEl('socialPanel').hidden = true;
    return;
  }
  try {
    const { data, error } = await api.auth.getSession();
    if (error) throw error;
    socialUser = data.session?.user || null;
    socialEl('setupNotice').hidden = true;
    socialEl('authPanel').hidden = Boolean(socialUser);
    socialEl('socialPanel').hidden = !socialUser;
    if (socialUser) {
      const profile = await api.from('profiles').select('username').eq('id', socialUser.id).single();
      if (profile.error) throw profile.error;
      socialEl('myUsername').textContent = '@' + profile.data.username;
      await loadFollowing();
    }
  } catch (error) { status('Bağlantı hatası: ' + error.message); }
}
async function signup() {
  if (!api) return;
  const username = socialEl('usernameInput').value.trim().toLowerCase();
  const email = socialEl('emailInput').value.trim();
  const password = socialEl('passwordInput').value;
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return status('Kullanıcı adı 3–20 karakter olmalı; küçük harf, rakam ve _ kullan.');
  if (!email || password.length < 8) return status('E-posta ve en az 8 karakterli şifre gir.');
  status('Hesap oluşturuluyor…');
  const { data, error } = await api.auth.signUp({ email, password, options: { data: { username } } });
  if (error) return status(error.message);
  socialEl('passwordInput').value = '';
  if (!data.session) return status('E-postandaki onay bağlantısına tıkla, sonra giriş yap.');
  status('Hesap hazır.'); await refreshSocial();
}
async function login() {
  if (!api) return;
  status('Giriş yapılıyor…');
  const { error } = await api.auth.signInWithPassword({ email: socialEl('emailInput').value.trim(), password: socialEl('passwordInput').value });
  if (error) return status(error.message);
  socialEl('passwordInput').value = '';
  status('Giriş yapıldı.'); await refreshSocial();
}
async function logout() {
  if (!api) return;
  await api.auth.signOut(); socialUser = null; status('Çıkış yapıldı.'); await refreshSocial();
}
async function deleteMyAccount() {
  if (!api || !socialUser) return;
  if (!confirm('Hesabın, skorun ve takiplerin kalıcı olarak silinsin mi?')) return;
  const { error } = await api.rpc('delete_my_account');
  if (error) return status(error.message);
  await api.auth.signOut(); socialUser = null;
  status('Hesabın silindi.'); await refreshSocial();
}
function personRow(player, following) {
  const row = document.createElement('div'); row.className = 'row';
  const label = document.createElement('span'); label.textContent = `@${player.username} • ${player.best_score} puan`;
  const button = document.createElement('button'); button.className = 'smallbtn'; button.type = 'button';
  button.textContent = following ? 'Takibi bırak' : 'Takip et';
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const query = api.from('follows');
      const { error } = following
        ? await query.delete().eq('follower_id', socialUser.id).eq('followed_id', player.id)
        : await query.insert({ follower_id: socialUser.id, followed_id: player.id });
      if (error) throw error;
      await loadFollowing();
      if (socialEl('searchInput').value.trim()) await searchPeople();
      status(following ? 'Takip bırakıldı.' : 'Takip ediliyor.');
    } catch (error) { status(error.message); }
    button.disabled = false;
  });
  row.append(label, button); return row;
}
async function loadFollowing() {
  if (!socialUser) return;
  const links = await api.from('follows').select('followed_id').eq('follower_id', socialUser.id);
  if (links.error) return status(links.error.message);
  const ids = links.data.map(x => x.followed_id);
  socialEl('followingList').replaceChildren();
  if (!ids.length) return;
  const profiles = await api.from('profiles').select('id,username,best_score').in('id', ids).order('best_score', { ascending: false });
  if (profiles.error) return status(profiles.error.message);
  socialEl('followingList').replaceChildren(...profiles.data.map(player => personRow(player, true)));
}
async function searchPeople() {
  if (!socialUser) return;
  const query = socialEl('searchInput').value.trim().toLowerCase();
  if (!/^[a-z0-9_]{2,20}$/.test(query)) return status('En az 2 harf veya rakam yaz.');
  const [profiles, links] = await Promise.all([
    api.from('profiles').select('id,username,best_score').ilike('username', query + '%').neq('id', socialUser.id).limit(10),
    api.from('follows').select('followed_id').eq('follower_id', socialUser.id)
  ]);
  if (profiles.error || links.error) return status((profiles.error || links.error).message);
  const followed = new Set(links.data.map(x => x.followed_id));
  socialEl('searchResults').replaceChildren(...profiles.data.map(player => personRow(player, followed.has(player.id))));
  status(profiles.data.length ? `${profiles.data.length} oyuncu bulundu.` : 'Oyuncu bulunamadı.');
}
async function saveOnlineScore() {
  if (!api) return;
  try {
    const { data } = await api.auth.getUser(); if (!data.user) return;
    const profile = await api.from('profiles').select('best_score').eq('id', data.user.id).single();
    if (!profile.error && score > profile.data.best_score) await api.from('profiles').update({ best_score: score }).eq('id', data.user.id);
  } catch (_) {}
}
socialEl('signupButton').addEventListener('click', signup);
socialEl('loginButton').addEventListener('click', login);
socialEl('logoutButton').addEventListener('click', logout);
socialEl('deleteAccountButton').addEventListener('click', deleteMyAccount);
socialEl('searchButton').addEventListener('click', searchPeople);
socialEl('searchInput').addEventListener('keydown', event => { if (event.key === 'Enter') searchPeople(); });

