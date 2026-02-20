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