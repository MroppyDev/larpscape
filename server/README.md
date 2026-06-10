# Larpscape server

Node service providing accounts, character saves, presence/chat relay (WebSocket), and
the Grand Exchange order book. SQLite database lives at `server/data.db` (gitignored).

## Run (development)

```sh
npm run server        # tsx server/index.ts, listens on :8080
npm run dev           # vite dev server; /api and /ws are proxied to :8080
```

No build step — the server runs straight from TypeScript via `tsx`.

## Deploy on a VPS

```sh
npm ci
npm run build         # builds the client into dist/
npm start             # NODE_ENV=production tsx server/index.ts — serves dist/ + API on :8080
```

Put a reverse proxy (nginx/caddy) in front for TLS, forwarding both HTTP and WebSocket
upgrade requests (`/ws`) to port 8080. Example nginx location blocks:

```
location / { proxy_pass http://127.0.0.1:8080; }
location /ws {
  proxy_pass http://127.0.0.1:8080;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}
```

Use a process manager (systemd, pm2) to keep it alive. Set `PORT` to override 8080.

**WARNING before public hosting:** remove any copyrighted local audio files from
`public/` (e.g. `public/soundfont.sf2` and any personal `.mid` files in `public/music/`)
before building/deploying — those are local-only user files and must not be
redistributed. Everything that ships must be original work.
