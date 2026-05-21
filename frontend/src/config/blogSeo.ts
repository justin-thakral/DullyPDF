import type { BlogPost } from './blogPosts';
import { getBlogPostLocale } from './blogPosts';
import {
  BLOG_INDEX_SEO,
  resolveBlogRouteSeo,
  type PublicRouteLocale,
  type RouteSeoMetadata,
} from './routeSeo';

export { BLOG_INDEX_SEO };

export const getBlogPostSeo = (post: BlogPost): RouteSeoMetadata =>
  resolveBlogRouteSeo(post.slug, getBlogPostLocale(post)) ?? BLOG_INDEX_SEO;

export const resolveBlogSeo = (
  slug: string | undefined,
  locale?: PublicRouteLocale,
): RouteSeoMetadata | null => resolveBlogRouteSeo(slug, locale);
