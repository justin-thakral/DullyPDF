import { renderToString } from 'react-dom/server';
import LegalPage from './components/pages/LegalPage';
import UsageDocsPage from './components/pages/UsageDocsPage';
import IntentLandingPage from './components/pages/IntentLandingPage';
import IntentHubPage from './components/pages/IntentHubPage';
import FeaturePlanPage from './components/pages/FeaturePlanPage';
import BlogIndexPage from './components/pages/BlogIndexPage';
import BlogPostPage from './components/pages/BlogPostPage';
import { HomepageShell } from './components/pages/HomepageShell';
import type { HydratablePublicRoute } from './publicRouteRouting';

const noop = () => {};

function renderPublicRouteElement(route: HydratablePublicRoute) {
  switch (route.kind) {
    case 'home':
      return (
        <HomepageShell
          authPending
          onStartWorkflow={noop}
          onStartDemo={noop}
          onSignIn={noop}
        />
      );
    case 'legal':
      return <LegalPage kind={route.legalKind} />;
    case 'intent':
      return <IntentLandingPage pageKey={route.intentKey} />;
    case 'intent-hub':
      return <IntentHubPage hubKey={route.hubKey} />;
    case 'feature-plan':
      return <FeaturePlanPage pageKey={route.planKey} />;
    case 'usage-docs':
      return <UsageDocsPage pageKey={route.pageKey} />;
    case 'blog-index':
      return <BlogIndexPage />;
    case 'blog-post':
      return <BlogPostPage slug={route.slug} />;
  }
}

export function renderPublicRouteHtml(route: HydratablePublicRoute): string {
  return renderToString(renderPublicRouteElement(route));
}
