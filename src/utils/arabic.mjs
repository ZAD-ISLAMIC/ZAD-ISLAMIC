export const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'

export function arabicDigits(value) {
  return String(value).replace(/\d/g, (d) => ARABIC_DIGITS[Number(d)])
}