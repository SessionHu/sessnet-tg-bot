import { OUTPUT_LIMIT_LENGTH } from './index.ts';
const LESS_THAN_REGEX = /\</g;
export function escapeHtmlText(text: string): string {
  if (text.length > OUTPUT_LIMIT_LENGTH) text = text.slice(0, OUTPUT_LIMIT_LENGTH);
  return text.replace(LESS_THAN_REGEX, '&lt;');
}
