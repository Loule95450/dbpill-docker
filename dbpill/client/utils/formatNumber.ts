export const formatNumber = (num: number) => {
  if (!num) return '?';
  return num > 10
    ? Math.round(num).toLocaleString('en-US')
    : num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}; 