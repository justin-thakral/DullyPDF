export type PublicVideoContent = {
  eyebrow: string;
  title: string;
  description: string;
  videoId: string;
  youtubeUrl: string;
  durationLabel: string;
  caption: string;
};

// Short youtu.be URLs (with optional ?si= share token) are used so the
// outbound links stay deduplicated in GSC / analytics and match the share
// links that already appear elsewhere (docs, social).
const buildYouTubeShareUrl = (videoId: string, shareToken?: string): string =>
  shareToken
    ? `https://youtu.be/${videoId}?si=${shareToken}`
    : `https://youtu.be/${videoId}`;

export const PDF_TO_FILLABLE_DEMO_VIDEO: PublicVideoContent = {
  eyebrow: 'Focused demo',
  title: '3-minute PDF to Fillable walkthrough',
  description:
    'This narrower walkthrough stays on the core conversion path: upload a PDF, detect fields automatically, clean the template in-browser, and save a reusable fillable form.',
  videoId: 'JIVx5VrtkAg',
  youtubeUrl: buildYouTubeShareUrl('JIVx5VrtkAg', 'XsswWbjanIVnY5vp'),
  durationLabel: '3 minutes',
  caption:
    'Use this shorter demo when you care about converting one existing PDF into a dependable template before you expand into broader fill workflows.',
};

export const FULL_FEATURE_DEMO_VIDEO: PublicVideoContent = {
  eyebrow: 'Full product tour',
  title: '7-minute DullyPDF feature walkthrough',
  description:
    'This broader video covers the main product surface: PDF-to-template setup, Search & Fill, saved templates, Fill By Link, API Fill, and signing handoff.',
  videoId: 'vk-02uxbm3I',
  youtubeUrl: buildYouTubeShareUrl('vk-02uxbm3I', 'OLxy4rqYwv7yFqsE'),
  durationLabel: '7 minutes',
  caption:
    'Use the full tour when you want product context across the public workflow pages before drilling into one feature-specific doc or landing page.',
};

export const FILL_PDF_FROM_FILE_DEMO_VIDEO: PublicVideoContent = {
  eyebrow: 'Fill from file demo',
  title: 'Fill PDF from CSV, Excel, JSON, SQL, or TXT',
  description:
    'This walkthrough shows how to load a saved PDF template and auto-fill it from a CSV, Excel (XLSX), JSON, SQL query result, or TXT data source without leaving the browser.',
  videoId: 'CT3IEzh4p10',
  youtubeUrl: buildYouTubeShareUrl('CT3IEzh4p10'),
  durationLabel: 'Fill by file walkthrough',
  caption:
    'Use this video when you need to prove that DullyPDF can fill the same template from CSV, XLSX, JSON, SQL, and TXT payloads before rolling the workflow out to the rest of the team.',
};

export const PDF_PACKET_SEARCH_FILL_DEMO_VIDEO: PublicVideoContent = {
  eyebrow: 'Packet Search & Fill demo',
  title: 'Fill an entire PDF packet from one row',
  description:
    'This walkthrough shows how DullyPDF applies one structured record across an open group of saved PDFs, then extends that same reviewed packet into API Fill or Fill By Link when the data should come from another system or respondent.',
  videoId: 'RIxRmZvVnVw',
  youtubeUrl: buildYouTubeShareUrl('RIxRmZvVnVw'),
  durationLabel: '2 minutes',
  caption:
    'Use this packet-focused demo when the real job is filling several related documents from one spreadsheet row, API payload, or stored response instead of remapping each PDF one by one.',
};

export const ESIGN_PIPELINE_DEMO_VIDEO: PublicVideoContent = {
  eyebrow: 'E-sign pipeline',
  title: 'DullyPDF E-Sign Pipeline — every signing workflow, every industry',
  description:
    'Single-signer, sequential multi-signer, parallel multi-signer, Fill By Link → sign, group fill → multi-sign, and API Fill → sign — walked end to end across HR onboarding, healthcare intake, real estate, legal, insurance ACORD, and immigration USCIS workflows.',
  videoId: 'CJ0TCXGHFdQ',
  youtubeUrl: buildYouTubeShareUrl('CJ0TCXGHFdQ'),
  durationLabel: 'E-sign walkthrough',
  caption:
    'Use this video as the canonical reference for DullyPDF e-signatures: pick the signing workflow your team actually runs, then match it to the industry-specific packet you already send out today.',
};

export const WEB_FORM_AND_SIGN_DEMO_VIDEO: PublicVideoContent = {
  eyebrow: 'Web form + sign demo',
  title: 'Fill a PDF web form and sign it in the browser',
  description:
    'This walkthrough shows how DullyPDF combines Fill By Link with the e-signature workflow: share a hosted web form link, let the respondent fill and sign the PDF in the browser, and collect the finished document along with an E-SIGN and UETA compliant audit trail.',
  videoId: 'mXtmgrCOitM',
  youtubeUrl: buildYouTubeShareUrl('mXtmgrCOitM'),
  durationLabel: 'Web form + sign walkthrough',
  caption:
    'Use this video when you need to validate the end-to-end hosted PDF web form and e-signature handoff before sending a real respondent link to clients, patients, tenants, or employees.',
};
