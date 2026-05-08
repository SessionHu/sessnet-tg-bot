const LESS_THAN_REGEX = /\</g;
export function escapeHtmlText(text: string): string {
  return text.replace(LESS_THAN_REGEX, '&lt;');
}
