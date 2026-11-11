/**
 * Prose that mentions Haybarn links its first mention to the product page. These helpers
 * turn a plain-text string (our own copy, escaped here) into HTML for `set:html`.
 */
export const HAYBARN_HREF = '/products/haybarn';

const LINK_CLASS = {
  light: 'text-link underline decoration-link/40 underline-offset-2 hover:decoration-link',
  dark: 'text-sun-400 underline decoration-sun-400/40 underline-offset-2 hover:decoration-sun-400',
} as const;

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function linkHaybarn(text: string, tone: keyof typeof LINK_CLASS = 'light'): string {
  return escapeHtml(text).replace(/\bhaybarn\b/i, () => `<a href="${HAYBARN_HREF}" class="${LINK_CLASS[tone]}">Haybarn</a>`);
}
