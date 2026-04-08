import { useEffect } from 'react';
import { getBlogPosts } from '../../config/blogPosts';
import { BLOG_INDEX_SEO } from '../../config/blogSeo';
import { applySeoMetadata } from '../../utils/seo';
import { Breadcrumbs } from '../ui/Breadcrumbs';
import { PublicSiteFrame } from '../ui/PublicSiteFrame';
import { resolveRouteSeoBodyContent } from '../../config/routeSeo';
import './BlogIndexPage.css';

const BlogIndexPage = () => {
  const posts = getBlogPosts();
  const bodyContent = resolveRouteSeoBodyContent({ kind: 'blog-index' });

  useEffect(() => {
    applySeoMetadata(BLOG_INDEX_SEO);
  }, []);

  return (
    <PublicSiteFrame activeNavKey="blog" bodyClassName="blog-index__content">
      <div className="blog-index">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Blog' }]} />
        <section className="blog-index__hero">
          <p className="blog-index__kicker">{bodyContent?.heroKicker ?? 'Blog'}</p>
          <h1>{bodyContent?.heading ?? 'PDF Automation Guides & Tutorials'}</h1>
          <p>{bodyContent?.paragraphs?.[0] ?? 'Practical guides for converting PDFs to fillable forms, mapping fields to databases, and automating repetitive form-filling workflows.'}</p>
        </section>

        <section className="blog-index__support">
          {(bodyContent?.supportSections ?? []).map((section) => (
            <article key={section.title} className="blog-index__support-card">
              <h2>{section.title}</h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.links?.length ? (
                <ul>
                  {section.links.map((link) => (
                    <li key={link.href}>
                      <a href={link.href}>{link.label}</a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </section>

        <div className="blog-index__grid">
          {posts.map((post) => (
            <article key={post.slug} className="blog-index__post-card">
              <h2>
                <a href={`/blog/${post.slug}`}>{post.title}</a>
              </h2>
              <time className="blog-index__date" dateTime={post.publishedDate}>
                {new Date(post.publishedDate + 'T00:00:00').toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </time>
              <p>{post.summary}</p>
              <a href={`/blog/${post.slug}`} className="blog-index__read-more">
                Read more
              </a>
            </article>
          ))}
        </div>
      </div>
    </PublicSiteFrame>
  );
};

export default BlogIndexPage;
