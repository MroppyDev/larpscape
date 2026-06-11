// /profile — the default post-login landing. Shows who you are, links into
// the realm, and offers Log out. Logged-out visitors bounce to /login.
import { apiMe, logout } from './auth';

const line = document.getElementById('profile-line') as HTMLParagraphElement;
const actions = document.getElementById('profile-actions') as HTMLDivElement;
const logoutBtn = document.getElementById('logout-btn') as HTMLButtonElement;

void (async () => {
  const username = await apiMe();
  if (!username) {
    location.replace('/login');
    return;
  }
  line.innerHTML = '';
  line.append('Logged in as ');
  const strong = document.createElement('strong');
  strong.textContent = username;
  line.append(strong, '. Cantorne is holding your note.');
  actions.hidden = false;
})();

logoutBtn.addEventListener('click', () => {
  void (async () => {
    logoutBtn.disabled = true;
    logoutBtn.textContent = 'Logging out…';
    await logout();
    location.assign('/');
  })();
});
