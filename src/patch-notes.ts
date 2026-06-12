// Patch notes overlay — shown once per deploy build when the player enters the
// game (clicks play). Dismissal is remembered in localStorage until the next
// client build (__BUILD_ID__ / git short hash from vite.config.ts).

import notesData from '../data/patch-notes.json';

const STORAGE_KEY = 'ls-patch-notes-seen';

interface PatchNoteEntry {
  title: string;
  date?: string;
  intro?: string;
  section?: string;
  items: string[];
  signoff?: string;
}

const NOTES: Record<string, PatchNoteEntry> = notesData as Record<string, PatchNoteEntry>;

let styleInjected = false;

function injectStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const css = document.createElement('style');
  css.textContent = `
#patch-notes-overlay {
  position: fixed; inset: 0; z-index: 30;
  background: rgba(0, 0, 0, 0.72);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
#patch-notes-overlay .patch-notes-box {
  max-width: 420px; width: 100%; max-height: min(80dvh, 520px);
  overflow-y: auto;
  text-align: left;
  padding: 22px 26px 20px;
  background: linear-gradient(#241c12, #161009);
  border: 3px solid;
  border-color: var(--stone-light) var(--bevel-lo) var(--bevel-lo) var(--stone-light);
  outline: 2px solid #000;
  border-radius: 6px;
  box-shadow: 0 0 40px rgba(0,0,0,0.9), inset 0 0 30px rgba(0,0,0,0.6);
  color: #c8c8c8; font-size: 12px; line-height: 1.55;
}
#patch-notes-overlay .patch-notes-kicker {
  text-align: center; color: var(--yellow); font-size: 11px;
  letter-spacing: 1px; text-transform: uppercase; margin-bottom: 4px;
}
#patch-notes-overlay h2 {
  font-family: Georgia, 'Times New Roman', serif;
  text-align: center; color: var(--yellow); font-size: 22px;
  letter-spacing: 1px; margin: 0 0 6px;
  text-shadow: 2px 2px 0 #4a3000;
}
#patch-notes-overlay .patch-notes-date {
  text-align: center; color: #9a8a6a; font-size: 11px; margin-bottom: 14px;
}
#patch-notes-overlay .patch-notes-intro {
  margin: 0 0 14px; color: #d4cbb8;
}
#patch-notes-overlay .patch-notes-section {
  margin: 0 0 8px; color: var(--yellow); font-weight: bold; font-size: 12px;
}
#patch-notes-overlay ul {
  margin: 0 0 14px; padding-left: 18px;
}
#patch-notes-overlay li { margin-bottom: 7px; }
#patch-notes-overlay .patch-notes-signoff {
  margin: 0 0 16px; color: #9a8a6a; font-style: italic; text-align: center; font-size: 11px;
}
#patch-notes-overlay .patch-notes-btn {
  display: block; width: 100%; max-width: 220px; margin: 0 auto;
  padding: 10px 16px;
  background: linear-gradient(#5a4a28, #3a2e18);
  color: var(--yellow); font-family: inherit; font-size: 13px; font-weight: bold;
  border: 2px solid;
  border-color: var(--bevel-hi) var(--bevel-lo) var(--bevel-lo) var(--bevel-hi);
  border-radius: 3px; cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.15), 0 2px 4px rgba(0,0,0,0.5);
}
#patch-notes-overlay .patch-notes-btn:hover {
  background: linear-gradient(#6e5a32, #4a3c20);
}
body.mobile-full #patch-notes-overlay .patch-notes-box {
  max-width: 94dvw;
}
`;
  document.head.appendChild(css);
}

function lastSeenBuild(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

export function markPatchNotesSeen(buildId: string) {
  try { localStorage.setItem(STORAGE_KEY, buildId); } catch { /* private mode */ }
}

function notesForBuild(buildId: string): PatchNoteEntry | null {
  return NOTES[buildId] ?? null;
}

function shouldShowPatchNotes(buildId: string): boolean {
  if (buildId === 'dev') return false;
  if (lastSeenBuild() === buildId) return false;
  return notesForBuild(buildId) !== null;
}

function dismiss(overlay: HTMLElement, buildId: string) {
  markPatchNotesSeen(buildId);
  overlay.remove();
}

/** Block until the player dismisses patch notes, or resolve immediately if none / already seen. */
export function maybeShowPatchNotes(): Promise<void> {
  const buildId = __BUILD_ID__;
  if (!shouldShowPatchNotes(buildId)) {
    if (buildId !== 'dev' && lastSeenBuild() !== buildId && !notesForBuild(buildId)) {
      // No copy for this build — remember it so we do not re-check every login.
      markPatchNotesSeen(buildId);
    }
    return Promise.resolve();
  }

  const entry = notesForBuild(buildId)!;
  injectStyle();

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'patch-notes-overlay';

    const box = document.createElement('div');
    box.className = 'patch-notes-box';

    const kicker = document.createElement('div');
    kicker.className = 'patch-notes-kicker';
    kicker.textContent = 'News & Updates';
    box.appendChild(kicker);

    const title = document.createElement('h2');
    title.textContent = entry.title;
    box.appendChild(title);

    if (entry.date) {
      const date = document.createElement('p');
      date.className = 'patch-notes-date';
      date.textContent = entry.date;
      box.appendChild(date);
    }

    if (entry.intro) {
      const intro = document.createElement('p');
      intro.className = 'patch-notes-intro';
      intro.textContent = entry.intro;
      box.appendChild(intro);
    }

    if (entry.section) {
      const section = document.createElement('p');
      section.className = 'patch-notes-section';
      section.textContent = entry.section;
      box.appendChild(section);
    }

    const list = document.createElement('ul');
    for (const line of entry.items) {
      const li = document.createElement('li');
      li.textContent = line;
      list.appendChild(li);
    }
    box.appendChild(list);

    if (entry.signoff) {
      const signoff = document.createElement('p');
      signoff.className = 'patch-notes-signoff';
      signoff.textContent = entry.signoff;
      box.appendChild(signoff);
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'patch-notes-btn';
    btn.textContent = 'Continue';
    btn.onclick = () => { dismiss(overlay, buildId); resolve(); };
    box.appendChild(btn);

    overlay.appendChild(box);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { dismiss(overlay, buildId); resolve(); }
    });
    document.body.appendChild(overlay);
    btn.focus();
  });
}
