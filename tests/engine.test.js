import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  configureCatalogue,
  freshState,
  getWord,
  wordId,
  cardKey,
  review,
  dueCount,
  nextVocabulary,
  recallEstimate,
  isFamiliar,
  validateState,
  migrateLegacy,
  encodeSave,
  decodeSave,
  PATTERN_IDS,
  STARTER_WORDS,
} from "../engine.js";
import {
  SENTENCES,
  PATTERNS,
  prepareLessons,
  candidatesFor,
} from "../lessons.js";

const data = JSON.parse(
  readFileSync(new URL("../data/vocabulary.json", import.meta.url)),
);
configureCatalogue(data);
prepareLessons();
const NOW = Date.UTC(2026, 9, 13, 9);
test("1000 sourced entries have unique stable IDs, increasing corpus ranks, and actual glosses", () => {
  assert.equal(data.words.length, 1000);
  assert.equal(new Set(data.words.map((w) => w.id)).size, 1000);
  assert.ok(
    data.words.every(
      (w, i) =>
        w.meaning && w.rank > 0 && (!i || w.rank > data.words[i - 1].rank),
    ),
  );
  assert.equal(data.words[0].word, "yang");
  assert.ok(
    data.words
      .filter((w) => w.source === "wordnet")
      .every(
        (w) =>
          w.senses.length && w.senses.every((s) => s.synset && s.definition),
      ),
  );
});
test("every generated sentence has defined words and chunk meanings; semantic slots stay compatible", () => {
  assert.equal(PATTERNS.length, 9);
  assert.deepEqual(
    PATTERNS.map((p) => p.id),
    PATTERN_IDS,
  );
  assert.ok(SENTENCES.length > 150);
  assert.equal(new Set(SENTENCES.map((s) => s.id)).size, SENTENCES.length);
  for (const s of SENTENCES) {
    assert.ok(
      s.words.every((w) => getWord(wordId(w))),
      s.ms,
    );
    assert.ok(
      s.chunks.every((c) => c.ms && c.en && c.note),
      s.ms,
    );
    assert.ok(!/\bi\b/.test(s.en), s.en);
    assert.ok(!s.ms.includes("minum nasi"));
    if (s.pattern === "reason") assert.ok(s.ms.split(" ").length >= 9);
  }
  assert.ok(
    candidatesFor(freshState(NOW), "basic").some((s) => s.unknown.length === 0),
  );
  assert.ok(
    candidatesFor(freshState(NOW), "destination").every(
      (s) => s.unknown.length > 0,
    ),
  );
});
test("FSRS keeps recognition, recall, derived forms, and grammar independent", () => {
  const state = freshState(NOW);
  review(state, "word", "ms:baca", "recognition", 3, NOW);
  assert.equal(
    state.records[cardKey("word", "ms:baca", "recognition")].card.reps,
    1,
  );
  assert.equal(state.records[cardKey("word", "ms:baca", "recall")], undefined);
  assert.equal(
    state.records[cardKey("word", "ms:membaca", "recognition")],
    undefined,
  );
  review(state, "grammar", "basic", "recognition", 3, NOW);
  assert.equal(state.unlocked.length, 1);
  review(state, "grammar", "basic", "recall", 3, NOW + 1000);
  assert.ok(state.unlocked.includes("ongoing"));
  assert.equal(
    state.records[cardKey("word", "ms:makan", "recognition")],
    undefined,
  );
  assert.deepEqual(validateState(state), state);
});

test("repair an already-migrated snapshot's legacy access without altering its reviews", () => {
  const state = freshState(NOW);
  state.legacy = {
    stage: 0,
    confident: Array.from({ length: 20 }, (_, i) => `${Math.floor(i / 5)}-${i % 5}`),
    review: [],
  };
  review(state, "word", "ms:saya", "recognition", 3, NOW);
  const repaired = validateState(state);
  assert.equal(repaired.introduced.length, 20);
  assert.ok(repaired.unlocked.includes("forms"));
  assert.deepEqual(repaired.records, state.records);
  assert.equal(repaired.reviews, 1);
  assert.deepEqual(validateState(repaired), repaired);
});
test("due reviews take priority; future reviews are not treated as due", () => {
  const state = freshState(NOW);
  review(state, "word", "ms:saya", "recognition", 1, NOW);
  assert.equal(dueCount(state, "word", NOW), 0);
  const card = state.records[cardKey("word", "ms:saya", "recognition")].card;
  assert.ok(card.due > NOW);
  const selected = nextVocabulary(state, "mixed", card.due + 1);
  assert.equal(selected.id, "ms:saya");
  assert.equal(selected.reason, "due");
  assert.equal(selected.direction, "recognition");
});
test("frequency-first additions respect learning pool, daily cap, and chosen direction", () => {
  const state = freshState(NOW);
  for (const word of STARTER_WORDS)
    for (const d of ["recognition", "recall"])
      review(state, "word", wordId(word), d, 4, NOW);
  const first = nextVocabulary(state, "mixed", NOW + 1000);
  assert.equal(first.id, "ms:yang");
  review(state, "word", first.id, "recognition", 4, NOW + 1000);
  review(state, "word", first.id, "recall", 4, NOW + 1000);
  assert.equal(nextVocabulary(state, "mixed", NOW + 1000).id, "ms:dan");
  const capped = structuredClone(state);
  capped.daily.count = capped.settings.newPerDay;
  // Settle dan in the clone; no more new introductions should occur today.
  review(capped, "word", "ms:dan", "recognition", 4, NOW + 1000);
  review(capped, "word", "ms:dan", "recall", 4, NOW + 1000);
  assert.equal(nextVocabulary(capped, "mixed", NOW + 1000), null);
  const recallOnly = freshState(NOW);
  assert.equal(nextVocabulary(recallOnly, "recall", NOW).direction, "recall");
});
test("familiarity requires delayed success; retention estimate falls with elapsed time", () => {
  const state = freshState(NOW),
    id = "ms:saya";
  let r = review(state, "word", id, "recognition", 4, NOW);
  assert.equal(isFamiliar(r), false);
  assert.ok(recallEstimate(r, NOW + 86400000) < recallEstimate(r, NOW));
  r = review(state, "word", id, "recognition", 3, NOW + 86400000 * 5);
  assert.equal(isFamiliar(r), false);
  r = review(state, "word", id, "recognition", 3, NOW + 86400000 * 15);
  assert.equal(r.delayed, 2);
  assert.equal(isFamiliar(r), true);
  assert.throws(
    () => review(state, "word", id, "recognition", 3, NOW),
    /clock/,
  );
});
test("compressed save round-trip preserves every card, schedule, setting, and log", async () => {
  const state = freshState(NOW);
  state.settings.newPerDay = 10;
  review(state, "word", "ms:saya", "recognition", 3, NOW);
  review(state, "grammar", "basic", "recall", 2, NOW);
  const code = await encodeSave(state);
  assert.ok(code.startsWith("RG2G."));
  assert.deepEqual(await decodeSave(code + "\n"), state);
  const parts = code.split(".");
  parts[1] = (parts[1][0] === "f" ? "e" : "f") + parts[1].slice(1);
  await assert.rejects(decodeSave(parts.join(".")), /integrity|damaged/);
  await assert.rejects(decodeSave("RG3G.invalid.invalid"), /not a Rangkai/);
});
test("reject invalid saves before restore, including unknown IDs and prototype pollution keys", async () => {
  const bad = freshState(NOW);
  bad.introduced.push("ms:imaginary-word");
  assert.throws(() => validateState(bad), /unknown/);
  const dangerous = freshState(NOW);
  dangerous.records = JSON.parse('{"__proto__":{}}');
  assert.throws(() => validateState(dangerous), /Unknown/);
  const impossible = freshState(NOW);
  review(impossible, "word", "ms:saya", "recognition", 3, NOW);
  impossible.records["word|ms:saya|recognition"].card.stability = -1;
  assert.throws(() => validateState(impossible), /Invalid spaced/);
  const large = structuredClone(freshState(NOW));
  large.history = Array(3001).fill({
    key: "word|ms:saya|recognition",
    rating: 3,
    at: NOW,
  });
  assert.throws(() => validateState(large), /history/);
});
test("migrate old sentence progress without manufacturing word recall", () => {
  const old = { stage: 3, confident: ["0-0", "1-1"], review: ["2-1"] };
  const state = migrateLegacy(old, NOW);
  assert.deepEqual(state.legacy, old);
  assert.ok(state.introduced.includes("ms:membaca"));
  assert.ok(state.unlocked.includes("forms"));
  assert.equal(state.reviews, 0);
  assert.deepEqual(state.records, {});
  assert.deepEqual(validateState(state), state);
  assert.throws(
    () => migrateLegacy({ stage: 3, confident: ["bad"], review: [] }),
    /Invalid earlier/,
  );
});

test("legacy unlocks survive revisiting an earlier chapter", () => {
  const old = {
    stage: 0,
    confident: Array.from({ length: 20 }, (_, i) => `${Math.floor(i / 5)}-${i % 5}`),
    review: [],
  };
  const state = migrateLegacy(old, NOW);
  assert.equal(state.introduced.length, 20);
  assert.deepEqual(state.unlocked, ["basic", "ongoing", "forms"]);
  assert.equal(state.reviews, 0);
  assert.deepEqual(state.records, {});
  assert.deepEqual(validateState(state), state);
});
