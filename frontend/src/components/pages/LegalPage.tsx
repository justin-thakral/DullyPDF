import { useEffect } from 'react';
import type { ReactNode } from 'react';
import './LegalPage.css';
import { applyRouteSeo } from '../../utils/seo';
import { Breadcrumbs } from '../ui/Breadcrumbs';
import { PublicSiteFrame } from '../ui/PublicSiteFrame';

export type LegalPageKind = 'privacy' | 'terms' | 'refund';

type LegalSection = {
  id: string;
  title: string;
  body: ReactNode;
};

type LegalCopy = {
  title: string;
  summary: string;
  lastUpdated: string;
  sections: LegalSection[];
};

const SUPPORT_EMAIL = 'justin@dullypdf.com';

const PRIVACY_COPY: LegalCopy = {
  title: 'Privacy Policy',
  summary:
    'DullyPDF helps you turn PDFs into editable templates and fill them with local data. This policy explains what we collect, why we collect it, and how you can control it.',
  lastUpdated: 'March 9, 2026',
  sections: [
    {
      id: 'information-we-collect',
      title: 'Information we collect',
      body: (
        <>
          <p>
            We collect the information you provide directly, plus limited technical data required to run the service.
            This includes:
          </p>
          <ul>
            <li>
              Account data such as your email address, authentication provider, and role/usage limits stored with your
              profile.
            </li>
            <li>
              PDFs and template data that you upload or save, including detected fields, coordinates, labels, and
              template settings stored with your saved forms.
            </li>
            <li>
              Schema metadata such as CSV/Excel/JSON/TXT column headers and types. The actual CSV/Excel/JSON rows stay in
              your browser and are not uploaded.
            </li>
            <li>
              Usage and diagnostic metadata like request timestamps, session identifiers, and rate-limit signals.
            </li>
            <li>
              Limited website measurement data such as page views, referrer information, browser/device metadata, and
              conversion attribution signals collected through Google tagging and similar abuse-prevention or analytics
              integrations.
            </li>
            <li>
              Billing metadata required for subscriptions and credit refills, such as Stripe customer and
              subscription identifiers, plan identifiers, checkout/payment status, and cancellation schedule fields.
            </li>
            <li>
              Contact form details (name, company, email, phone, and message) when you reach out for support.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'how-we-use',
      title: 'How we use information',
      body: (
        <>
          <p>We use your information to:</p>
          <ul>
            <li>Provide PDF detection, template editing, and Search &amp; Fill features.</li>
            <li>Authenticate users, enforce usage limits, and keep your saved forms tied to your account.</li>
            <li>Process Stripe-backed subscriptions, credit refill purchases, and related billing state synchronization.</li>
            <li>Run optional AI rename and schema mapping workflows when you enable them.</li>
            <li>Measure product usage, page performance, and marketing conversions.</li>
            <li>Respond to support requests and communicate about your account.</li>
            <li>Protect the service against abuse, fraud, and automated traffic.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'billing-and-payments',
      title: 'Billing and payments',
      body: (
        <>
          <p>
            Paid subscriptions and credit refill transactions are processed by Stripe. We do not store full payment
            card numbers on DullyPDF servers.
          </p>
          <p>
            To support subscriptions and refill fulfillment, we store billing metadata (such as Stripe customer id,
            subscription id, checkout session id, and webhook event ids) and account billing state (for example
            subscription status and cancellation schedule).
          </p>
        </>
      ),
    },
    {
      id: 'ai-processing',
      title: 'AI processing and third-party services',
      body: (
        <>
          <p>
            When you enable AI rename or schema mapping, we send limited inputs to third-party AI providers. These
            inputs can include PDF page images, detected field labels, and schema headers. We do not send your
            CSV/Excel/JSON row data.
          </p>
          <p>
            DullyPDF uses service providers such as Firebase (authentication), Google Cloud Storage and Firestore
            (data storage), Stripe (payment processing), Google reCAPTCHA (abuse protection), Google Ads / Google tag
            (conversion measurement), and email delivery services for the contact form.
          </p>
        </>
      ),
    },
    {
      id: 'sharing',
      title: 'When we share data',
      body: (
        <>
          <p>
            We do not sell your personal information. We share data only with service providers that help operate
            DullyPDF (for example, cloud hosting, authentication, storage, payment processing, and AI processing) or
            when required by law.
          </p>
        </>
      ),
    },
    {
      id: 'retention',
      title: 'Retention',
      body: (
        <>
          <p>
            Session data and request logs are retained only for limited periods configured for performance and
            troubleshooting. Contact messages are retained as needed to respond to you. Saved forms normally remain
            stored until you delete them. If a subscription downgrade leaves an account above the base saved-form cap,
            DullyPDF can lock access to some saved forms while still preserving the stored records.
          </p>
          <p>
            Under the current base-plan policy, DullyPDF keeps the earliest-created saved forms up to the base limit
            accessible and marks the remainder locked in place until the account upgrades again. Related Fill By Link,
            group, API Fill, and signing draft flows can be blocked while a source template is locked, but the stored
            records are preserved instead of being purged as part of the downgrade itself.
          </p>
        </>
      ),
    },
    {
      id: 'security',
      title: 'Security',
      body: (
        <>
          <p>
            We use access controls and encryption in transit to protect your data. No method of transmission or storage
            is fully secure, so we cannot guarantee absolute security.
          </p>
        </>
      ),
    },
    {
      id: 'your-choices',
      title: 'Your choices',
      body: (
        <>
          <p>You can:</p>
          <ul>
            <li>Disable AI workflows and keep processing limited to detection and local editing.</li>
            <li>Delete saved forms from your profile to remove stored PDFs and template metadata.</li>
            <li>Manage or cancel active subscriptions from your profile billing section.</li>
            <li>Contact us to request account deletion or access questions at {SUPPORT_EMAIL}.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'children',
      title: "Children's privacy",
      body: (
        <>
          <p>
            DullyPDF is not intended for children under 13, and we do not knowingly collect information from children.
          </p>
        </>
      ),
    },
    {
      id: 'changes',
      title: 'Changes to this policy',
      body: (
        <>
          <p>
            We may update this policy from time to time. The \"Last updated\" date above shows when it was last changed.
          </p>
        </>
      ),
    },
  ],
};

const TERMS_COPY: LegalCopy = {
  title: 'Terms of Service',
  summary:
    'These terms govern your use of DullyPDF. By accessing or using the service, you agree to these terms.',
  lastUpdated: 'May 21, 2026',
  sections: [
    {
      id: 'operator',
      title: 'Operator',
      body: (
        <>
          <p>
            DullyPDF is a SaaS product operated by an individual based in New York State, United States. No separate
            legal entity has been formed yet.
          </p>
        </>
      ),
    },
    {
      id: 'service',
      title: 'Service description',
      body: (
        <>
          <p>
            DullyPDF provides tools to detect PDF form fields, rename and map fields with optional AI workflows, and
            fill templates with data from local CSV/Excel/JSON sources. Paid plans include recurring Pro subscriptions
            and Pro-only credit refill purchases.
          </p>
        </>
      ),
    },
    {
      id: 'accounts',
      title: 'Accounts and access',
      body: (
        <>
          <p>
            You are responsible for your account credentials and all activity that happens under your account. Provide
            accurate information and keep your login details secure.
          </p>
        </>
      ),
    },
    {
      id: 'your-content',
      title: 'Your content',
      body: (
        <>
          <p>
            You retain ownership of your PDFs and data. You grant DullyPDF a limited license to host, process, and
            transform your content solely to provide the service. You represent that you have the rights to upload and
            process any content you submit.
          </p>
        </>
      ),
    },
    {
      id: 'acceptable-use',
      title: 'Acceptable use',
      body: (
        <>
          <p>You agree not to:</p>
          <ul>
            <li>Use the service for unlawful, harmful, or fraudulent activities.</li>
            <li>Upload content you do not have rights to process.</li>
            <li>Attempt to reverse engineer, scrape, or disrupt the service.</li>
            <li>Bypass usage limits, authentication, or security controls.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'ai-features',
      title: 'AI features',
      body: (
        <>
          <p>
            AI rename and schema mapping are optional. When enabled, you authorize DullyPDF to send limited content to
            third-party AI providers for processing. AI output may be inaccurate and must be reviewed before use.
          </p>
        </>
      ),
    },
    {
      id: 'limits',
      title: 'Usage limits and availability',
      body: (
        <>
          <p>
            The service may enforce page limits, credits, or other restrictions. We may modify, suspend, or discontinue
            features at any time, including in response to misuse or capacity constraints.
          </p>
        </>
      ),
    },
    {
      id: 'billing-subscriptions',
      title: 'Billing and subscriptions',
      body: (
        <>
          <p>
            DullyPDF uses Stripe Checkout for secure subscription and refill transactions. Pro Monthly and Pro Yearly
            are recurring subscriptions. Refill purchases are one-time credit packs that require an active Pro
            subscription.
          </p>
          <p>
            Subscription cancellation is handled from the profile billing section and is scheduled for period end. Your
            paid access remains active until the scheduled end date.
          </p>
          <p>
            Prices and plan availability are shown at checkout and may change over time. Payment processing is subject
            to Stripe's terms and policies in addition to these terms.
          </p>
          <p>
            Refunds, return questions, and cancellation-related refund requests are governed by the{' '}
            <a href="/refund-policy">Refund and Return Policy</a>.
          </p>
        </>
      ),
    },
    {
      id: 'disclaimer',
      title: 'Disclaimer of warranties',
      body: (
        <>
          <p>
            DullyPDF is provided \"as is\" without warranties of any kind. We do not guarantee that the service will be
            uninterrupted, error-free, or produce specific results.
          </p>
        </>
      ),
    },
    {
      id: 'liability',
      title: 'Limitation of liability',
      body: (
        <>
          <p>
            To the maximum extent permitted by law, DullyPDF will not be liable for indirect, incidental, or
            consequential damages, or for loss of data, profits, or revenue arising from your use of the service.
          </p>
        </>
      ),
    },
    {
      id: 'termination',
      title: 'Termination',
      body: (
        <>
          <p>
            We may suspend or terminate access if you violate these terms. You may stop using the service at any time
            and request deletion of saved data.
          </p>
        </>
      ),
    },
    {
      id: 'governing-law',
      title: 'Governing law',
      body: (
        <>
          <p>
            These terms are governed by the laws of the State of New York, United States, without regard to conflict of
            law principles.
          </p>
        </>
      ),
    },
    {
      id: 'contact',
      title: 'Contact',
      body: (
        <>
          <p>Questions about these terms can be sent to {SUPPORT_EMAIL}.</p>
        </>
      ),
    },
  ],
};

const REFUND_COPY: LegalCopy = {
  title: 'Refund and Return Policy',
  summary:
    'DullyPDF is a digital PDF automation service. This policy explains how subscription cancellations, limited refunds, and non-returnable digital services work.',
  lastUpdated: 'May 21, 2026',
  sections: [
    {
      id: 'digital-service',
      title: 'Digital service and returns',
      body: (
        <>
          <p>
            DullyPDF provides digital access to PDF field detection, template editing, Search &amp; Fill, Fill By Link,
            API Fill, signing workflows, generated PDF downloads, and related account features. Because DullyPDF does
            not sell physical goods, physical returns, return shipping, and exchanges do not apply.
          </p>
        </>
      ),
    },
    {
      id: 'cancellations',
      title: 'Subscription cancellations',
      body: (
        <>
          <p>
            You can cancel an active subscription from the profile billing section. Cancellation is normally scheduled
            for the end of the current billing period, and paid access remains available until that scheduled end date.
          </p>
        </>
      ),
    },
    {
      id: 'subscription-refunds',
      title: 'Subscription refund eligibility',
      body: (
        <>
          <p>
            We are happy to review refund requests for users who were charged for a paid subscription period but did
            not use paid DullyPDF features during that period. To request a refund, contact us within 30 days of the
            charge.
          </p>
          <p>
            Eligible subscription refunds are limited to the most recent paid period and are capped at one month of
            subscription fees, unless applicable law requires otherwise. We do not refund earlier billing periods.
          </p>
          <p>
            For this policy, paid feature use means successful use of paid-plan capacity such as generated PDF
            downloads, API Fill runs, accepted Fill By Link responses, sent signing requests, paid AI/refill credits,
            or other Pro-only quota consumption. Logging in, viewing documentation, browsing public pages, or using
            unpaid features does not by itself count as paid feature use.
          </p>
        </>
      ),
    },
    {
      id: 'credit-refills',
      title: 'Credit refill purchases',
      body: (
        <>
          <p>
            Pro-only refill credit purchases are digital, one-time purchases. Unused refill purchases may be reviewed
            for refund within 30 days of purchase. Refill credits that have been consumed, partially consumed, or tied
            to completed AI processing are not refundable except where required by law.
          </p>
        </>
      ),
    },
    {
      id: 'billing-errors',
      title: 'Billing errors and duplicate charges',
      body: (
        <>
          <p>
            If you believe there was a duplicate charge, billing error, or unauthorized transaction, contact us as soon
            as possible at {SUPPORT_EMAIL}. We review these requests separately from ordinary unused-service refund
            requests.
          </p>
        </>
      ),
    },
    {
      id: 'how-to-request',
      title: 'How to request a refund',
      body: (
        <>
          <p>
            Send refund requests to {SUPPORT_EMAIL} from the email address associated with your DullyPDF account.
            Include the account email, approximate charge date, and a short explanation of the request so we can
            locate the Stripe payment and review account usage.
          </p>
        </>
      ),
    },
    {
      id: 'processing-time',
      title: 'Refund processing time',
      body: (
        <>
          <p>
            Approved refunds are issued back to the original payment method through Stripe when possible. Your bank or
            card issuer controls when the credit appears on your statement after the refund is submitted.
          </p>
        </>
      ),
    },
    {
      id: 'limits',
      title: 'Policy limits',
      body: (
        <>
          <p>
            We may decline refund requests that involve meaningful paid feature use, repeated refund abuse, chargeback
            misuse, violation of the Terms of Service, or requests outside the time limits described above. Nothing in
            this policy limits any mandatory rights you may have under applicable law.
          </p>
        </>
      ),
    },
    {
      id: 'contact',
      title: 'Contact',
      body: (
        <>
          <p>Questions about refunds, returns, or subscription cancellation can be sent to {SUPPORT_EMAIL}.</p>
        </>
      ),
    },
  ],
};

const LEGAL_COPY: Record<LegalPageKind, LegalCopy> = {
  privacy: PRIVACY_COPY,
  terms: TERMS_COPY,
  refund: REFUND_COPY,
};

type LegalPageProps = {
  kind: LegalPageKind;
};

const LegalPage = ({ kind }: LegalPageProps) => {
  const copy = LEGAL_COPY[kind];

  useEffect(() => {
    applyRouteSeo({ kind: 'legal', legalKind: kind });
  }, [kind]);

  return (
    <PublicSiteFrame bodyClassName="legal-page">
      <div className="legal-nav" aria-label="Legal navigation">
        <a
          href="/privacy"
          className={kind === 'privacy' ? 'legal-nav__link legal-nav__link--active' : 'legal-nav__link'}
        >
          Privacy Policy
        </a>
        <a
          href="/terms"
          className={kind === 'terms' ? 'legal-nav__link legal-nav__link--active' : 'legal-nav__link'}
        >
          Terms of Service
        </a>
        <a
          href="/refund-policy"
          className={kind === 'refund' ? 'legal-nav__link legal-nav__link--active' : 'legal-nav__link'}
        >
          Refund Policy
        </a>
        <a href="/es/usage-docs" className="legal-nav__link">Usage Docs</a>
      </div>

      <div className="legal-page__surface">
        <section className="legal-hero">
          <Breadcrumbs
            items={[
              { label: 'Home', href: '/' },
              { label: copy.title },
            ]}
          />
          <span className="legal-kicker">Legal</span>
          <h1 className="legal-title">{copy.title}</h1>
          <div className="legal-updated">Last updated: {copy.lastUpdated}</div>
          <p className="legal-summary">{copy.summary}</p>
        </section>

        <article className="legal-content" aria-label={`${copy.title} document`}>
          {copy.sections.map((section) => (
            <section key={section.id} id={section.id} className="legal-section">
              <h2>{section.title}</h2>
              {section.body}
            </section>
          ))}
        </article>
      </div>
    </PublicSiteFrame>
  );
};

export default LegalPage;
