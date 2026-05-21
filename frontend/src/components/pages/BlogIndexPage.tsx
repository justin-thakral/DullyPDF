import { useEffect } from 'react';
import { getBlogPostLocale, getBlogPostPrimaryFigure, getBlogPosts } from '../../config/blogPosts';
import { applyRouteSeo } from '../../utils/seo';
import { Breadcrumbs } from '../ui/Breadcrumbs';
import { PublicSiteFrame } from '../ui/PublicSiteFrame';
import { resolveRouteSeoBodyContent } from '../../config/routeSeo';
import './BlogIndexPage.css';

type BlogIndexPageProps = {
  locale?: 'es' | 'in';
};

const BlogIndexPage = ({ locale }: BlogIndexPageProps) => {
  const postLocale = locale === 'in' ? 'in' : 'es';
  const posts = getBlogPosts().filter((post) => getBlogPostLocale(post) === postLocale);
  const bodyContent = resolveRouteSeoBodyContent({ kind: 'blog-index', locale: postLocale });
  const basePath = postLocale === 'in' ? '/in/blog' : '/es/blog';
  const localeCopy = postLocale === 'es'
    ? {
        home: 'Inicio',
        homeHref: '/es',
        fallbackHeading: 'Guías de Formularios PDF Rellenables',
        fallbackSummary: 'Guías prácticas para crear formularios PDF rellenables, mapear datos y automatizar flujos repetidos.',
        readMore: 'Leer guía',
        dateLocale: 'es',
      }
    : {
        home: 'India',
        homeHref: '/in',
        fallbackHeading: 'India PDF Form Automation Guides',
        fallbackSummary: 'Practical guides for Indian KYC, vendor, HR, GST, school, clinic, finance, and branch PDF workflows.',
        readMore: 'Read guide',
        dateLocale: 'en-IN',
      };

  useEffect(() => {
    applyRouteSeo({ kind: 'blog-index', locale: postLocale });
  }, [postLocale]);

  return (
    <PublicSiteFrame
      activeNavKey="blog"
      bodyClassName="blog-index__content"
      locale={postLocale === 'es' ? 'es' : 'en'}
      hideFormCatalog={postLocale === 'in'}
    >
      <div className="blog-index">
        <Breadcrumbs items={[{ label: localeCopy.home, href: localeCopy.homeHref }, { label: 'Blog' }]} />
        <section className="blog-index__hero">
          <p className="blog-index__kicker">{bodyContent?.heroKicker ?? 'Blog'}</p>
          <h1>{bodyContent?.heading ?? localeCopy.fallbackHeading}</h1>
          <p>{bodyContent?.paragraphs?.[0] ?? localeCopy.fallbackSummary}</p>
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
          {posts.map((post) => {
            const coverFigure = getBlogPostPrimaryFigure(post);

            return (
              <article key={post.slug} className="blog-index__post-card">
                {coverFigure ? (
                  <a href={`${basePath}/${post.slug}`} className="blog-index__post-media">
                    <img
                      src={coverFigure.src}
                      alt={coverFigure.alt}
                      loading="lazy"
                      decoding="async"
                      className="blog-index__post-image"
                    />
                  </a>
                ) : null}
                <h2>
                  <a href={`${basePath}/${post.slug}`}>{post.title}</a>
                </h2>
                <time className="blog-index__date" dateTime={post.publishedDate}>
                  {new Date(post.publishedDate + 'T00:00:00').toLocaleDateString(localeCopy.dateLocale, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </time>
                <p>{post.summary}</p>
                <a href={`${basePath}/${post.slug}`} className="blog-index__read-more">
                  {localeCopy.readMore}
                </a>
              </article>
            );
          })}
        </div>
      </div>
    </PublicSiteFrame>
  );
};

export default BlogIndexPage;
