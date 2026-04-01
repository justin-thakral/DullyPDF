import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OnboardingPage from '../../../../src/components/pages/OnboardingPage';

describe('OnboardingPage', () => {
  it('selects the premium tab by default', () => {
    render(
      <OnboardingPage
        onStartTrial={vi.fn()}
        onSkipToFree={vi.fn()}
        checkoutInProgress={false}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Welcome to DullyPDF' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start 7-Day Free Trial' })).toBeTruthy();
    expect(screen.getByText(/Up to 100 saved form templates/)).toBeTruthy();
    expect(screen.getByText(/Your card is charged automatically/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Use DullyPDF for Free' })).toBeNull();
  });

  it('shows free features when free tab is clicked', async () => {
    const user = userEvent.setup();
    render(
      <OnboardingPage
        onStartTrial={vi.fn()}
        onSkipToFree={vi.fn()}
        checkoutInProgress={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Free' }));

    expect(screen.getByRole('button', { name: 'Use DullyPDF for Free' })).toBeTruthy();
    expect(screen.getByText(/Up to 5 saved form templates/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start 7-Day Free Trial' })).toBeNull();
  });

  it('calls onStartTrial when trial CTA is clicked', async () => {
    const onStartTrial = vi.fn();
    const user = userEvent.setup();
    render(
      <OnboardingPage
        onStartTrial={onStartTrial}
        onSkipToFree={vi.fn()}
        checkoutInProgress={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Start 7-Day Free Trial' }));

    expect(onStartTrial).toHaveBeenCalledTimes(1);
  });

  it('calls onSkipToFree when free CTA is clicked', async () => {
    const onSkipToFree = vi.fn();
    const user = userEvent.setup();
    render(
      <OnboardingPage
        onStartTrial={vi.fn()}
        onSkipToFree={onSkipToFree}
        checkoutInProgress={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Free' }));
    await user.click(screen.getByRole('button', { name: 'Use DullyPDF for Free' }));

    expect(onSkipToFree).toHaveBeenCalledTimes(1);
  });

  it('disables buttons and shows loading label when checkout is in progress', () => {
    render(
      <OnboardingPage
        onStartTrial={vi.fn()}
        onSkipToFree={vi.fn()}
        checkoutInProgress={true}
      />,
    );

    const trialBtn = screen.getByRole('button', { name: 'Starting trial...' });
    expect(trialBtn).toBeTruthy();
    expect(trialBtn.hasAttribute('disabled')).toBe(true);
  });

  it('disables free CTA when checkout is in progress', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <OnboardingPage
        onStartTrial={vi.fn()}
        onSkipToFree={vi.fn()}
        checkoutInProgress={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Free' }));

    rerender(
      <OnboardingPage
        onStartTrial={vi.fn()}
        onSkipToFree={vi.fn()}
        checkoutInProgress={true}
      />,
    );

    const freeBtn = screen.getByRole('button', { name: 'Use DullyPDF for Free' });
    expect(freeBtn.hasAttribute('disabled')).toBe(true);
  });
});
