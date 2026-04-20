import type { IntentPageKey } from './intentPages';
import type { UsageDocsPageKey } from '../components/pages/usageDocsContent';
import { BLOG_POSTS as SHARED_BLOG_POSTS } from './blogContent.mjs';

export type BlogPostFigure = {
  src: string;
  alt: string;
  caption: string;
};

export type BlogPostSection = {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
  figures?: BlogPostFigure[];
};

export type BlogPost = {
  slug: string;
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

export const getBlogPosts = (): BlogPost[] => BLOG_POSTS;

export const getBlogPost = (slug: string): BlogPost | undefined => POST_BY_SLUG.get(slug);

export const getBlogSlugs = (): string[] => BLOG_POSTS.map((post) => post.slug);

export const getBlogPostPrimaryFigure = (post: BlogPost): BlogPostFigure | null =>
  post.sections.flatMap((section) => section.figures ?? [])[0] ?? null;
