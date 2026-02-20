// Light mode: Macaron/Pastel colors
// Dark mode: Deep/Muted colors
export const placeholderColors = [
  'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-100', // Mint/Forest
  'bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-100',   // Purple/Deep Purple
  'bg-orange-100 dark:bg-orange-900/60 text-orange-800 dark:text-orange-100',   // Orange/Brownish
  'bg-cyan-100 dark:bg-cyan-900/60 text-cyan-800 dark:text-cyan-100',       // Cyan/Midnight Blue
  'bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-100',       // Pink/Burgundy
  'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-100',   // Indigo/Deep Blue
];

export const getPlaceholderColor = (id: string) => {
  if (!id) return placeholderColors[0];
  const index = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return placeholderColors[index % placeholderColors.length];
};

/**
 * 中文自然排序比较器
 * 将标题中的中文数字（第一季/第二季/第十二部 等）转换为阿拉伯数字后进行自然排序。
 * 支持：一至九十九的中国数字，阿拉伯数字，以及混合场景。
 */
const chineseDigitMap: Record<string, number> = {
  '零': 0, '〇': 0,
  '一': 1, '壹': 1,
  '二': 2, '贰': 2, '两': 2,
  '三': 3, '叁': 3,
  '四': 4, '肆': 4,
  '五': 5, '伍': 5,
  '六': 6, '陆': 6,
  '七': 7, '柒': 7,
  '八': 8, '捌': 8,
  '九': 9, '玖': 9,
};

function chineseNumberToArabic(str: string): number {
  // Handle single digit
  if (str.length === 1 && chineseDigitMap[str] !== undefined) {
    return chineseDigitMap[str];
  }

  let result = 0;
  const tenIdx = str.indexOf('十');
  if (tenIdx === -1 && str.length === 1) {
    return chineseDigitMap[str] ?? 0;
  }

  if (tenIdx !== -1) {
    // X十Y pattern
    const beforeTen = tenIdx > 0 ? (chineseDigitMap[str[tenIdx - 1]] ?? 1) : 1;
    const afterTen = tenIdx < str.length - 1 ? (chineseDigitMap[str[tenIdx + 1]] ?? 0) : 0;
    result = beforeTen * 10 + afterTen;
  } else {
    // Pure single char digit
    result = chineseDigitMap[str[0]] ?? 0;
  }
  return result;
}

/**
 * 将标题中的中文序号替换为零填充的阿拉伯数字用于排序
 * 例如：盗墓笔记_第一季_七星鲁王宫 → 盗墓笔记_第001季_七星鲁王宫
 */
function normalizeTitleForSort(title: string): string {
  // Replace 第X季/部/卷/章/集/册/回/篇 patterns 
  return title.replace(/第([零〇一二三四五六七八九十壹贰叁肆伍陆柒捌玖两百千]+)(季|部|卷|章|集|册|回|篇)/g,
    (_match, numStr, unit) => {
      const num = chineseNumberToArabic(numStr);
      return `第${String(num).padStart(3, '0')}${unit}`;
    }
  ).replace(/(\d+)/g, (_match, numStr) => {
    return numStr.padStart(6, '0');
  });
}

export function naturalCompareTitle(a: string, b: string): number {
  const na = normalizeTitleForSort(a);
  const nb = normalizeTitleForSort(b);
  return na.localeCompare(nb, 'zh', { numeric: true });
}