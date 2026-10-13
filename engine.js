import { fsrs, createEmptyCard, State } from "./vendor/fsrs.mjs";

export const STORAGE_KEY = "rangkai-v2";
export const STARTER_WORDS = [
  "saya",
  "awak",
  "dia",
  "kami",
  "kita",
  "makan",
  "minum",
  "baca",
  "tulis",
  "beli",
  "nasi",
  "air",
  "buku",
  "surat",
];
export const PATTERN_IDS = [
  "basic",
  "ongoing",
  "forms",
  "destination",
  "past",
  "question",
  "description",
  "relative",
  "reason",
];
export const DIRECTIONS = ["recognition", "recall"];
const scheduler = fsrs({
  request_retention: 0.9,
  enable_fuzz: false,
  enable_short_term: true,
});
let catalogue = [],
  wordMap = new Map();

export function configureCatalogue(data) {
  catalogue = [...data.words, ...data.lessonWords].sort(
    (a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity),
  );
  wordMap = new Map(catalogue.map((w) => [w.id, w]));
}
export function getWord(id) {
  return wordMap.get(id);
}
export function getCatalogue() {
  return catalogue;
}
export function wordId(word) {
  return "ms:" + word.toLowerCase();
}
export function cardKey(kind, id, direction) {
  return `${kind}|${id}|${direction}`;
}
export function localDay(now = Date.now()) {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function freshState(now = Date.now()) {
  return {
    version: 2,
    createdAt: now,
    updatedAt: now,
    records: {},
    exposures: {},
    introduced: STARTER_WORDS.map(wordId),
    unlocked: ["basic"],
    activePattern: "basic",
    settings: { direction: "mixed", newPerDay: 5 },
    daily: { day: localDay(now), count: 0 },
    reviews: 0,
    history: [],
    legacy: null,
  };
}
function realCard(record, now) {
  if (!record) return createEmptyCard(new Date(now));
  return {
    ...record.card,
    due: new Date(record.card.due),
    last_review: new Date(record.card.last_review),
  };
}
function storedCard(card) {
  return {
    due: +card.due,
    last_review: +card.last_review,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
  };
}
export function review(state, kind, id, direction, rating, now = Date.now()) {
  if (!DIRECTIONS.includes(direction) || ![1, 2, 3, 4].includes(rating))
    throw new Error("Invalid review.");
  if (
    kind === "word"
      ? !wordMap.has(id)
      : kind !== "grammar" || !PATTERN_IDS.includes(id)
  )
    throw new Error("Unknown learning item.");
  const key = cardKey(kind, id, direction),
    previous = state.records[key];
  if (previous && now < previous.card.last_review)
    throw new Error(
      "Your device clock is earlier than the last review. Check the clock before rating.",
    );
  const result = scheduler.next(realCard(previous, now), new Date(now), rating);
  state.records[key] = {
    card: storedCard(result.card),
    successes: (previous?.successes ?? 0) + (rating >= 3 ? 1 : 0),
    failures: (previous?.failures ?? 0) + (rating === 1 ? 1 : 0),
    delayed:
      (previous?.delayed ?? 0) +
      (rating >= 3 && previous && now - previous.card.last_review >= 86400000
        ? 1
        : 0),
    lastRating: rating,
  };
  if (kind === "word" && !state.introduced.includes(id))
    state.introduced.push(id);
  state.reviews++;
  state.updatedAt = now;
  state.history.push({ key, rating, at: now });
  state.history = state.history.slice(-3000);
  refreshUnlocks(state);
  return state.records[key];
}
export function previewIntervals(state, kind, id, direction, now = Date.now()) {
  const record = state.records[cardKey(kind, id, direction)];
  if (record && now < record.card.last_review) return null;
  const preview = scheduler.repeat(realCard(record, now), new Date(now));
  return [1, 2, 3, 4].map((r) => +preview[r].card.due - now);
}
export function recallEstimate(record, now = Date.now()) {
  if (!record) return 0;
  try {
    return Math.max(
      0,
      Math.min(
        100,
        Math.round(
          scheduler.get_retrievability(
            realCard(record, now),
            new Date(now),
            false,
          ) * 100,
        ),
      ),
    );
  } catch {
    return 0;
  }
}
export function isFamiliar(record) {
  return Boolean(
    record &&
      record.delayed >= 2 &&
      record.card.state === State.Review &&
      record.lastRating >= 3,
  );
}
export function wordStatus(state, id, now = Date.now()) {
  const records = DIRECTIONS.map((d) => state.records[cardKey("word", id, d)]);
  if (!records.some(Boolean))
    return state.introduced.includes(id) ? "new" : "locked";
  if (records.some((r) => r && r.card.due <= now)) return "due";
  return records.every(isFamiliar) ? "familiar" : "learning";
}
export function comfortable(state, id) {
  return DIRECTIONS.every(
    (d) => (state.records[cardKey("word", id, d)]?.successes ?? 0) > 0,
  );
}
export function refreshUnlocks(state) {
  for (let i = 1; i < PATTERN_IDS.length; i++) {
    const prior = PATTERN_IDS[i - 1];
    if (
      state.unlocked.includes(prior) &&
      DIRECTIONS.every(
        (d) =>
          (state.records[cardKey("grammar", prior, d)]?.successes ?? 0) > 0,
      ) &&
      !state.unlocked.includes(PATTERN_IDS[i])
    )
      state.unlocked.push(PATTERN_IDS[i]);
  }
}
export function ensureDaily(state, now = Date.now()) {
  if (state.daily.day !== localDay(now))
    state.daily = { day: localDay(now), count: 0 };
}
export function dueCount(state, kind = null, now = Date.now()) {
  return Object.entries(state.records).filter(
    ([key, r]) => (!kind || key.startsWith(kind + "|")) && r.card.due <= now,
  ).length;
}
export function nextVocabulary(
  state,
  direction = "mixed",
  now = Date.now(),
  prerequisiteIds = [],
) {
  ensureDaily(state, now);
  const dirs = direction === "mixed" ? DIRECTIONS : [direction];
  const ids = [...state.introduced].sort(
    (a, b) => (getWord(a)?.rank ?? Infinity) - (getWord(b)?.rank ?? Infinity),
  );
  // A chosen sentence prerequisite is explicit, shown in the UI, and ordered by frequency.
  const ready = (id) =>
    dirs.every(
      (d) => (state.records[cardKey("word", id, d)]?.successes ?? 0) > 0,
    );
  const prerequisites = prerequisiteIds
    .filter((id) => wordMap.has(id) && !ready(id))
    .sort(
      (a, b) => (getWord(a)?.rank ?? Infinity) - (getWord(b)?.rank ?? Infinity),
    );
  const due = ids
    .flatMap((id) =>
      dirs.map((d) => ({
        id,
        direction: d,
        record: state.records[cardKey("word", id, d)],
      })),
    )
    .filter((x) => x.record && x.record.card.due <= now)
    .sort((a, b) => a.record.card.due - b.record.card.due);
  if (due.length) return { ...due[0], reason: "due" };
  for (const id of [
    ...new Set([...prerequisites.filter((id) => ids.includes(id)), ...ids]),
  ]) {
    for (const d of dirs) {
      if (
        !state.records[cardKey("word", id, d)] &&
        (d !== "recall" ||
          direction === "recall" ||
          state.records[cardKey("word", id, "recognition")]?.successes > 0)
      )
        return { id, direction: d, reason: "new" };
    }
  }
  const unsettled = state.introduced.filter((id) => !ready(id)).length;
  const candidate =
    prerequisites.find((id) => !ids.includes(id)) ??
    catalogue.find((w) => !ids.includes(w.id))?.id;
  if (
    candidate &&
    unsettled < 5 &&
    state.daily.count < state.settings.newPerDay &&
    !dueCount(state, "word", now)
  ) {
    if (!state.introduced.includes(candidate)) state.introduced.push(candidate);
    state.daily.count++;
    state.updatedAt = now;
    return {
      id: candidate,
      direction: direction === "recall" ? "recall" : "recognition",
      reason: prerequisites.includes(candidate) ? "prerequisite" : "new",
    };
  }
  return null;
}
export function noteExposure(state, words, now = Date.now()) {
  for (const word of new Set(words)) {
    const id = wordId(word);
    if (wordMap.has(id))
      state.exposures[id] = Math.min(1000000, (state.exposures[id] ?? 0) + 1);
  }
  state.updatedAt = now;
}

const finite = (n, min, max) =>
  typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
const integer = (n, min, max) => finite(n, min, max) && Number.isInteger(n);
const object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
function knownKey(key) {
  const [kind, id, d, ...extra] = key.split("|");
  return (
    !extra.length &&
    DIRECTIONS.includes(d) &&
    (kind === "word"
      ? wordMap.has(id)
      : kind === "grammar" && PATTERN_IDS.includes(id))
  );
}
export function validateState(input) {
  if (!object(input) || input.version !== 2)
    throw new Error("This save uses an unsupported format.");
  if (
    !finite(input.createdAt, 0, 8e15) ||
    !finite(input.updatedAt, 0, 8e15) ||
    !integer(input.reviews, 0, 1e9)
  )
    throw new Error("Invalid progress dates or review count.");
  if (
    !Array.isArray(input.introduced) ||
    input.introduced.length > catalogue.length ||
    new Set(input.introduced).size !== input.introduced.length ||
    input.introduced.some((id) => !wordMap.has(id))
  )
    throw new Error("The save contains unknown or duplicate vocabulary.");
  if (
    !Array.isArray(input.unlocked) ||
    input.unlocked.length > PATTERN_IDS.length ||
    !input.unlocked.includes("basic") ||
    new Set(input.unlocked).size !== input.unlocked.length ||
    input.unlocked.some((id) => !PATTERN_IDS.includes(id)) ||
    !input.unlocked.includes(input.activePattern)
  )
    throw new Error("Invalid learning path.");
  if (
    !object(input.settings) ||
    !["mixed", ...DIRECTIONS].includes(input.settings.direction) ||
    !integer(input.settings.newPerDay, 1, 20)
  )
    throw new Error("Invalid learning settings.");
  if (
    !object(input.daily) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.daily.day) ||
    !integer(input.daily.count, 0, 100)
  )
    throw new Error("Invalid daily progress.");
  if (
    !object(input.records) ||
    Object.keys(input.records).length >
      (catalogue.length + PATTERN_IDS.length) * 2
  )
    throw new Error("Invalid review records.");
  const records = {};
  for (const [key, r] of Object.entries(input.records)) {
    if (!knownKey(key) || !object(r) || !object(r.card))
      throw new Error("Unknown review item.");
    const c = r.card;
    if (
      !finite(c.due, 0, 8e15) ||
      !finite(c.last_review, 0, 8e15) ||
      c.due < c.last_review ||
      !finite(c.stability, 0.0001, 1e8) ||
      !finite(c.difficulty, 0.1, 10) ||
      !finite(c.elapsed_days, 0, 1e8) ||
      !finite(c.scheduled_days, 0, 36500) ||
      !integer(c.learning_steps, 0, 100) ||
      !integer(c.reps, 1, 1e9) ||
      !integer(c.lapses, 0, c.reps) ||
      !integer(c.state, 1, 3) ||
      !integer(r.successes, 0, c.reps) ||
      !integer(r.failures, 0, c.reps) ||
      r.successes + r.failures > c.reps ||
      !integer(r.delayed, 0, r.successes) ||
      !integer(r.lastRating, 1, 4)
    )
      throw new Error("Invalid spaced-repetition record.");
    if (
      key.startsWith("word|") &&
      !input.introduced.includes(key.split("|")[1])
    )
      throw new Error("Review record is outside your word pool.");
    records[key] = {
      card: {
        due: c.due,
        last_review: c.last_review,
        stability: c.stability,
        difficulty: c.difficulty,
        elapsed_days: c.elapsed_days,
        scheduled_days: c.scheduled_days,
        learning_steps: c.learning_steps,
        reps: c.reps,
        lapses: c.lapses,
        state: c.state,
      },
      successes: r.successes,
      failures: r.failures,
      delayed: r.delayed,
      lastRating: r.lastRating,
    };
  }
  if (
    !object(input.exposures) ||
    Object.keys(input.exposures).length > catalogue.length
  )
    throw new Error("Invalid exposure history.");
  const exposures = {};
  for (const [id, count] of Object.entries(input.exposures)) {
    if (!wordMap.has(id) || !integer(count, 0, 1000000))
      throw new Error("Invalid vocabulary exposure.");
    exposures[id] = count;
  }
  if (
    !Array.isArray(input.history) ||
    input.history.length > 3000 ||
    input.history.some(
      (h) =>
        !object(h) ||
        !knownKey(h.key) ||
        !integer(h.rating, 1, 4) ||
        !finite(h.at, 0, 8e15),
    )
  )
    throw new Error("Invalid review history.");
  const legacy = input.legacy ? validateLegacy(input.legacy) : null;
  return restoreLegacyAccess({
    version: 2,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    records,
    exposures,
    introduced: [...input.introduced],
    unlocked: [...input.unlocked],
    activePattern: input.activePattern,
    settings: {
      direction: input.settings.direction,
      newPerDay: input.settings.newPerDay,
    },
    daily: { day: input.daily.day, count: input.daily.count },
    reviews: input.reviews,
    history: input.history.map((h) => ({
      key: h.key,
      rating: h.rating,
      at: h.at,
    })),
    legacy,
  });
}
export function validateLegacy(old) {
  if (
    !object(old) ||
    !integer(old.stage, 0, 3) ||
    !Array.isArray(old.confident) ||
    old.confident.length > 20 ||
    !Array.isArray(old.review) ||
    old.review.length > 20
  )
    throw new Error("Invalid earlier prototype save.");
  const validId = (x) => typeof x === "string" && /^[0-3]-[0-4]$/.test(x);
  if (![...old.confident, ...old.review].every(validId))
    throw new Error("Invalid earlier sentence records.");
  return {
    stage: old.stage,
    confident: [...new Set(old.confident)],
    review: [...new Set(old.review)],
  };
}
export function migrateLegacy(old, now = Date.now()) {
  const legacy = validateLegacy(old),
    state = freshState(now);
  state.legacy = legacy;
  return restoreLegacyAccess(state);
}
function restoreLegacyAccess(state) {
  const legacy = state.legacy;
  if (!legacy) return state;
  let unlocked = 0;
  while (
    unlocked < 3 &&
    Array.from({ length: 5 }, (_, i) => `${unlocked}-${i}`).every((id) =>
      legacy.confident.includes(id),
    )
  ) unlocked++;
  // The last selected chapter can be earlier than the highest unlocked one.
  unlocked = Math.max(unlocked, legacy.stage);
  // Preserve prior access and self-ratings, but do not invent per-word mastery.
  if (unlocked >= 1) {
    state.unlocked.push("ongoing");
    state.introduced.push(wordId("sedang"));
  }
  if (unlocked >= 2) {
    state.unlocked.push("forms");
    state.introduced.push(...["membaca", "menulis", "membeli"].map(wordId));
  }
  if (unlocked >= 3) state.introduced.push(...["roti", "teh"].map(wordId));
  state.introduced = [...new Set(state.introduced)];
  state.unlocked = [...new Set(state.unlocked)];
  return state;
}

const MAX_BYTES = 4 * 1024 * 1024;
function base64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}
async function hash(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
async function readLimited(stream) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) throw new Error("Save is too large.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const output = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    output.set(chunk, at);
    at += chunk.length;
  }
  return output;
}
export async function encodeSave(state) {
  const clean = validateState(state),
    bytes = new TextEncoder().encode(JSON.stringify(clean));
  if (bytes.length > MAX_BYTES) throw new Error("Save is too large.");
  const compressed = typeof CompressionStream !== "undefined";
  const payload = compressed
    ? await readLimited(
        new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip")),
      )
    : bytes;
  return `RG2${compressed ? "G" : "J"}.${await hash(bytes)}.${base64(payload)}`;
}
export async function decodeSave(text) {
  if (typeof text !== "string" || text.length > 6 * 1024 * 1024)
    throw new Error("Save is too large.");
  const parts = text.trim().split(".");
  if (
    parts.length !== 3 ||
    !["RG2G", "RG2J"].includes(parts[0]) ||
    !/^[a-f0-9]{64}$/.test(parts[1]) ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(parts[2])
  )
    throw new Error("This is not a Rangkai save code.");
  let payload;
  try {
    payload = Uint8Array.from(atob(parts[2]), (c) => c.charCodeAt(0));
  } catch {
    throw new Error("The save code is incomplete or damaged.");
  }
  let bytes = payload;
  if (parts[0] === "RG2G") {
    if (typeof DecompressionStream === "undefined")
      throw new Error("Use a current browser to load this compressed save.");
    try {
      bytes = await readLimited(
        new Blob([payload])
          .stream()
          .pipeThrough(new DecompressionStream("gzip")),
      );
    } catch {
      throw new Error("The compressed save is damaged or too large.");
    }
  }
  if (bytes.length > MAX_BYTES || (await hash(bytes)) !== parts[1])
    throw new Error("The save integrity check failed. Nothing was changed.");
  let parsed;
  try {
    parsed = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
  } catch {
    throw new Error("The save data is not valid.");
  }
  return validateState(parsed);
}
