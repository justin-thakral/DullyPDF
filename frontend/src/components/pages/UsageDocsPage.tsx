import { useEffect, useMemo } from 'react';
import type { UsageDocsPageKey } from './usageDocsContent';
import {
  getUsageDocsPage,
  getUsageDocsPages,
  usageDocsHref,
} from './usageDocsContent';
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
} from '../../config/publicVideoContent';
import PublicVideoPanel from './PublicVideoPanel';
import PublicProfileLinksPanel from './PublicProfileLinksPanel';

type UsageDocsPageProps = {
  pageKey: UsageDocsPageKey;
};

const UsageDocsPage = ({ pageKey }: UsageDocsPageProps) => {
  const page = getUsageDocsPage(pageKey);
  const pages = getUsageDocsPages();
  const pageVideo = pageKey === 'index'
    ? {
        ...FULL_FEATURE_DEMO_VIDEO,
        eyebrow: 'Recorrido en video',
        title: 'Recorrido de 7 minutos por DullyPDF',
        description:
          'Este video muestra el flujo principal: preparar una plantilla, rellenar desde datos, guardar formularios, publicar Fill By Link y usar API Fill.',
        durationLabel: '7 minutos',
        caption:
          'Úsalo para entender el producto antes de entrar en una guía operativa concreta.',
        linkLabel: 'Ver en YouTube',
      }
    : pageKey === 'getting-started'
      ? {
          ...PDF_TO_FILLABLE_DEMO_VIDEO,
          eyebrow: 'Demo enfocada',
          title: 'Recorrido de 3 minutos: PDF a formulario rellenable',
          description:
            'Este video se centra en la ruta base: subir un PDF, detectar campos, limpiar la plantilla y guardarla para reutilizarla.',
          durationLabel: '3 minutos',
          caption:
            'Úsalo cuando quieras validar una sola plantilla antes de ampliar el flujo.',
          linkLabel: 'Ver en YouTube',
        }
      : pageKey === 'search-fill'
        ? {
            ...FILL_PDF_FROM_FILE_DEMO_VIDEO,
            eyebrow: 'Demo de archivo',
            title: 'Rellenar PDF desde CSV, Excel o JSON',
            description:
              'Este video muestra cómo abrir una plantilla guardada y rellenarla desde filas CSV, Excel o JSON sin salir del navegador.',
            durationLabel: 'Recorrido de Fill by File',
            caption:
              'Úsalo para validar el relleno desde archivos antes de llevar el flujo al resto del equipo.',
            linkLabel: 'Ver en YouTube',
          }
        : null;

  const relatedWorkflows = useMemo(() => {
    const keys: IntentPageKey[] = page.relatedWorkflowKeys ?? [];
    return keys.map((key) => {
      const p = getIntentPage(key);
      return { label: p.navLabel, href: p.path };
    });
  }, [page.relatedWorkflowKeys]);
  const relatedGuides = useMemo(
    () => getBlogGuideLinksForUsageDocsPage(page.key, page.relatedWorkflowKeys ?? []),
    [page.key, page.relatedWorkflowKeys],
  );
  const adjacentDocs = useMemo(() => {
    const currentIndex = pages.findIndex((entry) => entry.key === pageKey);
    return pages.filter((entry, index) => entry.key !== pageKey && Math.abs(index - currentIndex) <= 2);
  }, [pageKey, pages]);

  useEffect(() => {
    applyRouteSeo({ kind: 'usage-docs', pageKey });
  }, [pageKey]);

  const breadcrumbItems = pageKey === 'index'
    ? [{ label: 'Inicio', href: '/es' }, { label: 'Documentación' }]
    : [{ label: 'Inicio', href: '/es' }, { label: 'Documentación', href: usageDocsHref('index') }, { label: page.title }];

  return (
    <PublicSiteFrame activeNavKey="usage-docs" bodyClassName="usage-docs-page" locale="es">
      <div className="usage-docs-page__local-nav" aria-label="Navegación auxiliar de documentación">
        <a href={usageDocsHref('index')} className="usage-docs-page__local-link usage-docs-page__local-link--active">Documentación</a>
        <a href="/privacy" className="usage-docs-page__local-link">Privacidad</a>
        <a href="/terms" className="usage-docs-page__local-link">Términos</a>
      </div>

      <div className="usage-docs-page__surface">
        <section className="usage-docs-hero">
          <Breadcrumbs items={breadcrumbItems} />
          <span className="usage-docs-kicker">Documentación de uso</span>
          <h1 className="usage-docs-title">{page.title}</h1>
          <p className="usage-docs-summary">{page.summary}</p>
        </section>

        <div className="usage-docs-layout">
          <aside className="usage-docs-sidebar" aria-label="Barra lateral de documentación">
            <div className="usage-docs-sidebar__group">
              <h2>Páginas</h2>
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
              <h2>En esta página</h2>
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
              <h2>Cómo usar esta página</h2>
              <p>
                Esta página cubre una etapa operativa del flujo de DullyPDF para que puedas hacer una prueba controlada
                sin adivinar. Lee las secciones, valida con un documento representativo y luego pasa a la página
                relacionada.
              </p>
              <p>
                Ese orden importa porque la mayoría de los problemas nacen al mezclar detección, mapeo, relleno y
                publicación en una sola pasada. Un ciclo pequeño facilita diagnosticar y confiar en la plantilla.
              </p>
            </section>

            {pageVideo ? <PublicVideoPanel {...pageVideo} /> : null}

            {pageKey === 'index' ? (
              <PublicProfileLinksPanel
                title="Perfiles oficiales de DullyPDF"
                description="Estos enlaces conectan la documentación pública, demos del producto, presencia de la empresa e implementación abierta sin volver a la página principal."
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
                <h2>Continuar en la documentación</h2>
                <p>
                  Pasa a la página más cercana en vez de saltar a funciones no relacionadas. Así la secuencia de
                  despliegue se valida con menos desvíos entre plantillas.
                </p>
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
                <h2>Flujos relacionados</h2>
                <p>
                  Estas páginas explican el caso de uso público del mismo flujo antes de volver a los detalles
                  operativos.
                </p>
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
                <h2>Guías relacionadas</h2>
                <p>
                  Estas guías muestran ejemplos concretos del mismo flujo cuando necesitas contexto antes de volver a la
                  documentación operativa.
                </p>
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
