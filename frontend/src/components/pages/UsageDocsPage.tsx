import { useEffect, useMemo } from 'react';
import type { UsageDocsLocale, UsageDocsPageKey } from './usageDocsContent';
import {
  getUsageDocsPage as getEnglishUsageDocsPage,
  getUsageDocsPages as getEnglishUsageDocsPages,
  usageDocsHref as englishUsageDocsHref,
} from './usageDocsContent';
import {
  getUsageDocsPage as getSpanishUsageDocsPage,
  getUsageDocsPages as getSpanishUsageDocsPages,
  usageDocsHref as spanishUsageDocsHref,
} from './usageDocsSpanishContent';
import './UsageDocsPage.css';
import { applyRouteSeo } from '../../utils/seo';
import { Breadcrumbs } from '../ui/Breadcrumbs';
import { PublicSiteFrame } from '../ui/PublicSiteFrame';
import type { IntentPageKey } from '../../config/intentPages';
import { getIntentPage } from '../../config/intentPages';
import { getBlogGuideLinksForUsageDocsPage } from '../../config/blogRelations';
import {
  FILL_PDF_FROM_FILE_DEMO_VIDEO,
  FULL_FEATURE_DEMO_VIDEO,
  PDF_TO_FILLABLE_DEMO_VIDEO,
  WEB_FORM_AND_SIGN_DEMO_VIDEO,
} from '../../config/publicVideoContent';
import PublicVideoPanel from './PublicVideoPanel';
import PublicProfileLinksPanel from './PublicProfileLinksPanel';

type UsageDocsPageProps = {
  pageKey: UsageDocsPageKey;
  locale?: UsageDocsLocale;
};

const getEnglishPageVideo = (pageKey: UsageDocsPageKey) => {
  if (pageKey === 'index') return FULL_FEATURE_DEMO_VIDEO;
  if (pageKey === 'getting-started') return PDF_TO_FILLABLE_DEMO_VIDEO;
  if (pageKey === 'search-fill') return FILL_PDF_FROM_FILE_DEMO_VIDEO;
  if (pageKey === 'fill-by-link') return WEB_FORM_AND_SIGN_DEMO_VIDEO;
  return null;
};

const getSpanishPageVideo = (pageKey: UsageDocsPageKey) => {
  if (pageKey === 'index') {
    return {
      ...FULL_FEATURE_DEMO_VIDEO,
      eyebrow: 'Recorrido en video',
      title: 'Recorrido de 7 minutos por DullyPDF',
      description:
        'Este video muestra el flujo principal: preparar una plantilla, rellenar desde datos, guardar formularios, publicar Fill By Link y usar API Fill.',
      durationLabel: '7 minutos',
      caption:
        'Úsalo para entender el producto antes de entrar en una guía operativa concreta.',
      linkLabel: 'Ver en YouTube',
    };
  }
  if (pageKey === 'getting-started') {
    return {
      ...PDF_TO_FILLABLE_DEMO_VIDEO,
      eyebrow: 'Demo enfocada',
      title: 'Recorrido de 3 minutos: PDF a formulario rellenable',
      description:
        'Este video se centra en la ruta base: subir un PDF, detectar campos, limpiar la plantilla y guardarla para reutilizarla.',
      durationLabel: '3 minutos',
      caption:
        'Úsalo cuando quieras validar una sola plantilla antes de ampliar el flujo.',
      linkLabel: 'Ver en YouTube',
    };
  }
  if (pageKey === 'search-fill') {
    return {
      ...FILL_PDF_FROM_FILE_DEMO_VIDEO,
      eyebrow: 'Demo de archivo',
      title: 'Rellenar PDF desde CSV, Excel o JSON',
      description:
        'Este video muestra cómo abrir una plantilla guardada y rellenarla desde filas CSV, Excel o JSON sin salir del navegador.',
      durationLabel: 'Recorrido de Fill by File',
      caption:
        'Úsalo para validar el relleno desde archivos antes de llevar el flujo al resto del equipo.',
      linkLabel: 'Ver en YouTube',
    };
  }
  return null;
};

const UsageDocsPage = ({ pageKey, locale = 'en' }: UsageDocsPageProps) => {
  const isSpanish = locale === 'es';
  const page = isSpanish ? getSpanishUsageDocsPage(pageKey) : getEnglishUsageDocsPage(pageKey);
  const pages = isSpanish ? getSpanishUsageDocsPages() : getEnglishUsageDocsPages();
  const pageVideo = isSpanish ? getSpanishPageVideo(pageKey) : getEnglishPageVideo(pageKey);
  const usageDocsHref = isSpanish ? spanishUsageDocsHref : englishUsageDocsHref;
  const copy = isSpanish
    ? {
        homeLabel: 'Inicio',
        homeHref: '/es',
        docsLabel: 'Documentación',
        localNavAriaLabel: 'Navegación auxiliar de documentación',
        localNavDocsLabel: 'Documentación',
        privacyLabel: 'Privacidad',
        termsLabel: 'Términos',
        kicker: 'Documentación de uso',
        sidebarAriaLabel: 'Barra lateral de documentación',
        pagesLabel: 'Páginas',
        onThisPageLabel: 'En esta página',
        introTitle: 'Cómo usar esta página',
        introParagraphs: [
          'Esta página cubre una etapa operativa del flujo de DullyPDF para que puedas hacer una prueba controlada sin adivinar. Lee las secciones, valida con un documento representativo y luego pasa a la página relacionada.',
          'Ese orden importa porque la mayoría de los problemas nacen al mezclar detección, mapeo, relleno y publicación en una sola pasada. Un ciclo pequeño facilita diagnosticar y confiar en la plantilla.',
        ],
        profileTitle: 'Perfiles oficiales de DullyPDF',
        profileDescription:
          'Estos enlaces conectan la documentación pública, demos del producto, presencia de la empresa e implementación abierta sin volver a la página principal.',
        adjacentTitle: 'Continuar en la documentación',
        adjacentDescription:
          'Pasa a la página más cercana en vez de saltar a funciones no relacionadas. Así la secuencia de despliegue se valida con menos desvíos entre plantillas.',
        workflowsTitle: 'Flujos relacionados',
        workflowsDescription:
          'Estas páginas explican el caso de uso público del mismo flujo antes de volver a los detalles operativos.',
        guidesTitle: 'Guías relacionadas',
        guidesDescription:
          'Estas guías muestran ejemplos concretos del mismo flujo cuando necesitas contexto antes de volver a la documentación operativa.',
      }
    : {
        homeLabel: 'Home',
        homeHref: '/',
        docsLabel: 'Usage Docs',
        localNavAriaLabel: 'Usage docs utility navigation',
        localNavDocsLabel: 'Usage Docs',
        privacyLabel: 'Privacy Policy',
        termsLabel: 'Terms of Service',
        kicker: 'Usage docs',
        sidebarAriaLabel: 'Usage docs sidebar',
        pagesLabel: 'Pages',
        onThisPageLabel: 'On this page',
        introTitle: 'How to use this docs page',
        introParagraphs: [
          'This page is meant to answer one operational stage of the DullyPDF workflow well enough that you can run a controlled test without guessing. Read the sections below, validate the behavior against one representative document, and only then move to the next linked page.',
          'That order matters because most setup failures come from mixing detection, mapping, fill validation, and sharing into one unstructured pass. A narrower review loop keeps troubleshooting faster and makes the template easier to trust once you save it for reuse.',
        ],
        profileTitle: 'Official DullyPDF profiles',
        profileDescription:
          'These links help operators move between the public docs, product demos, company presence, and open-source implementation without falling back to the homepage.',
        adjacentTitle: 'Continue through the docs',
        adjacentDescription:
          'Move to the next closest docs page instead of skipping ahead to unrelated features. That keeps the rollout sequence easier to validate and reduces setup drift between templates.',
        workflowsTitle: 'Related workflows',
        workflowsDescription:
          'These workflow pages explain the public search-intent side of the same feature area, which is useful when you need a higher-level route summary before returning to the operational docs.',
        guidesTitle: 'Related guides',
        guidesDescription:
          'These blog posts show concrete rollout examples and comparisons for the same workflow area, which is useful when you want a narrower example before returning to the operational docs.',
      };

  const relatedWorkflows = useMemo(() => {
    const keys: IntentPageKey[] = page.relatedWorkflowKeys ?? [];
    return keys.map((key) => {
      const p = getIntentPage(key);
      return { label: p.navLabel, href: p.path };
    });
  }, [page.relatedWorkflowKeys]);
  const relatedGuides = useMemo(
    () => getBlogGuideLinksForUsageDocsPage(page.key, page.relatedWorkflowKeys ?? [], isSpanish ? 'es' : 'en'),
    [isSpanish, page.key, page.relatedWorkflowKeys],
  );
  const adjacentDocs = useMemo(() => {
    const currentIndex = pages.findIndex((entry) => entry.key === pageKey);
    return pages.filter((entry, index) => entry.key !== pageKey && Math.abs(index - currentIndex) <= 2);
  }, [pageKey, pages]);

  useEffect(() => {
    applyRouteSeo({ kind: 'usage-docs', pageKey, ...(isSpanish ? { locale: 'es' } as const : {}) });
  }, [isSpanish, pageKey]);

  const breadcrumbItems = pageKey === 'index'
    ? [{ label: copy.homeLabel, href: copy.homeHref }, { label: copy.docsLabel }]
    : [{ label: copy.homeLabel, href: copy.homeHref }, { label: copy.docsLabel, href: usageDocsHref('index') }, { label: page.title }];

  return (
    <PublicSiteFrame activeNavKey="usage-docs" bodyClassName="usage-docs-page" locale={isSpanish ? 'es' : 'en'}>
      <div className="usage-docs-page__local-nav" aria-label={copy.localNavAriaLabel}>
        <a href={usageDocsHref('index')} className="usage-docs-page__local-link usage-docs-page__local-link--active">{copy.localNavDocsLabel}</a>
        <a href="/privacy" className="usage-docs-page__local-link">{copy.privacyLabel}</a>
        <a href="/terms" className="usage-docs-page__local-link">{copy.termsLabel}</a>
      </div>

      <div className="usage-docs-page__surface">
        <section className="usage-docs-hero">
          <Breadcrumbs items={breadcrumbItems} />
          <span className="usage-docs-kicker">{copy.kicker}</span>
          <h1 className="usage-docs-title">{page.title}</h1>
          <p className="usage-docs-summary">{page.summary}</p>
        </section>

        <div className="usage-docs-layout">
          <aside className="usage-docs-sidebar" aria-label={copy.sidebarAriaLabel}>
            <div className="usage-docs-sidebar__group">
              <h2>{copy.pagesLabel}</h2>
              <div className="usage-docs-sidebar__pages">
                {pages.map((entry) => {
                  const active = entry.key === page.key;
                  return (
                    <a
                      key={entry.key}
                      href={usageDocsHref(entry.key)}
                      className={active ? 'usage-docs-sidebar__page usage-docs-sidebar__page--active' : 'usage-docs-sidebar__page'}
                      aria-current={active ? 'page' : undefined}
                    >
                      {entry.navLabel}
                    </a>
                  );
                })}
              </div>
            </div>

            <div className="usage-docs-sidebar__group">
              <h2>{copy.onThisPageLabel}</h2>
              <div className="usage-docs-sidebar__sections">
                {page.sections.map((section) => (
                  <a key={section.id} href={`#${section.id}`} className="usage-docs-sidebar__section-link">
                    {section.title}
                  </a>
                ))}
              </div>
            </div>
          </aside>

          <main className="usage-docs-content">
            <section className="usage-docs-section">
              <h2>{copy.introTitle}</h2>
              {copy.introParagraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>

            {pageVideo ? <PublicVideoPanel {...pageVideo} /> : null}

            {pageKey === 'index' ? (
              <PublicProfileLinksPanel
                title={copy.profileTitle}
                description={copy.profileDescription}
              />
            ) : null}

            {page.sections.map((section) => (
              <section key={section.id} id={section.id} className="usage-docs-section">
                <h2>{section.title}</h2>
                {section.body}
              </section>
            ))}

            {adjacentDocs.length > 0 && (
              <section className="usage-docs-section usage-docs-section--related">
                <h2>{copy.adjacentTitle}</h2>
                <p>{copy.adjacentDescription}</p>
                <ul>
                  {adjacentDocs.map((entry) => (
                    <li key={entry.key}>
                      <a href={usageDocsHref(entry.key)}>{entry.title}</a>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {relatedWorkflows.length > 0 && (
              <section className="usage-docs-section usage-docs-section--related">
                <h2>{copy.workflowsTitle}</h2>
                <p>{copy.workflowsDescription}</p>
                <ul>
                  {relatedWorkflows.map((link) => (
                    <li key={link.href}>
                      <a href={link.href}>{link.label}</a>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {relatedGuides.length > 0 && (
              <section className="usage-docs-section usage-docs-section--related">
                <h2>{copy.guidesTitle}</h2>
                <p>{copy.guidesDescription}</p>
                <ul>
                  {relatedGuides.map((guide) => (
                    <li key={guide.href}>
                      <a href={guide.href}>{guide.title}</a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </main>
        </div>
      </div>
    </PublicSiteFrame>
  );
};

export default UsageDocsPage;
