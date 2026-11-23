export const PAGE_SIZE = 20;
export const pageCount = count => Math.max(1, Math.ceil(count / PAGE_SIZE));

export function directoryPagePath(page = 1, category = '') {
  const base = `/products/haybarn/extensions${category ? `/category/${category}` : ''}`;
  return page > 1 ? `${base}/page/${page}` : base;
}

// Link form of directoryPagePath: the trailing slash reaches the static page without a 308 redirect.
export const directoryPageHref = (page = 1, category = '') => `${directoryPagePath(page, category)}/`;

export function pageNumbers(current, total) {
  const numbers = [...new Set([1, current - 1, current, current + 1, total])]
    .filter(page => page > 0 && page <= total).sort((a, b) => a - b);
  return numbers.flatMap((page, index) => index > 0 && page - numbers[index - 1] > 1 ? [null, page] : [page]);
}

export function platformSummary(availability) {
  const labels = { linux: 'Linux', osx: 'macOS', windows: 'Windows', wasm: 'WASM' };
  return [...new Set(availability.map(item => labels[item.platform.split('_')[0]]))].join(' · ');
}
