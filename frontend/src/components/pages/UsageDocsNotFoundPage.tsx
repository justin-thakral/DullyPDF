import { useEffect } from 'react';
import './UsageDocsNotFoundPage.css';
import { applyNoIndexSeo } from '../../utils/seo';

type UsageDocsNotFoundPageProps = {
  requestedPath: string;
};

const UsageDocsNotFoundPage = ({ requestedPath }: UsageDocsNotFoundPageProps) => {
  useEffect(() => {
    applyNoIndexSeo({
      title: 'Documentación no encontrada (404) | DullyPDF',
      description:
        'La página de documentación de DullyPDF solicitada no existe. Usa el índice de documentación en español para continuar.',
      canonicalPath: '/es/usage-docs',
    });
  }, []);

  return (
    <div className="usage-docs-not-found-page">
      <div className="usage-docs-not-found-card">
        <p className="usage-docs-not-found-code">404</p>
        <h1>Página de documentación no encontrada</h1>
        <p>
          No existe una página de documentación en <code>{requestedPath}</code>.
        </p>
        <a href="/es/usage-docs" className="usage-docs-not-found-link">
          Ir a la documentación
        </a>
      </div>
    </div>
  );
};

export default UsageDocsNotFoundPage;
