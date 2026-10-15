import { normalize } from '../utils/text.js';

export function matchIssues(issues, term) {
  const words = normalize(term).split(/\s+/).filter(Boolean);
  return issues.filter((i) => {
    const text = normalize(`${i.key} ${i.summary}`);
    return words.every((w) => text.includes(w));
  });
}

export function rankChoices(choices, term) {
  if (!term) return choices;
  const t = normalize(term);
  const starts = [];
  const contains = [];
  for (const ch of choices) {
    const words = normalize(ch.keywords);
    if (words.startsWith(t)) starts.push(ch);
    else if (words.includes(t)) contains.push(ch);
  }
  return [...starts, ...contains];
}
