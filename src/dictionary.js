const fs = require('fs');
const path = require('path');

const SOFIT_MAP = {
  'ך': 'כ',
  'ם': 'מ',
  'ן': 'נ',
  'ף': 'פ',
  'ץ': 'צ',
};

const HEBREW_LETTERS = [
  'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'כ',
  'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ', 'ק', 'ר', 'ש', 'ת',
];

const HEBREW_WORD_RE = /^[\u05D0-\u05EA]{2,30}$/;
const NIQQUD_RE = /[\u0591-\u05C7]/g;

function normalizeWord(word) {
  if (!word) return '';
  return word.replace(NIQQUD_RE, '').trim();
}

function normalizeSofit(str) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    out += SOFIT_MAP[ch] || ch;
  }
  return out;
}

const PREFIX_LETTERS = new Set(['ה', 'ב', 'כ', 'ל', 'מ', 'ש', 'ו']);

/**
 * Finds the start index and length of `prompt` inside `word` using sofit-insensitive matching.
 * Returns { index, length } or null if not found.
 */
function findPromptMatch(word, prompt) {
  const normWord = normalizeSofit(normalizeWord(word));
  const normPrompt = normalizeSofit(normalizeWord(prompt));
  if (!normPrompt) return null;
  const idx = normWord.indexOf(normPrompt);
  if (idx === -1) return null;
  return { index: idx, length: normPrompt.length };
}

class HebrewDictionary {
  constructor() {
    this.allWords = new Set();
    this.dicWords = new Set();
    this.commonWords = [];
    this.commonSet = new Set();
    // Map normalizedPrompt -> { display: string, count: number, len: number }
    this.promptStats = new Map();
    this.promptsByDifficulty = {
      beginner: [], // >= 150
      medium: [],   // >= 75
      hard: [],     // >= 25
      all: [],      // >= 10
    };
  }

  load(dataDir) {
    const start = Date.now();
    const commonSet = new Set();

    // 1. Load authoritative Hebrew dictionary (Hspell via wooorm/dictionaries)
    const dicPath = path.join(dataDir, 'wooorm_he.dic');
    if (fs.existsSync(dicPath)) {
      const lines = fs.readFileSync(dicPath, 'utf8').split(/\r?\n/);
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const slashIdx = line.indexOf('/');
        const rawWord = slashIdx === -1 ? line : line.slice(0, slashIdx);
        const w = normalizeWord(rawWord);
        if (HEBREW_WORD_RE.test(w)) {
          this.allWords.add(w);
          this.dicWords.add(w);
        }
      }
    }

    // 2. Load top ~25,000 common everyday Hebrew words (high-frequency & morphologically valid)
    const commonPath = path.join(dataDir, 'common_words.txt');
    if (fs.existsSync(commonPath)) {
      const lines = fs.readFileSync(commonPath, 'utf8').split(/\r?\n/);
      for (const line of lines) {
        const w = normalizeWord(line);
        if (HEBREW_WORD_RE.test(w)) {
          this.allWords.add(w);
          commonSet.add(w);
        }
      }
    }

    // 3. Load Israeli slang, IDF, street & swear words
    const slangPath = path.join(dataDir, 'israeli_slang.txt');
    if (fs.existsSync(slangPath)) {
      const lines = fs.readFileSync(slangPath, 'utf8').split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const w = normalizeWord(trimmed);
        if (HEBREW_WORD_RE.test(w)) {
          this.allWords.add(w);
          commonSet.add(w);
        }
      }
    }

    this.commonWords = Array.from(commonSet);
    this.commonSet = commonSet;

    // Build 2-letter and 3-letter prompt index from commonWords
    // Track both normalized form and most frequent natural spelling
    const displayCounts = new Map(); // normPrompt -> Map<rawSub, count>

    for (const word of this.commonWords) {
      if (word.length < 2) continue;
      const seenInWord = new Set();
      for (const len of [2, 3]) {
        if (word.length < len) continue;
        for (let i = 0; i <= word.length - len; i++) {
          const sub = word.slice(i, i + len);
          const normSub = normalizeSofit(sub);
          if (seenInWord.has(normSub)) continue;
          seenInWord.add(normSub);

          let entry = this.promptStats.get(normSub);
          if (!entry) {
            entry = { norm: normSub, display: sub, count: 0 };
            this.promptStats.set(normSub, entry);
            displayCounts.set(normSub, new Map());
          }
          entry.count++;
          const dc = displayCounts.get(normSub);
          dc.set(sub, (dc.get(sub) || 0) + 1);
        }
      }
    }

    // Pick the most natural display form (prefer non-sofit at start/middle, or most common)
    for (const [normSub, entry] of this.promptStats.entries()) {
      const dc = displayCounts.get(normSub);
      let bestSub = entry.display;
      let bestCount = -1;
      for (const [sub, c] of dc.entries()) {
        if (c > bestCount) {
          bestCount = c;
          bestSub = sub;
        }
      }
      entry.display = bestSub;

      if (entry.count >= 150) this.promptsByDifficulty.beginner.push(entry);
      if (entry.count >= 75) this.promptsByDifficulty.medium.push(entry);
      if (entry.count >= 25) this.promptsByDifficulty.hard.push(entry);
      if (entry.count >= 10) this.promptsByDifficulty.all.push(entry);
    }

    console.log(
      `[Dictionary] Loaded ${this.allWords.size} total Hebrew words (${this.commonWords.length} common) in ${Date.now() - start}ms. ` +
      `Prompts: beginner=${this.promptsByDifficulty.beginner.length}, medium=${this.promptsByDifficulty.medium.length}, hard=${this.promptsByDifficulty.hard.length}`
    );
  }

  hasWord(word) {
    const clean = normalizeWord(word);
    return this.allWords.has(clean);
  }

  /**
   * Checks if `word` only matches `prompt` by relying on a leading linking/prefix letter
   * (ה, ב, כ, ל, מ, ש, ו) attached to a valid stem word (e.g. "הפרה" for prompt "הפ").
   * Returns the offending prefix string if invalid, or null if valid.
   */
  getCheatingPrefix(word, prompt) {
    const clean = normalizeWord(word);
    const normPrompt = normalizeSofit(normalizeWord(prompt));
    if (!clean || !normPrompt) return null;

    // Check 1-letter and 2-letter prefixes (ה, ב, כ, ל, מ, ש, ו)
    for (const pLen of [1, 2]) {
      if (clean.length - pLen < 2) continue;
      const prefix = clean.slice(0, pLen);
      if (![...prefix].every((ch) => PREFIX_LETTERS.has(ch))) continue;

      const stem = clean.slice(pLen);
      if (!this.allWords.has(stem)) continue;

      // If the word is NOT a base dic word (e.g. "במחשב", "לבית"), OR it starts with ה/ו/ב/ל/כ/ש
      // attached to a common standalone word (e.g. "הפרה" = ה + פרה):
      const isPrefixedForm = !this.dicWords.has(clean) || (pLen === 1 && (prefix === 'ה' || prefix === 'ו') && this.commonSet.has(stem));
      if (isPrefixedForm && !normalizeSofit(stem).includes(normPrompt)) {
        return prefix;
      }
    }
    return null;
  }

  getRandomPrompt(rules, streak = 0) {
    let pool = [];
    let diff = rules.difficulty || 'medium';
    if (streak >= 5 && diff === 'beginner') diff = 'medium';
    if (streak >= 4 && diff === 'medium') diff = 'hard';

    if (diff === 'beginner') {
      pool = this.promptsByDifficulty.beginner;
    } else if (diff === 'medium') {
      pool = this.promptsByDifficulty.medium;
    } else if (diff === 'hard') {
      pool = this.promptsByDifficulty.hard;
    } else if (diff === 'custom') {
      const mode = rules.customMode || 'atLeast';
      const threshold = Math.max(1, Number(rules.customThreshold) || 50);
      for (const entry of this.promptStats.values()) {
        if (mode === 'atLeast' && entry.count >= threshold) pool.push(entry);
        else if (mode === 'atMost' && entry.count <= threshold && entry.count >= 5) pool.push(entry);
      }
    }

    if (!pool || pool.length === 0) {
      pool = this.promptsByDifficulty.medium.length > 0
        ? this.promptsByDifficulty.medium
        : Array.from(this.promptStats.values());
    }

    // Mix 2-letter and 3-letter prompts (~45% 3-letter normally, ~70% on high streak or hard)
    const threeLetterChance = (streak >= 5 || diff === 'hard') ? 0.7 : 0.45;
    const wantLen = Math.random() < threeLetterChance ? 3 : 2;
    const filtered = pool.filter((p) => p.norm.length === wantLen);
    const finalPool = filtered.length > 0 ? filtered : pool;

    const picked = finalPool[Math.floor(Math.random() * finalPool.length)];
    return picked ? picked.display : 'בו';
  }

  /**
   * Finds a valid unused word for an AI bot, matching the prompt.
   */
  findBotWord(prompt, usedWordsSet) {
    const normPrompt = normalizeSofit(normalizeWord(prompt));
    const len = this.commonWords.length;
    for (let attempt = 0; attempt < 2000; attempt++) {
      const w = this.commonWords[Math.floor(Math.random() * len)];
      if (!usedWordsSet.has(w) && normalizeSofit(w).includes(normPrompt) && !this.getCheatingPrefix(w, prompt)) {
        return w;
      }
    }
    for (const w of this.commonWords) {
      if (!usedWordsSet.has(w) && normalizeSofit(w).includes(normPrompt) && !this.getCheatingPrefix(w, prompt)) {
        return w;
      }
    }
    return null;
  }
}

module.exports = {
  HebrewDictionary,
  HEBREW_LETTERS,
  normalizeWord,
  normalizeSofit,
  findPromptMatch,
};
