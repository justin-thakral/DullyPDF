import { useEffect, useMemo } from 'react';
import { getRelatedBlogGuideLinksForPost } from '../../config/blogRelations';
import { getBlogPost, getBlogPostPrimaryFigure } from '../../config/blogPosts';
import { getBlogPostSeo } from '../../config/blogSeo';
import { getIntentPage } from '../../config/intentPages';
import {
  ESIGN_PIPELINE_DEMO_VIDEO,
  PDF_PACKET_SEARCH_FILL_DEMO_VIDEO,
} from '../../config/publicVideoContent';
import { getUsageDocsPage, usageDocsHref } from './usageDocsContent';
import { applyNoIndexSeo, applySeoMetadata } from '../../utils/seo';
import { Breadcrumbs } from '../ui/Breadcrumbs';
import PublicVideoPanel from './PublicVideoPanel';
import { PublicSiteFrame } from '../ui/PublicSiteFrame';
import './BlogPostPage.css';

const BLOG_POST_VIDEOS: Record<string, typeof ESIGN_PIPELINE_DEMO_VIDEO> = {
  'fill-entire-pdf-packet-from-one-row': PDF_PACKET_SEARCH_FILL_DEMO_VIDEO,
  'send-pdf-for-signature-by-email-or-web-form': ESIGN_PIPELINE_DEMO_VIDEO,
};

type BlogPostPageProps = {
  slug: string;
  locale?: 'en' | 'es' | 'in';
};

const formatDisplayDate = (date: string, locale = 'en-US'): string =>
  new Date(`${date}T00:00:00`).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

const BlogPostPage = ({ slug, locale }: BlogPostPageProps) => {
  const postLocale = locale === 'in' ? 'in' : locale === 'es' ? 'es' : 'en';
  const post = getBlogPost(slug, postLocale);
  const isSpanish = postLocale === 'es';
  const isIndia = postLocale === 'in';
  const basePath = isIndia ? '/in/blog' : isSpanish ? '/es/blog' : '/blog';
  const copy = postLocale === 'en'
    ? {
        home: 'Home',
        homeHref: '/',
        published: 'Published',
        updated: 'Last updated',
        by: 'by',
        notFoundTitle: 'Blog post not found',
        notFoundDescription: 'No DullyPDF blog post exists at this route.',
        backToBlog: 'Back to blog',
        inlineLinksLabel: 'Key resources',
        relatedPanel: 'Related resources for this guide',
        workflowPages: 'Workflow pages',
        documentation: 'Documentation',
        moreGuides: 'More guides',
        ctaPrimary: 'Try DullyPDF',
        ctaPrimaryHref: '/',
        ctaSecondary: 'View Getting Started Docs',
        ctaSecondaryHref: '/usage-docs/getting-started',
        dateLocale: 'en-US',
      }
    : isSpanish
      ? {
        home: 'Inicio',
        homeHref: '/es',
        published: 'Publicado',
        updated: 'Actualizado',
        by: 'por',
        notFoundTitle: 'Guía no encontrada',
        notFoundDescription: 'No existe una guía de DullyPDF en esta ruta.',
        backToBlog: 'Volver al blog',
        inlineLinksLabel: 'Recursos clave',
        relatedPanel: 'Recursos relacionados para esta guía',
        workflowPages: 'Páginas de flujo',
        documentation: 'Documentación',
        moreGuides: 'Más guías',
        ctaPrimary: 'Probar DullyPDF',
        ctaPrimaryHref: '/es',
        ctaSecondary: 'Ver documentación de uso',
        ctaSecondaryHref: '/es/usage-docs/getting-started',
        dateLocale: 'es',
      }
      : {
        home: 'India',
        homeHref: '/in',
        published: 'Published',
        updated: 'Last updated',
        by: 'by',
        notFoundTitle: 'Guide not found',
        notFoundDescription: 'No DullyPDF India blog guide exists at this route.',
        backToBlog: 'Back to India blog',
        inlineLinksLabel: 'Key India workflow links',
        relatedPanel: 'Related India resources for this guide',
        workflowPages: 'India workflow pages',
        documentation: 'Documentation',
        moreGuides: 'More India guides',
        ctaPrimary: 'Try DullyPDF India',
        ctaPrimaryHref: '/in',
        ctaSecondary: 'View Getting Started Docs',
        ctaSecondaryHref: '/usage-docs/getting-started',
        dateLocale: 'en-IN',
      };
  const relatedIntentLinks = useMemo(
    () => (post
      ? post.relatedIntentPages.map((key) => {
        const page = getIntentPage(key);
        return { label: page.navLabel, href: page.path };
      })
      : []),
    [post],
  );
  const relatedDocsLinks = useMemo(
    () => (post
      ? post.relatedDocs.map((key) => {
        const page = getUsageDocsPage(key);
        return { label: page.navLabel, href: usageDocsHref(key) };
      })
      : []),
    [post],
  );
  const relatedGuideLinks = useMemo(
    () => (post ? getRelatedBlogGuideLinksForPost(post.slug) : []),
    [post],
  );
  const inlineResourceLinks = useMemo(
    () => [...relatedIntentLinks.slice(0, 2), ...relatedDocsLinks.slice(0, 2)],
    [relatedDocsLinks, relatedIntentLinks],
  );
  const coverFigure = useMemo(() => (post ? getBlogPostPrimaryFigure(post) : null), [post]);
  const renderedSections = useMemo(() => {
    if (!post) return [];

    let skippedCoverFigure = false;

    return post.sections.map((section) => {
      const figures = (section.figures ?? []).filter((figure) => {
        if (
          coverFigure
          && !skippedCoverFigure
          && figure.src === coverFigure.src
          && figure.alt === coverFigure.alt
          && figure.caption === coverFigure.caption
        ) {
          skippedCoverFigure = true;
          return false;
        }

        return true;
      });

      return {
        ...section,
        figures,
      };
    });
  }, [coverFigure, post]);

  useEffect(() => {
    if (post) {
      applySeoMetadata(getBlogPostSeo(post));
      return;
    }
    applyNoIndexSeo({
      title: 'Blog Post Not Found (404) | DullyPDF',
      description: copy.notFoundDescription,
      canonicalPath: basePath,
    });
  }, [basePath, copy.notFoundDescription, post]);

  if (!post) {
    return (
      <PublicSiteFrame
        activeNavKey="blog"
        bodyClassName="blog-post__content"
        locale={isSpanish ? 'es' : 'en'}
        hideFormCatalog={isIndia}
      >
        <div className="blog-post blog-post--not-found">
          <section className="blog-post__not-found">
            <p className="blog-post__not-found-code">404</p>
            <h1>{copy.notFoundTitle}</h1>
            <p>
              {copy.notFoundDescription}{' '}
              <code>{basePath}/{slug}</code>. <a href={basePath}>{copy.backToBlog}</a>.
            </p>
          </section>
        </div>
      </PublicSiteFrame>
    );
  }

  const publishedDateLabel = formatDisplayDate(post.publishedDate, copy.dateLocale);
  const updatedDateLabel = formatDisplayDate(post.updatedDate, copy.dateLocale);
  const showUpdatedDate = post.updatedDate !== post.publishedDate;
  const postVideo = BLOG_POST_VIDEOS[post.slug] ?? null;

  return (
    <PublicSiteFrame
      activeNavKey="blog"
      bodyClassName="blog-post__content"
      locale={isSpanish ? 'es' : 'en'}
      hideFormCatalog={isIndia}
    >
      <div className="blog-post">
        <div className="blog-post__main">
          <Breadcrumbs
            items={[
              { label: copy.home, href: copy.homeHref },
              { label: 'Blog', href: basePath },
              { label: post.title },
            ]}
          />

          <article className="blog-post__article">
            <header className="blog-post__article-header">
              <h1>{post.title}</h1>
              <div className="blog-post__meta">
                <span className="blog-post__meta-label">{copy.published}</span>
                <time dateTime={post.publishedDate}>{publishedDateLabel}</time>
                {showUpdatedDate ? (
                  <>
                    <span className="blog-post__meta-separator" aria-hidden="true">•</span>
                    <span className="blog-post__meta-label">{copy.updated}</span>
                    <time dateTime={post.updatedDate}>{updatedDateLabel}</time>
                  </>
                ) : null}
                <span className="blog-post__author">{copy.by} {post.author}</span>
              </div>
              <p className="blog-post__summary">{post.summary}</p>
              {coverFigure ? (
                <figure className="blog-post__cover">
                  <img
                    src={coverFigure.src}
                    alt={coverFigure.alt}
                    loading="eager"
                    decoding="async"
                    className="blog-post__cover-image"
                  />
                  <figcaption>{coverFigure.caption}</figcaption>
                </figure>
              ) : null}
              {inlineResourceLinks.length > 0 ? (
                <div className="blog-post__inline-links" aria-label={copy.inlineLinksLabel}>
                  <span className="blog-post__inline-links-label">{copy.inlineLinksLabel}</span>
                  <div className="blog-post__inline-links-list">
                    {inlineResourceLinks.map((link) => (
                      <a key={link.href} href={link.href} className="blog-post__inline-link">
                        {link.label}
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </header>

            {postVideo ? <PublicVideoPanel {...postVideo} /> : null}

            {renderedSections.map((section) => (
              <section key={section.id} id={section.id} className="blog-post__section">
                <h2>{section.title}</h2>
                {section.paragraphs.map((paragraph, index) => (
                  <p key={`${section.id}-paragraph-${index}`}>{paragraph}</p>
                ))}
                {section.figures?.length ? (
                  <div className="blog-post__figure-grid">
                    {section.figures.map((figure) => (
                      <figure key={`${section.id}-${figure.src}-${figure.caption}`} className="blog-post__figure">
                        <img
                          src={figure.src}
                          alt={figure.alt}
                          loading="lazy"
                          decoding="async"
                          className="blog-post__figure-image"
                        />
                        <figcaption>{figure.caption}</figcaption>
                      </figure>
                    ))}
                  </div>
                ) : null}
                {section.bullets?.length ? (
                  <ul>
                    {section.bullets.map((bullet) => (
                      <li key={`${section.id}-${bullet}`}>{bullet}</li>
                    ))}
                  </ul>
                ) : null}
                {section.links?.length ? (
                  <div className="blog-post__resource-links" aria-label={`${section.title} links`}>
                    {section.links.map((link) => (
                      <a key={`${section.id}-${link.href}`} href={link.href} className="blog-post__resource-link">
                        <span className="blog-post__resource-link-label">{link.label}</span>
                        {link.description ? (
                          <span className="blog-post__resource-link-description">{link.description}</span>
                        ) : null}
                      </a>
                    ))}
                  </div>
                ) : null}
              </section>
            ))}

          </article>

          {(relatedIntentLinks.length > 0 || relatedDocsLinks.length > 0 || relatedGuideLinks.length > 0) && (
            <section className="blog-post__panel">
              <h2>{copy.relatedPanel}</h2>
              <div className="blog-post__related-grid">
                {relatedIntentLinks.length > 0 && (
                  <div>
                    <h3>{copy.workflowPages}</h3>
                    <ul>
                      {relatedIntentLinks.map((link) => (
                        <li key={link.href}>
                          <a href={link.href}>{link.label}</a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {relatedDocsLinks.length > 0 && (
                  <div>
                    <h3>{copy.documentation}</h3>
                    <ul>
                      {relatedDocsLinks.map((link) => (
                        <li key={link.href}>
                          <a href={link.href}>{link.label}</a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {relatedGuideLinks.length > 0 && (
                  <div>
                    <h3>{copy.moreGuides}</h3>
                    <ul>
                      {relatedGuideLinks.map((guide) => (
                        <li key={guide.href}>
                          <a href={guide.href}>{guide.title}</a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          )}

          <section className="blog-post__panel blog-post__panel--cta">
            <h2>Continue from {post.title}</h2>
            <p>
              Use this guide as the starting point, then move into the DullyPDF workflow or docs page that matches the
              next step in {post.title.toLowerCase()}.
            </p>
            <div className="blog-post__cta">
              <a href={copy.ctaPrimaryHref} className="blog-post__cta-button">{copy.ctaPrimary}</a>
              <a href={copy.ctaSecondaryHref} className="blog-post__cta-link">{copy.ctaSecondary}</a>
            </div>
          </section>
        </div>
      </div>
    </PublicSiteFrame>
  );
};

export default BlogPostPage;
