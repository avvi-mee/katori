// Fraunces for big numbers and headings, Manrope for UI text. Numbers are always tabular.
// Split into parts so a caller's `font-*` or text color replaces the default instead of
// fighting it in CSS order.
type Variant = { font: string; size: string; color: string };

export const textVariants = {
  hero: { font: 'font-display-bold', size: 'text-5xl leading-[56px]', color: 'text-ink' },
  display: { font: 'font-display', size: 'text-3xl leading-[38px]', color: 'text-ink' },
  title: { font: 'font-display', size: 'text-2xl leading-8', color: 'text-ink' },
  heading: { font: 'font-sans-bold', size: 'text-lg leading-6', color: 'text-ink' },
  body: { font: 'font-sans-regular', size: 'text-base leading-6', color: 'text-ink' },
  label: { font: 'font-sans-semibold', size: 'text-[15px] leading-5', color: 'text-ink' },
  caption: { font: 'font-sans', size: 'text-[13px] leading-[18px]', color: 'text-ink-muted' },
  number: { font: 'font-display-bold', size: 'text-2xl', color: 'text-ink' },
} satisfies Record<string, Variant>;

export type TextVariant = keyof typeof textVariants;

const COLOR = /(^|\s)text-(ink|ink-muted|bg|surface|accent|on-accent|protein|carbs|fat)(\s|$)/;
const FONT = /(^|\s)font-(display|display-bold|sans|sans-regular|sans-semibold|sans-bold)(\s|$)/;

export function textClass(variant: TextVariant, extra = ''): string {
  const v = textVariants[variant];
  return [FONT.test(extra) ? '' : v.font, v.size, COLOR.test(extra) ? '' : v.color, extra].filter(Boolean).join(' ');
}
