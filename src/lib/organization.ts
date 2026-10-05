/** The public brand identity shared by organization, author, and publisher metadata. */
export const organization = {
  '@type': 'Organization',
  '@id': 'https://query.farm/#organization',
  name: 'Query.Farm',
  url: 'https://query.farm',
  logo: {
    '@type': 'ImageObject',
    url: 'https://query.farm/media-kit/logo/mark-512.png',
    width: 512,
    height: 512,
  },
  sameAs: [
    'https://github.com/Query-farm',
    'https://www.linkedin.com/company/query-farm/',
  ],
};
