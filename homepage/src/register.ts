// /register — client-side rule checks (3-12 alphanumeric username, 4-64
// password), JSON POST with cookie credentials, honors ?return=.
import {
  clearFormError,
  postAuth,
  preserveQueryOnLinks,
  redirectIfLoggedIn,
  returnTarget,
  showFormError,
  USERNAME_RE,
} from './auth';

preserveQueryOnLinks();
void redirectIfLoggedIn();

const form = document.getElementById('auth-form') as HTMLFormElement;
const usernameInput = document.getElementById('username') as HTMLInputElement;
const passwordInput = document.getElementById('password') as HTMLInputElement;
const password2Input = document.getElementById('password2') as HTMLInputElement;
const submitBtn = document.getElementById('auth-submit') as HTMLButtonElement;

form.addEventListener('submit', (e) => {
  e.preventDefault();
  void (async () => {
    clearFormError();
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    if (!USERNAME_RE.test(username)) {
      showFormError('Usernames are 3–12 letters and numbers, nothing else.');
      usernameInput.focus();
      return;
    }
    if (password.length < 4 || password.length > 64) {
      showFormError('Passwords are 4–64 characters.');
      passwordInput.focus();
      return;
    }
    if (password !== password2Input.value) {
      showFormError('The two passwords don’t match.');
      password2Input.focus();
      password2Input.select();
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account…';
    const result = await postAuth('register', { username, password });
    if (result.ok) {
      location.assign(returnTarget());
      return;
    }
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create account';
    showFormError(result.error);
    usernameInput.focus();
  })();
});
