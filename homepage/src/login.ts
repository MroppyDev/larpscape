// /login — posts JSON to the auth API with cookie credentials, honors ?return=.
import {
  clearFormError,
  postAuth,
  preserveQueryOnLinks,
  redirectIfLoggedIn,
  returnTarget,
  showFormError,
} from './auth';

preserveQueryOnLinks();
void redirectIfLoggedIn();

const form = document.getElementById('auth-form') as HTMLFormElement;
const usernameInput = document.getElementById('username') as HTMLInputElement;
const passwordInput = document.getElementById('password') as HTMLInputElement;
const submitBtn = document.getElementById('auth-submit') as HTMLButtonElement;

form.addEventListener('submit', (e) => {
  e.preventDefault();
  void (async () => {
    clearFormError();
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    if (!username || !password) {
      showFormError('Enter your username and password.');
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in…';
    const result = await postAuth('login', { username, password });
    if (result.ok) {
      location.assign(returnTarget());
      return;
    }
    submitBtn.disabled = false;
    submitBtn.textContent = 'Log in';
    showFormError(result.error);
    passwordInput.focus();
    passwordInput.select();
  })();
});
