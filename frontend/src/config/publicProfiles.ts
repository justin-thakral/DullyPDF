export type PublicProfileLink = {
  label: string;
  href: string;
  description: string;
  iconSrc?: string;
};

export const OFFICIAL_PUBLIC_PROFILE_LINKS: PublicProfileLink[] = [
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/company/dullypdf',
    description: 'Company updates, positioning, and product-facing posts.',
    iconSrc: '/social/linkedin.svg',
  },
  {
    label: 'GitHub',
    href: 'https://github.com/justin-thakral/DullyPDF',
    description: 'Open-source repository, implementation details, and change history.',
    iconSrc: '/social/github.svg',
  },
  {
    label: 'YouTube',
    href: 'https://www.youtube.com/@DullyPDF',
    description: 'Product demos, walkthroughs, and feature explainers.',
    iconSrc: '/social/youtube.svg',
  },
  {
    label: 'X',
    href: 'https://x.com/DullyPDF',
    description: 'Short product updates, launches, and distribution posts.',
    iconSrc: '/social/x.svg',
  },
];

export const OFFICIAL_PUBLIC_PROFILE_URLS: string[] = OFFICIAL_PUBLIC_PROFILE_LINKS.map((link) => link.href);
