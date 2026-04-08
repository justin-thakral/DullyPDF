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
};

export function HomepageShell({
  userEmail = null,
  authPending,
  onStartWorkflow,
  onStartDemo,
  onSignIn,
  onOpenProfile,
  onSignOut,
}: HomepageShellProps) {
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
        />
        <main className="landing-main">
          <Homepage
            onStartWorkflow={onStartWorkflow}
            onStartDemo={onStartDemo}
            userEmail={userEmail}
            authPending={authPending}
            onSignIn={onSignIn}
            onOpenProfile={onOpenProfile}
          />
        </main>
      </div>
    </>
  );
}
