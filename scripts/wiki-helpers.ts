// Shared HTML helpers for the Larpscape wiki build script.

export interface WikiArticle {
  slug: string;
  title: string;
  category: string;
  excerpt: string;
  html: string;
  infobox?: Record<string, string>;
}

export interface WikiData {
  generatedAt: string;
  articles: Record<string, WikiArticle>;
  search: { slug: string; title: string; category: string; excerpt: string }[];
  categories: Record<string, { slug: string; title: string }[]>;
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function link(slug: string, text?: string): string {
  return `<a href="/${slug}" class="wiki-link">${esc(text ?? slug)}</a>`;
}

export function p(text: string): string {
  return `<p>${text}</p>`;
}

export function h2(text: string): string {
  return `<h2>${esc(text)}</h2>`;
}

export function h3(text: string): string {
  return `<h3>${esc(text)}</h3>`;
}

export function ul(items: string[]): string {
  return `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
}

export function table(headers: string[], rows: string[][]): string {
  const th = headers.map((h) => `<th>${h}</th>`).join('');
  const tr = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
  return `<table class="wikitable"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

export function infobox(title: string, rows: [string, string][]): string {
  const body = rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join('');
  return `<aside class="infobox"><div class="infobox-title">${esc(title)}</div><table>${body}</table></aside>`;
}

export function article(title: string, body: string, infoboxHtml?: string): string {
  return infoboxHtml ? `<div class="article-body">${infoboxHtml}${body}</div>` : `<div class="article-body">${body}</div>`;
}

export function chanceLabel(c: number): string {
  if (c >= 1) return 'Always';
  return `${(c * 100).toFixed(1)}%`;
}

export function shopBuyPrice(value: number): number {
  return Math.max(1, Math.ceil(value));
}

export function shopSellPrice(value: number): number {
  return Math.max(1, Math.floor(value * 0.4));
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function finalize(data: WikiData): WikiData {
  data.search = Object.values(data.articles).map((a) => ({
    slug: a.slug,
    title: a.title,
    category: a.category,
    excerpt: a.excerpt,
  }));
  const cats: Record<string, { slug: string; title: string }[]> = {};
  for (const a of Object.values(data.articles)) {
    (cats[a.category] ??= []).push({ slug: a.slug, title: a.title });
  }
  for (const k of Object.keys(cats)) cats[k].sort((a, b) => a.title.localeCompare(b.title));
  data.categories = cats;
  return data;
}

export function addArticle(data: WikiData, article: WikiArticle) {
  data.articles[article.slug] = article;
}
