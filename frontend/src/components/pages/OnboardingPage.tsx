import React, { useState } from 'react';
import './OnboardingPage.css';

type OnboardingTab = 'premium' | 'free';

interface OnboardingPageProps {
  onStartTrial: () => void;
  onSkipToFree: () => void;
  checkoutInProgress: boolean;
}

const PREMIUM_FEATURES = [
  'Up to 100 saved form templates.',
  'Up to 100 detection pages per PDF and 1,000 pages for already-fillable uploads.',
  'No active Fill By Link cap and up to 10,000 accepted responses per month.',
  'Up to 20 active API Fill endpoints with 10,000 successful fills per month.',
  'Up to 10,000 sent signing requests per month.',
  '500 monthly AI credits for Rename, Map, and Rename + Map operations.',
  '500-credit refill packs available from Profile.',
];

const FREE_FEATURES = [
  'Unlimited PDF-to-form setup and form builder access.',
  'Up to 5 saved form templates.',
  'Up to 5 detection pages per PDF and 50 pages for already-fillable uploads.',
  'Fill By Link with up to 25 accepted responses per month.',
  '1 active API Fill endpoint with 250 fills per month.',
  'Up to 25 sent signing requests per month.',
  'Base AI credits that top back up to 10 each month.',
];

const OnboardingPage: React.FC<OnboardingPageProps> = ({
  onStartTrial,
  onSkipToFree,
  checkoutInProgress,
}) => {
  const [activeTab, setActiveTab] = useState<OnboardingTab>('premium');

  return (
    <div className="onboarding-page">
      <div className="onboarding-card">
        <div className="onboarding-header">
          <h1>Welcome to DullyPDF</h1>
          <p>Choose how you want to get started.</p>
        </div>

        <div className="onboarding-tabs">
          <button
            type="button"
            className={`onboarding-tab${activeTab === 'free' ? ' onboarding-tab--active onboarding-tab--free' : ''}`}
            onClick={() => setActiveTab('free')}
          >
            Free
          </button>
          <button
            type="button"
            className={`onboarding-tab${activeTab === 'premium' ? ' onboarding-tab--active' : ''}`}
            onClick={() => setActiveTab('premium')}
          >
            Premium
          </button>
        </div>

        {activeTab === 'premium' ? (
          <div className="onboarding-tab-content onboarding-tab-content--premium">
            <ul className="onboarding-features">
              {PREMIUM_FEATURES.map((feat) => (
                <li key={feat}>{feat}</li>
              ))}
            </ul>
            <button
              type="button"
              className="onboarding-cta onboarding-cta--trial"
              onClick={onStartTrial}
              disabled={checkoutInProgress}
            >
              {checkoutInProgress ? 'Starting trial...' : 'Start 7-Day Free Trial'}
            </button>
            <p className="onboarding-trial-note">
              Your card is charged automatically after the trial unless you cancel.
            </p>
          </div>
        ) : (
          <div className="onboarding-tab-content onboarding-tab-content--free">
            <ul className="onboarding-features">
              {FREE_FEATURES.map((feat) => (
                <li key={feat}>{feat}</li>
              ))}
            </ul>
            <button
              type="button"
              className="onboarding-cta onboarding-cta--free"
              onClick={onSkipToFree}
              disabled={checkoutInProgress}
            >
              Use DullyPDF for Free
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default OnboardingPage;
