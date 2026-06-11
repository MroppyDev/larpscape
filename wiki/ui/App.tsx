import { useEffect, useState, useCallback } from 'react';
import { Routes, Route, useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import type { WikiData, WikiArticle } from './types';
import wikiData from './data/wiki-data.json';
import PixIcon, { hydratePixIcons } from './PixIcon';

const data = wikiData as WikiData;

function fetchGePrices() {
  const els = document.querySelectorAll<HTMLElement>('.ge-price[data-item]');
  if (!els.length) return;

  fetch('/api/ge/prices')
    .then((r) => (r.ok ? r.json() : null))
    .then((json: { prices?: Record<string, number | null> } | null) => {
      if (!json?.prices) return;
      els.forEach((el) => {
        const id = el.dataset.item!;
        const p = json.prices![id];
        el.textContent = p != null ? `${p.toLocaleString()} coins` : 'No trades yet';
        el.classList.add(p != null ? 'ge-has-price' : 'ge-no-price');
      });
    })
    .catch(() => {
      els.forEach((el) => { el.textContent = '—'; });
    });
}

function WikiHeader({ onSearch }: { onSearch: (q: string) => void }) {
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim()) {
      onSearch(q.trim());
      navigate(`/search?q=${encodeURIComponent(q.trim())}`);
    }
  }

  return (
    <header className="wiki-header">
      <div className="wiki-header-inner">
        <Link to="/" className="wiki-logo">
          <span className="wiki-logo-icon">📖</span>
          <span className="wiki-logo-text">
            <strong>Larpscape</strong> Wiki
          </span>
        </Link>
        <form className="wiki-search" onSubmit={submit}>
          <input
            type="search"
            placeholder="Search the wiki…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search"
          />
          <button type="submit">Search</button>
        </form>
        <nav className="wiki-topnav">
          <a href="https://larpscape.net" target="_blank" rel="noreferrer">Play game</a>
        </nav>
      </div>
    </header>
  );
}

function Sidebar() {
  const cats = [
    { label: 'Guides', slug: 'guide/getting-started' },
    { label: 'Items', slug: 'category/items' },
    { label: 'Item prices', slug: 'item-prices' },
    { label: 'NPCs', slug: 'category/npcs' },
    { label: 'Quests', slug: 'category/quests' },
    { label: 'Shops', slug: 'category/shops' },
    { label: 'Skills', slug: 'category/skills' },
    { label: 'Locations', slug: 'category/locations' },
    { label: 'Bosses', slug: 'category/bosses' },
    { label: 'Aldgate Exchange', slug: 'guide/aldgate-exchange' },
  ];

  const lore = [
    { label: 'The World of Cantorne', slug: 'lore/world' },
    { label: 'Factions', slug: 'lore/factions' },
    { label: 'Bestiary of the Offnote', slug: 'lore/bestiary' },
    { label: 'All lore pages', slug: 'category/lore' },
  ];

  return (
    <aside className="wiki-sidebar">
      <div className="sidebar-block">
        <h3>Navigation</h3>
        <ul>
          <li><Link to="/">Main page</Link></li>
          {cats.map((c) => (
            <li key={c.slug}><Link to={`/${c.slug}`}>{c.label}</Link></li>
          ))}
        </ul>
      </div>
      <div className="sidebar-block">
        <h3>Lore</h3>
        <ul>
          {lore.map((c) => (
            <li key={c.slug}><Link to={`/${c.slug}`}>{c.label}</Link></li>
          ))}
        </ul>
      </div>
      <div className="sidebar-block">
        <h3>Tools</h3>
        <ul>
          <li><Link to="/item-prices">GE price list</Link></li>
          <li><Link to="/guide/controls">Controls</Link></li>
          <li><Link to="/guide/combat">Combat guide</Link></li>
        </ul>
      </div>
      <div className="sidebar-block sidebar-game">
        <h3>Play Larpscape</h3>
        <p>A browser MMORPG inspired by classic RuneScape.</p>
        <a href="https://larpscape.net" className="play-btn" target="_blank" rel="noreferrer">Play now</a>
      </div>
    </aside>
  );
}

function ArticleView({ article }: { article: WikiArticle }) {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = `${article.title} — Larpscape Wiki`;
    fetchGePrices();
    hydratePixIcons();
  }, [article.title, article.html]);

  const onContentClick = useCallback((e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a.wiki-link');
    if (!a) return;
    const href = a.getAttribute('href');
    if (href?.startsWith('/')) {
      e.preventDefault();
      navigate(href);
    }
  }, [navigate]);

  return (
    <main className="wiki-content">
      <div className="breadcrumb">
        <Link to="/">Main page</Link>
        <span> / </span>
        <span>{article.category}</span>
        <span> / </span>
        <span className="bc-current">{article.title}</span>
      </div>
      <h1 className="first-heading">{article.title}</h1>
      <div
        className="mw-parser-output"
        dangerouslySetInnerHTML={{ __html: article.html }}
        onClick={onContentClick}
      />
      <div className="article-meta">
        Category: <strong>{article.category}</strong>
      </div>
    </main>
  );
}

function ArticlePage() {
  const params = useParams();
  const path = (params['*'] ?? '').replace(/\/$/, '');
  const article = data.articles[path] ?? (path === '' ? data.articles[''] : undefined);

  if (!article) {
    return (
      <main className="wiki-content">
        <h1>Page not found</h1>
        <p>No article found for <code>/{path}</code>.</p>
        <p><Link to="/">Return to main page</Link></p>
      </main>
    );
  }

  return <ArticleView article={article} />;
}

function SearchPage() {
  const location = useLocation();
  const q = new URLSearchParams(location.search).get('q') ?? '';
  const lower = q.toLowerCase();

  const results = q
    ? data.search.filter((s) =>
        s.title.toLowerCase().includes(lower) ||
        s.excerpt.toLowerCase().includes(lower) ||
        s.category.toLowerCase().includes(lower) ||
        s.slug.toLowerCase().includes(lower),
      ).slice(0, 50)
    : [];

  return (
    <main className="wiki-content">
      <h1>Search results</h1>
      {q ? <p>Results for <strong>{q}</strong> ({results.length})</p> : <p>Enter a search term above.</p>}
      <ul className="search-results">
        {results.map((r) => (
          <li key={r.slug}>
            {r.slug.startsWith('item/') && <PixIcon id={r.slug.slice(5)} size={20} />}
            <Link to={`/${r.slug}`}>{r.title}</Link>
            <span className="search-cat">{r.category}</span>
            <p>{r.excerpt}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}

export default function App() {
  return (
    <div className="wiki-app">
      <WikiHeader onSearch={() => {}} />
      <div className="wiki-body">
        <Sidebar />
        <Routes>
          <Route path="/search" element={<SearchPage />} />
          <Route path="/*" element={<ArticlePage />} />
        </Routes>
      </div>
      <footer className="wiki-footer">
        <p>
          Larpscape Wiki — unofficial game encyclopedia. Not affiliated with Jagex.
          Content generated from game data. GE prices update live from player trades.
        </p>
        <p>Data generated: {new Date(data.generatedAt).toLocaleString()}</p>
      </footer>
    </div>
  );
}
