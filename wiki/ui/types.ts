export interface WikiArticle {
  slug: string;
  title: string;
  category: string;
  excerpt: string;
  html: string;
  infobox?: Record<string, string>;
}

export interface SpriteSpec {
  grid: string[];
  palette: Record<string, string>;
}

export interface WikiData {
  generatedAt: string;
  articles: Record<string, WikiArticle>;
  search: { slug: string; title: string; category: string; excerpt: string }[];
  categories: Record<string, { slug: string; title: string }[]>;
  sprites?: Record<string, SpriteSpec>;
}
