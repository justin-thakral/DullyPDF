import LegacyHeader from '../layout/LegacyHeader';
import Homepage, { type HomepageMarket } from './Homepage';

type HomepageShellProps = {
  userEmail?: string | null;
  authPending: boolean;
  onStartWorkflow: () => void;
  onStartDemo?: () => void;
  onSignIn?: () => void;
  onOpenProfile?: () => void;
  onSignOut?: () => void;
  market?: HomepageMarket;
};

const getHeaderCopy = (market: HomepageMarket) => {
  if (market === 'spanish') {
    return {
      title: 'Generador de formularios PDF',
      description: 'Convierte PDFs en formularios rellenables con detección de campos por IA',
      docsLabel: 'Docs, privacidad y términos',
      signInLabel: 'Iniciar sesión',
      signOutLabel: 'Cerrar sesión',
      profileTitle: 'Abrir perfil',
    };
  }

  return undefined;
};

export function HomepageShell({
  userEmail = null,
  authPending,
  onStartWorkflow,
  onStartDemo,
  onSignIn,
  onOpenProfile,
  onSignOut,
  market = 'global',
}: HomepageShellProps) {
  const headerCopy = getHeaderCopy(market);

  return (
    <>
      <div className="homepage-shell">
        <LegacyHeader
          currentView="homepage"
          onNavigateHome={() => {}}
          showBackButton={false}
          userEmail={userEmail}
          authPending={authPending}
          onOpenProfile={onOpenProfile}
          onSignOut={onSignOut}
          onSignIn={onSignIn}
          homepageCopy={headerCopy}
        />
        <main className="landing-main">
          <Homepage
            onStartWorkflow={onStartWorkflow}
            onStartDemo={onStartDemo}
            userEmail={userEmail}
            authPending={authPending}
            onSignIn={onSignIn}
            onOpenProfile={onOpenProfile}
            market={market}
          />
        </main>
      </div>
    </>
  );
}
