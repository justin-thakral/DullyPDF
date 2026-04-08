import LegacyHeader from '../layout/LegacyHeader';
import Homepage from './Homepage';

type HomepageShellProps = {
  userEmail?: string | null;
  authPending: boolean;
  onStartWorkflow: () => void;
  onStartDemo?: () => void;
  onSignIn?: () => void;
  onOpenProfile?: () => void;
  onSignOut?: () => void;
  onInitialRenderReady?: () => void;
  showSplash?: boolean;
};

export function HomepageShell({
  userEmail = null,
  authPending,
  onStartWorkflow,
  onStartDemo,
  onSignIn,
  onOpenProfile,
  onSignOut,
  onInitialRenderReady,
  showSplash = false,
}: HomepageShellProps) {
  return (
    <>
      <div className="homepage-shell" aria-hidden={showSplash}>
        <LegacyHeader
          currentView="homepage"
          onNavigateHome={() => {}}
          showBackButton={false}
          userEmail={userEmail}
          authPending={authPending}
          onOpenProfile={onOpenProfile}
          onSignOut={onSignOut}
          onSignIn={onSignIn}
        />
        <main className="landing-main">
          <Homepage
            onStartWorkflow={onStartWorkflow}
            onStartDemo={onStartDemo}
            userEmail={userEmail}
            authPending={authPending}
            onSignIn={onSignIn}
            onOpenProfile={onOpenProfile}
            onInitialRenderReady={onInitialRenderReady}
          />
        </main>
      </div>
      {showSplash ? <div className="homepage-loading-overlay" aria-hidden="true" /> : null}
    </>
  );
}
