import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import BlogIndexPage from '../../../../src/components/pages/BlogIndexPage';
import { getBlogPosts } from '../../../../src/config/blogPosts';

describe('BlogIndexPage', () => {
  it('renders shared hero and support content', () => {
    render(<BlogIndexPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'PDF Automation Guides & Tutorials' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'How to use these guides' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Rename + Mapping Docs' }).getAttribute('href')).toBe(
      '/usage-docs/rename-mapping',
    );
  });

  it('moves catalog packet posts to the end of the blog index order', () => {
    const slugs = getBlogPosts().map((post) => post.slug);
    const firstCatalogPacketPost = slugs.indexOf('uscis-immigration-packet-automation');
    const lastNonCatalogPost = slugs.indexOf('turn-homework-pdf-into-fillable-student-worksheet');

    expect(lastNonCatalogPost).toBeLessThan(firstCatalogPacketPost);
    expect(slugs.slice(firstCatalogPacketPost, firstCatalogPacketPost + 3)).toEqual([
      'uscis-immigration-packet-automation',
      'va-disability-claim-packet-automation',
      'social-security-disability-packet-automation',
    ]);
    expect(slugs.at(-1)).toBe('hud-usda-housing-assistance-packet-automation');
  });
});
