export const normalize = (s) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export const truncate = (text, max) => (text.length > max ? text.slice(0, max - 1) + '…' : text);
