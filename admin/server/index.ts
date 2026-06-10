// Larpscape admin server: login-gated API for the admin SPA.
//  - content file API over data/*.json with zod validation + git commit history
//  - proxy to the game server's /api/admin/* (x-admin-token never reaches the browser)
//  - publish pipeline: validate -> build -> in-game countdown broadcast -> restart
// Run: npx tsx admin/server/index.ts  (env: ADMIN_PASSWORD, ADMIN_TOKEN, ...)

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execFile, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { FILE_SCHEMAS } from '../../shared/schema';
import { validateContent } from '../../shared/validate';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(__dirname, '../..');
const DATA_DIR = path.join(REPO_DIR, 'data');
const PORT = Number(process.env.ADMIN_PORT || 8081);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const GAME_API = process.env.GAME_API || 'http://127.0.0.1:8080';
// Production publish restarts the game service; override for local testing.
const RESTART_CMD = process.env.RESTART_CMD || 'sudo systemctl restart larpscape';
const NPM_CMD = process.platform === 'win32' ? 'npm.cmd' : 'npm';

if (!ADMIN_PASSWORD) {
  console.warn('[admin] ADMIN_PASSWORD is not set — logins are disabled.');
}

// ---------------------------------------------------------------------------
// Sessions (in-memory; admin app is single-operator)
// ---------------------------------------------------------------------------

const sessions = new Map<string, number>(); // token -> created_at
const SESSION_TTL = 1000 * 60 * 60 * 24 * 7;

function parseCookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function requireSession(req: Request, res: Response, next: NextFunction) {
  const token = parseCookies(req)['adm'];
  const created = token ? sessions.get(token) : undefined;
  if (!created || Date.now() - created > SESSION_TTL) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json({ limit: '20mb' })); // map.json with objects can be large

let loginFailures = 0;
let loginLockUntil = 0;

app.post('/admin-api/login', (req, res) => {
  if (Date.now() < loginLockUntil) { res.status(429).json({ error: 'too many attempts, wait a minute' }); return; }
  const { password } = req.body ?? {};
  if (!ADMIN_PASSWORD || typeof password !== 'string' ||
      password.length !== ADMIN_PASSWORD.length ||
      !crypto.timingSafeEqual(Buffer.from(password), Buffer.from(ADMIN_PASSWORD))) {
    loginFailures++;
    if (loginFailures >= 5) { loginLockUntil = Date.now() + 60_000; loginFailures = 0; }
    res.status(401).json({ error: 'wrong password' });
    return;
  }
  loginFailures = 0;
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now());
  const secure = (req.headers['x-forwarded-proto'] === 'https') ? '; Secure' : '';
  res.setHeader('Set-Cookie', `adm=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL / 1000}${secure}`);
  res.json({ ok: true });
});

app.post('/admin-api/logout', (req, res) => {
  const token = parseCookies(req)['adm'];
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', 'adm=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/admin-api/me', requireSession, (_req, res) => { res.json({ ok: true }); });

// All routes below require a session.
app.use('/admin-api', requireSession);

// ---------------------------------------------------------------------------
// git helpers
// ---------------------------------------------------------------------------

function git(args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd: REPO_DIR, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: (stdout || '') + (stderr || '') });
    });
  });
}

// ---------------------------------------------------------------------------
// Content file API
// ---------------------------------------------------------------------------

const CONTENT_FILES = Object.keys(FILE_SCHEMAS);

function contentFileOk(name: string): boolean {
  return CONTENT_FILES.includes(name);
}

app.get('/admin-api/content/files', (_req, res) => {
  res.json({ files: CONTENT_FILES });
});

app.get('/admin-api/content/file/:name', (req, res) => {
  const name = req.params.name;
  if (!contentFileOk(name)) { res.status(404).json({ error: 'unknown content file' }); return; }
  try {
    res.json(JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8')));
  } catch (e: any) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.put('/admin-api/content/file/:name', async (req, res) => {
  const name = req.params.name;
  if (!contentFileOk(name)) { res.status(404).json({ error: 'unknown content file' }); return; }
  const body = req.body;
  const parsed = FILE_SCHEMAS[name].safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: 'schema validation failed', issues: parsed.error.issues.slice(0, 20).map((i) => `${i.path.join('.')}: ${i.message}`) });
    return;
  }
  const file = path.join(DATA_DIR, name);
  const before = fs.readFileSync(file, 'utf8');
  const after = JSON.stringify(body, null, 2) + '\n';
  if (before === after) { res.json({ ok: true, unchanged: true }); return; }
  fs.writeFileSync(file, after);
  // Cross-reference validation over the whole catalog; revert on failure.
  const errors = validateContent(DATA_DIR);
  if (errors.length > 0) {
    fs.writeFileSync(file, before);
    res.status(400).json({ error: 'cross-reference validation failed', issues: errors.slice(0, 30) });
    return;
  }
  const message = typeof req.query.message === 'string' && req.query.message.trim()
    ? req.query.message.trim().slice(0, 120)
    : `content: edit ${name}`;
  await git(['add', `data/${name}`]);
  const commit = await git(['-c', 'user.name=Larpscape Admin', '-c', 'user.email=admin@larpscape.net', 'commit', '-m', message, '--', `data/${name}`]);
  res.json({ ok: true, committed: commit.ok });
});

app.get('/admin-api/content/status', async (_req, res) => {
  const status = await git(['status', '--porcelain', '--', 'data/']);
  const log = await git(['log', '--pretty=format:%h|%at|%s', '-30', '--', 'data/']);
  const aheadOut = await git(['rev-list', '--count', 'origin/main..HEAD']);
  const commits = log.ok && log.out.trim()
    ? log.out.trim().split('\n').map((l) => {
        const [hash, at, ...rest] = l.split('|');
        return { hash, at: Number(at) * 1000, message: rest.join('|') };
      })
    : [];
  res.json({
    dirty: status.out.trim().split('\n').filter(Boolean),
    commits,
    unpublished: aheadOut.ok ? Number(aheadOut.out.trim()) || 0 : null,
  });
});

app.get('/admin-api/content/diff', async (_req, res) => {
  const diff = await git(['diff', 'origin/main', '--stat', '--', 'data/']);
  const full = await git(['diff', 'origin/main', '--', 'data/']);
  res.json({ stat: diff.out, diff: full.out.slice(0, 200_000) });
});

app.post('/admin-api/content/validate', (_req, res) => {
  const errors = validateContent(DATA_DIR);
  res.json({ ok: errors.length === 0, errors });
});

// ---------------------------------------------------------------------------
// Game server admin proxy (live view / moderation / broadcast)
// ---------------------------------------------------------------------------

app.all('/admin-api/game/{*splat}', async (req, res) => {
  if (!ADMIN_TOKEN) { res.status(500).json({ error: 'ADMIN_TOKEN not configured' }); return; }
  const sub = req.path.replace(/^\/admin-api\/game\//, '');
  if (!/^[a-zA-Z0-9_\/-]+$/.test(sub)) { res.status(400).json({ error: 'bad path' }); return; }
  const qs = req.originalUrl.includes('?') ? '?' + req.originalUrl.split('?').slice(1).join('?') : '';
  try {
    const r = await fetch(`${GAME_API}/api/admin/${sub}${qs}`, {
      method: req.method,
      headers: {
        'x-admin-token': ADMIN_TOKEN,
        ...(req.method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
      },
      body: req.method !== 'GET' ? JSON.stringify(req.body ?? {}) : undefined,
    });
    const text = await r.text();
    res.status(r.status).type('application/json').send(text);
  } catch {
    res.status(502).json({ error: 'game server unreachable' });
  }
});

// ---------------------------------------------------------------------------
// Publish pipeline (job runner with streaming-ish log polling)
// ---------------------------------------------------------------------------

interface PublishJob {
  running: boolean;
  startedAt: number;
  log: string[];
  ok: boolean | null;
}
let job: PublishJob = { running: false, startedAt: 0, log: [], ok: null };

function jlog(line: string) {
  job.log.push(`[${new Date().toISOString().slice(11, 19)}] ${line}`);
  console.log('[publish]', line);
}

function run(cmd: string, args: string[], opts: { cwd?: string } = {}): Promise<number> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: opts.cwd ?? REPO_DIR, shell: process.platform === 'win32' });
    p.stdout.on('data', (d) => { for (const l of String(d).split('\n')) if (l.trim()) jlog(l.trimEnd()); });
    p.stderr.on('data', (d) => { for (const l of String(d).split('\n')) if (l.trim()) jlog(l.trimEnd()); });
    p.on('close', (code) => resolve(code ?? 1));
    p.on('error', (e) => { jlog(`spawn error: ${e.message}`); resolve(1); });
  });
}

app.post('/admin-api/publish', (req, res) => {
  if (job.running) { res.status(409).json({ error: 'publish already running' }); return; }
  const warnSeconds = Math.min(600, Math.max(0, Number(req.body?.warnSeconds ?? 15)));
  const message = typeof req.body?.message === 'string' && req.body.message.trim()
    ? req.body.message.trim().slice(0, 180)
    : `Server update in ${warnSeconds}s — you will be reconnected automatically.`;

  job = { running: true, startedAt: Date.now(), log: [], ok: null };
  res.json({ ok: true });

  (async () => {
    try {
      jlog('Validating content...');
      const errors = validateContent(DATA_DIR);
      if (errors.length > 0) {
        for (const e of errors.slice(0, 20)) jlog('VALIDATION: ' + e);
        throw new Error('content validation failed');
      }
      jlog('Building client...');
      const buildCode = await run(NPM_CMD, ['run', 'build']);
      if (buildCode !== 0) throw new Error('client build failed');

      if (warnSeconds > 0 && ADMIN_TOKEN) {
        jlog(`Broadcasting in-game warning (${warnSeconds}s): ${message}`);
        try {
          const r = await fetch(`${GAME_API}/api/admin/broadcast`, {
            method: 'POST',
            headers: { 'x-admin-token': ADMIN_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: message }),
          });
          const j: any = await r.json();
          jlog(`Broadcast delivered to ${j.delivered ?? 0} player(s).`);
        } catch {
          jlog('Broadcast failed (continuing).');
        }
        jlog(`Waiting ${warnSeconds}s before restart...`);
        await new Promise((r) => setTimeout(r, warnSeconds * 1000));
      }

      jlog('Restarting game service...');
      const parts = RESTART_CMD.split(' ');
      const rcode = await run(parts[0], parts.slice(1));
      if (rcode !== 0) throw new Error('restart command failed');

      jlog('Publish complete.');
      job.ok = true;
    } catch (e: any) {
      jlog('FAILED: ' + e.message);
      job.ok = false;
    } finally {
      job.running = false;
    }
  })();
});

app.get('/admin-api/publish/status', (_req, res) => {
  res.json({ running: job.running, startedAt: job.startedAt, ok: job.ok, log: job.log });
});

// ---------------------------------------------------------------------------
// Static SPA (production)
// ---------------------------------------------------------------------------

const dist = path.join(REPO_DIR, 'dist-admin');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/admin-api')) {
      res.sendFile(path.join(dist, 'index.html'));
    } else next();
  });
}

app.use('/admin-api', (_req, res) => { res.status(404).json({ error: 'not found' }); });

app.listen(PORT, () => {
  console.log(`[admin] Larpscape admin server on http://localhost:${PORT}`);
});
