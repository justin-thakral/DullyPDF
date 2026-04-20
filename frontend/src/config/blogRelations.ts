import type { UsageDocsPageKey } from '../components/pages/usageDocsContent';
import { getBlogPosts, type BlogPost } from './blogPosts';
import type { IntentPageKey } from './intentPages';

export type BlogGuideLink = {
  slug: string;
  title: string;
  href: string;
  summary: string;
};

const BLOG_POSTS = getBlogPosts();

const compareBlogPostsByFreshness = (left: BlogPost, right: BlogPost): number =>
  right.updatedDate.localeCompare(left.updatedDate)
  || right.publishedDate.localeCompare(left.publishedDate)
  || left.title.localeCompare(right.title);

const buildBlogGuideLink = (post: BlogPost): BlogGuideLink => ({
  slug: post.slug,
  title: post.title,
  href: `/blog/${post.slug}`,
  summary: post.summary,
});

const countSharedValues = <T,>(values: T[], allowedValues: Set<T>): number =>
  values.reduce((count, value) => (allowedValues.has(value) ? count + 1 : count), 0);

export const getBlogGuideLinksForIntentPage = (pageKey: IntentPageKey): BlogGuideLink[] =>
  BLOG_POSTS
    .filter((post) => post.relatedIntentPages.includes(pageKey))
    .sort(compareBlogPostsByFreshness)
    .map(buildBlogGuideLink);

export const getBlogGuideLinksForUsageDocsPage = (
  pageKey: UsageDocsPageKey,
  relatedWorkflowKeys: IntentPageKey[] = [],
): BlogGuideLink[] => {
  const relatedWorkflowKeySet = new Set(relatedWorkflowKeys);
  const rankedGuides = BLOG_POSTS
    .map((post) => {
      const directDocMatch = post.relatedDocs.includes(pageKey);
      const sharedWorkflowCount = countSharedValues(post.relatedIntentPages, relatedWorkflowKeySet);
      const score = (directDocMatch ? 4 : 0) + sharedWorkflowCount;
      return { post, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || compareBlogPostsByFreshness(left.post, right.post))
    .map((entry) => buildBlogGuideLink(entry.post));

  if (rankedGuides.length > 0) {
    return rankedGuides;
  }

  return BLOG_POSTS
    .slice()
    .sort(compareBlogPostsByFreshness)
    .slice(0, 6)
    .map(buildBlogGuideLink);
};

export const getRelatedBlogGuideLinksForPost = (slug: string, limit = 4): BlogGuideLink[] => {
  const post = BLOG_POSTS.find((entry) => entry.slug === slug);
  if (!post) {
    return [];
  }

  const relatedIntentKeySet = new Set(post.relatedIntentPages);
  const relatedDocKeySet = new Set(post.relatedDocs);
  const rankedGuides = BLOG_POSTS
    .filter((candidate) => candidate.slug !== post.slug)
    .map((candidate) => {
      const sharedIntentCount = countSharedValues(candidate.relatedIntentPages, relatedIntentKeySet);
      const sharedDocCount = countSharedValues(candidate.relatedDocs, relatedDocKeySet);
      const score = (sharedIntentCount * 3) + (sharedDocCount * 2);
      return { candidate, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || compareBlogPostsByFreshness(left.candidate, right.candidate))
    .map((entry) => buildBlogGuideLink(entry.candidate))
    .slice(0, limit);

  if (rankedGuides.length >= limit) {
    return rankedGuides;
  }

  const seenSlugs = new Set(rankedGuides.map((guide) => guide.slug));
  return [
    ...rankedGuides,
    ...BLOG_POSTS
      .slice()
      .sort(compareBlogPostsByFreshness)
      .filter((candidate) => candidate.slug !== post.slug && !seenSlugs.has(candidate.slug))
      .map(buildBlogGuideLink),
  ].slice(0, limit);
};
