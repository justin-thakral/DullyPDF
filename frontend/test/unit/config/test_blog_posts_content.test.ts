import { describe, expect, it } from 'vitest';
import { getBlogPosts } from '../../../src/config/blogPosts';

describe('blog post content', () => {
  it('keeps every post in article format with supporting figures', () => {
    const posts = getBlogPosts();

    expect(posts.length).toBeGreaterThan(0);

    for (const post of posts) {
      const figureCount = post.sections.reduce(
        (total, section) => total + (section.figures?.length ?? 0),
        0,
      );

      expect(post.sections.length, `${post.slug} should have enough article sections`).toBeGreaterThanOrEqual(4);
      expect(figureCount, `${post.slug} should include at least two figures`).toBeGreaterThanOrEqual(2);
      expect(figureCount, `${post.slug} should not include more than ten figures`).toBeLessThanOrEqual(10);

      for (const section of post.sections) {
        expect(section.paragraphs.length, `${post.slug}/${section.id} should include article paragraphs`).toBeGreaterThan(0);
        for (const paragraph of section.paragraphs) {
          expect(paragraph.length, `${post.slug}/${section.id} paragraphs should carry real body copy`).toBeGreaterThan(80);
        }

        for (const figure of section.figures ?? []) {
          expect(figure.src, `${post.slug}/${section.id} figure src should point at a public asset`).toMatch(/^\/(demo|blog|seo)\//);
          expect(figure.alt.length, `${post.slug}/${section.id} figure alt text should be descriptive`).toBeGreaterThan(20);
          expect(figure.caption.length, `${post.slug}/${section.id} figure captions should add context`).toBeGreaterThan(20);
        }
      }
    }
  });
});
