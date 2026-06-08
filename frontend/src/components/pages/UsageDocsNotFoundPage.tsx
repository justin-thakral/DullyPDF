import { useEffect } from 'react';
import './UsageDocsNotFoundPage.css';
import { applyNoIndexSeo } from '../../utils/seo';
import type { UsageDocsLocale } from './usageDocsContent';

type UsageDocsNotFoundPageProps = {
  requestedPath: string;
  locale?: UsageDocsLocale;
};

const UsageDocsNotFoundPage = ({ requestedPath, locale = 'en' }: UsageDocsNotFoundPageProps) => {
  const isSpanish = locale === 'es';
  const copy = isSpanish
    ? {
        title: 'Documentación no encontrada (404) | DullyPDF',
        description:
          'La página de documentación de DullyPDF solicitada no existe. Usa el índice de documentación en español para continuar.',
        canonicalPath: '/es/usage-docs',
        codeHeading: 'Página de documentación no encontrada',
        bodyPrefix: 'No existe una página de documentación en',
        linkHref: '/es/usage-docs',
        linkLabel: 'Ir a la documentación',
      }
    : {
        title: 'Usage Docs Not Found (404) | DullyPDF',
        description:
          'The requested DullyPDF usage docs page does not exist. Use the usage docs index to continue.',
        canonicalPath: '/usage-docs',
        codeHeading: 'Usage docs page not found',
        bodyPrefix: 'There is no usage docs page at',
        linkHref: '/usage-docs',
        linkLabel: 'Go to Usage Docs',
      };

  useEffect(() => {
    applyNoIndexSeo({
      title: copy.title,
      description: copy.description,
      canonicalPath: copy.canonicalPath,
    });
  }, [copy.canonicalPath, copy.description, copy.title]);

  return (
    <div className="usage-docs-not-found-page">
      <div className="usage-docs-not-found-card">
        <p className="usage-docs-not-found-code">404</p>
        <h1>{copy.codeHeading}</h1>
        <p>
          {copy.bodyPrefix} <code>{requestedPath}</code>.
        </p>
        <a href={copy.linkHref} className="usage-docs-not-found-link">
          {copy.linkLabel}
        </a>
      </div>
    </div>
  );
};

export default UsageDocsNotFoundPage;
