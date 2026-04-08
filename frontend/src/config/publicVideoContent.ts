export type PublicVideoContent = {
  eyebrow: string;
  title: string;
  description: string;
  videoId: string;
  youtubeUrl: string;
  durationLabel: string;
  caption: string;
};

export const PDF_TO_FILLABLE_DEMO_VIDEO: PublicVideoContent = {
  eyebrow: 'Focused demo',
  title: '3-minute PDF to Fillable walkthrough',
  description:
    'This narrower walkthrough stays on the core conversion path: upload a PDF, detect fields automatically, clean the template in-browser, and save a reusable fillable form.',
  videoId: 'JIVx5VrtkAg',
  youtubeUrl: 'https://youtu.be/JIVx5VrtkAg?si=XsswWbjanIVnY5vp',
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
  youtubeUrl: 'https://youtu.be/vk-02uxbm3I?si=OLxy4rqYwv7yFqsE',
  durationLabel: '7 minutes',
  caption:
    'Use the full tour when you want product context across the public workflow pages before drilling into one feature-specific doc or landing page.',
};
