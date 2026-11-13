/** Units shown in the format controls: indents in centimetres (stored in points), spacing in points. */
export const PT_PER_CM = 72 / 2.54;
export const PX_PER_PT = 96 / 72;
export const PX_PER_MM = 96 / 25.4;

export const ptToCm = (pt: number) => Math.round((pt / PT_PER_CM) * 100) / 100;
export const cmToPt = (cm: number) => Math.round(cm * PT_PER_CM * 100) / 100;
/** "1.27 cm", "0 cm". */
export const cmText = (pt: number) => `${ptToCm(pt).toLocaleString('en', { maximumFractionDigits: 2 })} cm`;
/** Snaps points to the nearest step in centimetres (the ruler and its keyboard steps move in 0.25 cm). */
export const snapPt = (pt: number, stepCm = 0.25) => cmToPt(Math.round(pt / PT_PER_CM / stepCm) * stepCm);
/** A number typed into a field, or null when it is empty or not a number. */
export const readNumber = (text: string): number | null => {
  if (text.trim() === '') return null;
  const n = Number(text.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
