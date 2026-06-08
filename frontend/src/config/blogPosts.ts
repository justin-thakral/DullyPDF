import type { IntentPageKey } from './intentPages';
import type { UsageDocsPageKey } from '../components/pages/usageDocsContent';
import { BLOG_POSTS as SHARED_BLOG_POSTS } from './blogContent.mjs';

export type BlogPostLocale = 'en' | 'es' | 'in';

export type BlogPostFigure = {
  src: string;
  alt: string;
  caption: string;
};

export type BlogPostSectionLink = {
  label: string;
  href: string;
  description?: string;
};

export type BlogPostSection = {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
  figures?: BlogPostFigure[];
  links?: BlogPostSectionLink[];
};

export type BlogPost = {
  slug: string;
  locale?: BlogPostLocale;
  title: string;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string[];
  publishedDate: string;
  updatedDate: string;
  author: string;
  summary: string;
  sections: BlogPostSection[];
  relatedIntentPages: IntentPageKey[];
  relatedDocs: UsageDocsPageKey[];
};

const BLOG_POSTS = SHARED_BLOG_POSTS as BlogPost[];

const POST_BY_SLUG = new Map<string, BlogPost>(BLOG_POSTS.map((post) => [post.slug, post]));

export const getBlogPostLocale = (post: BlogPost): BlogPostLocale => post.locale ?? 'en';

export const getBlogPosts = (): BlogPost[] => BLOG_POSTS;

export const getBlogPost = (slug: string, locale?: BlogPostLocale): BlogPost | undefined => {
  const post = POST_BY_SLUG.get(slug);
  if (!post) return undefined;
  if (locale && getBlogPostLocale(post) !== locale) return undefined;
  return post;
};

export const getBlogSlugs = (): string[] => BLOG_POSTS.map((post) => post.slug);

export const getBlogPostPrimaryFigure = (post: BlogPost): BlogPostFigure | null =>
  post.sections.flatMap((section) => section.figures ?? [])[0] ?? null;
