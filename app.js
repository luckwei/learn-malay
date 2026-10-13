import {
  STORAGE_KEY,
  DIRECTIONS,
  configureCatalogue,
  getCatalogue,
  getWord,
  wordId,
  cardKey,
  freshState,
  review,
  recallEstimate,
  isFamiliar,
  wordStatus,
  dueCount,
  comfortable,
  nextVocabulary,
  noteExposure,
  previewIntervals,
  validateState,
  migrateLegacy,
  encodeSave,
  decodeSave,
} from "./engine.js";
import {
  PATTERNS,
  SENTENCES,
  prepareLessons,
  candidatesFor,
} from "./lessons.js";

const $ = (s) => document.querySelector(s);
const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const content = $("#page-content"),
  dialog = $("#detail-dialog");
let metadata,
  state,
  vocabCard = null,
  lessonCard = null,
  revealed = false,
  guess = "",
  assembled = [],
  tiles = [],
  checked = false,
  compareChoice = null,
  target = "grammar",
  sentenceMode = "understand",
  lessonTurn = 0,
  prerequisites = [],
  dictionaryLimit = 30,
  search = "",
  role = "all",
  status = "all",
  importCandidate = null,
  saveCode = "",
  backupBusy = false,
  dialogFocus = null,
  storageIssue = "",
  manualPattern = false,
  lastPersistedBody = "",
  pendingContext = null;

function page() {
  return ["practice", "vocab", "blocks", "path", "progress"].includes(
    location.hash.slice(1),
  )
    ? location.hash.slice(1)
    : "practice";
}
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 4500);
}
function persist() {
  const body = JSON.stringify({ ...state, updatedAt: 0 });
  if (body === lastPersistedBody) return;
  state.updatedAt = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    lastPersistedBody = body;
    storageIssue = "";
  } catch {
    storageIssue =
      "Browser storage is unavailable or full. Download a save before leaving; your current progress is in memory.";
    toast(storageIssue);
  }
}
function resetStudy() {
  revealed = false;
  guess = "";
  assembled = [];
  checked = false;
  compareChoice = null;
  target = "grammar";
  lessonCard = null;
}
function currentPattern() {
  return PATTERNS.find((p) => p.id === state.activePattern);
}
function direction() {
  return sentenceMode === "assemble"
    ? "recall"
    : state.settings.direction === "mixed"
      ? lessonTurn % 2
        ? "recall"
        : "recognition"
      : state.settings.direction;
}
function directionLabel(d) {
  return d === "recognition" ? "Malay → English" : "English → Malay";
}
function duration(ms) {
  if (ms < 60000) return "now";
  if (ms < 3600000) return Math.max(1, Math.round(ms / 60000)) + "m";
  if (ms < 86400000) return Math.round(ms / 3600000) + "h";
  return Math.round(ms / 86400000) + "d";
}
function dueLabel(r) {
  return !r
    ? "Not practised"
    : r.card.due <= Date.now()
      ? "Due now"
      : "In " + duration(r.card.due - Date.now());
}
function record(kind, id, d) {
  return state.records[cardKey(kind, id, d)];
}
function familiarWords() {
  return state.introduced.filter((id) =>
    DIRECTIONS.every((d) => isFamiliar(record("word", id, d))),
  );
}
function openDialog(title, html, eyebrow = "A CLOSER LOOK") {
  if (!dialog.open) dialogFocus = document.activeElement;
  $("#dialog-eyebrow").textContent = eyebrow;
  $("#dialog-content").innerHTML = `<h2>${esc(title)}</h2>${html}`;
  if (!dialog.open) dialog.showModal();
}
function closeDialog() {
  dialog.close();
  if (dialogFocus?.isConnected) dialogFocus.focus();
}
function wordDetail(id) {
  const w = getWord(id);
  if (!w) return;
  openDialog(
    w.word,
    `<span class="word-chip ${esc(w.type)}">${esc(w.type)}</span><p><strong>${esc(w.meaning)}</strong></p><p>${esc(w.note)}</p>
    ${w.root ? `<div class="dialog-example"><strong>${esc(w.root)} → ${esc(w.word)}</strong><p>A related form has its own recall schedule.</p></div>` : ""}
    ${w.senses ? `<details><summary>Other dictionary senses</summary>${w.senses.map((s) => `<p><strong>${esc(s.meaning)}</strong><br>${esc(s.definition)}</p>`).join("")}</details>` : ""}
    <div class="record-grid">${DIRECTIONS.map((d) => {
      const r = record("word", id, d);
      return `<div><span>${directionLabel(d)}</span><strong>${r ? recallEstimate(r) + "%" : "—"}</strong><small>estimated retention · ${dueLabel(r)}</small><small>${r?.card.reps ?? 0} reviews · ${r?.failures ?? 0} Again ratings</small></div>`;
    }).join("")}</div>
    <p class="small-note">${state.exposures[id] ?? 0} sentence exposures. Seeing a word does not count as remembering it. “Familiar” requires successful reviews on separate days in both directions.</p>
    <p class="small-note">${w.rank ? "Source frequency rank #" + w.rank : "Lesson-specific phrase / form"} · ${w.source === "everyday" ? "Authored everyday note" : "Imported Malaysian Wordnet Bahasa senses"}</p>`,
    "YOUR BUILDING BLOCKS",
  );
}
function heading(label, title, description) {
  return `<div class="page-heading"><div><span class="eyebrow">${label}</span><h1>${title}</h1><p>${description}</p></div><div class="session-summary"><strong data-due-count>${dueCount(state)}</strong>reviews due</div></div>`;
}
function settingsBar() {
  return `<div class="study-toolbar"><span>At your own pace</span><label>Direction <select id="direction-select">${[
    ["mixed", "Both directions"],
    ["recognition", "Malay → English"],
    ["recall", "English → Malay"],
  ]
    .map(
      ([v, l]) =>
        `<option value="${v}" ${state.settings.direction === v ? "selected" : ""}>${l}</option>`,
    )
    .join("")}</select></label></div>`;
}
function ratings(kind, id, d) {
  const intervals = previewIntervals(state, kind, id, d);
  return `<div class="rating-section"><p class="rate-label">Rate just <strong>${kind === "grammar" ? "this sentence pattern" : esc(getWord(id).word)}</strong> · ${directionLabel(d)}. How well did you remember?</p><div class="rating-buttons">${["Again", "Hard", "Good", "Easy"].map((name, i) => `<button class="rating-button rating-${i + 1}" data-rating="${i + 1}" ${!intervals ? "disabled" : ""}><strong>${name}</strong><span>${intervals ? duration(intervals[i]) : "Check clock"}</span></button>`).join("")}</div><p class="small-note">${record(kind, id, d)?.card.due > Date.now() ? "This is an early review. Your rating will update its schedule." : "FSRS schedules the next review from your rating."} A guess is not automatically graded.</p></div>`;
}
function render() {
  document.querySelectorAll("[data-page]").forEach((a) => {
    a.classList.toggle("active", a.dataset.page === page());
    if (a.dataset.page === page()) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  content.innerHTML =
    (storageIssue
      ? `<div class="storage-warning" role="alert">${esc(storageIssue)} <a href="#progress">Back up progress</a></div>`
      : "") +
    {
      practice: renderPractice,
      vocab: renderVocab,
      blocks: renderDictionary,
      path: renderPath,
      progress: renderProgress,
    }[page()]();
  bindPage();
}
function rail() {
  const learning = state.introduced.filter(
      (id) => !comfortable(state, id),
    ).length,
    recent = state.introduced.slice(-12).map(getWord).filter(Boolean);
  return `<aside class="right-rail"><section class="rail-card"><div class="rail-top"><h2>Your active pool</h2><span class="tiny-pill">${state.introduced.length} words</span></div><p class="rail-description">${familiarWords().length} familiar · ${learning} still getting comfortable</p><div class="word-chips">${recent.map((w) => `<button class="word-chip ${esc(w.type)}" data-word="${esc(w.id)}">${esc(w.word)}</button>`).join("")}</div><a href="#blocks" class="rail-link">Explore 1,000 ranked entries ${icon("arrow")}</a></section><section class="rail-card growth-card"><span class="eyebrow">A LITTLE, THEN OFTEN</span><h2>Remember. Reconnect. Grow.</h2><p>Due reviews come first. New words follow frequency order, with up to ${state.settings.newPerDay} additions per day.</p><div class="growth-next">${icon("repeat")}<span>${dueCount(state, "word")} vocabulary reviews due</span></div><a href="#vocab" class="rail-link">Practise vocabulary ${icon("arrow")}</a></section><p class="rail-footnote">Recognition and recall have separate schedules.<br>Progress stays on this device. <a href="#progress">Keep a backup.</a></p></aside>`;
}
function chooseSentence() {
  if (lessonCard) return lessonCard;
  if (!manualPattern) {
    const due = state.unlocked
      .map((id) => ({ id, r: record("grammar", id, direction()) }))
      .filter(
        (x) =>
          x.r &&
          x.r.card.due <= Date.now() &&
          candidatesFor(state, x.id).some((s) => s.unknown.length === 0),
      )
      .sort((a, b) => a.r.card.due - b.r.card.due)[0];
    if (due && due.id !== state.activePattern) {
      state.activePattern = due.id;
      persist();
    }
  }
  const choices = candidatesFor(state, state.activePattern),
    eligible = choices.filter((c) => c.unknown.length === 0);
  const pool = eligible.length
    ? eligible
    : choices.filter((c) => c.unknown.length === choices[0].unknown.length);
  lessonCard = pool[lessonTurn % pool.length];
  prepareTiles();
  return lessonCard;
}
function prepareTiles() {
  tiles = lessonCard.ms
    .replace(/[.?]$/, "")
    .split(" ")
    .map((word, id) => ({ word, id }));
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
}
function contextSentenceFor(w) {
  return SENTENCES.find(
    (s) =>
      s.words.includes(w.word) &&
      state.unlocked.includes(s.pattern) &&
      s.words.every((word) => state.introduced.includes(wordId(word))),
  );
}
function focusControl(s) {
  return `<label class="focus-label" for="focus-select">Today’s focus <select id="focus-select" ${revealed ? "disabled" : ""}><option value="grammar" ${target === "grammar" ? "selected" : ""}>${esc(currentPattern().title)} · grammar</option>${s.words.map((w) => `<option value="${esc(wordId(w))}" ${target === wordId(w) ? "selected" : ""}>${esc(w)} · vocabulary</option>`).join("")}</select></label>`;
}
function renderPractice() {
  const s = chooseSentence(),
    p = currentPattern();
  return `${heading("CONNECTED PRACTICE", "Familiar pieces. <em>A bigger picture.</em>", "Read, build, and notice one new connection at a time.")}${settingsBar()}<div class="workspace"><div class="main-column"><div class="mode-tabs" role="tablist" aria-label="Practice mode">${[
    ["understand", "Understand"],
    ["assemble", "Build a sentence"],
    ["compare", "Spot the pattern"],
  ]
    .map(
      ([mode, label], i) =>
        `<button role="tab" aria-selected="${sentenceMode === mode}" aria-controls="practice-panel" id="tab-${mode}" tabindex="${sentenceMode === mode ? 0 : -1}" class="mode-tab ${sentenceMode === mode ? "active" : ""}" data-mode="${mode}"><span class="mode-number">0${i + 1}</span>${label}</button>`,
    )
    .join(
      "",
    )}</div><section class="practice-card" id="practice-panel" role="tabpanel" aria-labelledby="tab-${sentenceMode}"><div class="card-top"><span class="pattern-label">${icon("book")}${esc(p.title)}</span><span class="card-count">${directionLabel(direction())}</span></div>${s.unknown.length ? renderPrerequisites(s) : sentenceMode === "compare" ? renderCompare() : sentenceMode === "assemble" ? renderAssembly(s) : renderUnderstand(s)}<div class="card-bottom">${icon("repeat")}Only the selected focus changes its review score.</div></section><div class="pattern-callout"><span class="callout-icon">${icon("path")}</span><div><h3>${esc(p.tag)}</h3><p>${esc(p.note)}</p><a class="text-button" href="#path">Explore all nine patterns ${icon("arrow")}</a></div></div></div>${rail()}</div>`;
}
function renderPrerequisites(s) {
  return `<div class="sentence-zone"><span class="micro-label">MEET THE PIECES FIRST</span><h2 class="assemble-target">${s.unknown.length === 1 ? "One new building block." : "A few pieces to prepare."}</h2><p class="sentence-hint">This pattern needs ${s.unknown.length} word${s.unknown.length === 1 ? "" : "s"} outside your current pool.</p><div class="tile-bank">${s.unknown.map((w) => `<button class="word-chip ${esc(getWord(wordId(w))?.type)}" data-word="${esc(wordId(w))}">${esc(w)}</button>`).join("")}</div></div><div class="guess-zone"><p class="small-note">Prepare the words before adding the grammar pattern. Preparation words are prioritised by frequency; due reviews still come first.</p><div class="card-actions"><button class="primary-button" id="prepare-words">Prepare with vocabulary ${icon("arrow")}</button><button class="secondary-button" id="preview-sentence">Preview the chunks</button></div></div>`;
}
function renderUnderstand(s) {
  const d = direction();
  return `<div class="sentence-zone"><div class="micro-label">${d === "recognition" ? "TAKE A MOMENT. WHAT DOES THIS MEAN?" : "HOW WOULD YOU SAY THIS IN MALAY?"}</div><div class="sentence ${d === "recall" ? "english-prompt" : ""}" ${d === "recognition" ? 'lang="ms"' : ""}>${d === "recognition" ? s.chunks.map((c, i) => `<button class="word ${esc(c.role)}" data-chunk="${esc(c.ms)}">${esc(c.ms)}${i === s.chunks.length - 1 ? (s.ms.endsWith("?") ? "?" : ".") : ""}</button>`).join(" ") : esc(s.en)}</div><p class="sentence-hint">${d === "recognition" ? "Tap a chunk when you are curious." : "Think of the familiar chunks before you reveal."}</p></div><div class="guess-zone">${focusControl(s)}${!revealed ? `<label for="guess" class="guess-label">Your best guess<span class="optional">optional · self-check</span></label><textarea id="guess" maxlength="500" placeholder="${d === "recognition" ? "I think this means…" : "Saya…"}">${esc(guess)}</textarea><div class="card-actions"><button class="primary-button" id="reveal-sentence">${icon("spark")}Reveal & explain</button><button class="secondary-button" id="next-sentence">Another combination ${icon("arrow")}</button></div>` : ""}</div>${revealed ? renderExplanation(s) : ""}`;
}
function renderExplanation(s) {
  const d = direction(),
    id = target === "grammar" ? s.pattern : target;
  return `<div class="reveal"><span class="micro-label">${d === "recognition" ? "THE MEANING" : "THE MALAY SENTENCE"}</span><p class="translation" tabindex="-1" ${d === "recall" ? 'lang="ms"' : ""}>${esc(d === "recognition" ? s.en : s.ms)}</p>${guess.trim() ? `<p class="small-note">Your guess: “${esc(guess)}”</p>` : ""}<div class="explanation-title"><span>Let’s take it apart</span><span class="curated-tag">AUTHORED PATTERN</span></div><div class="chunk-grid">${s.chunks.map((c) => `<button class="chunk-card" data-chunk="${esc(c.ms)}"><strong lang="ms">${esc(c.ms)}</strong><small>${esc(c.en)}</small><p>${esc(c.note)}</p></button>`).join("")}</div><div class="grammar-note"><strong>${esc(currentPattern().tag)}</strong><br>${esc(currentPattern().note)}</div>${ratings(target === "grammar" ? "grammar" : "word", id, d)}</div>`;
}
function renderAssembly(s) {
  return `<div class="sentence-zone"><div class="micro-label">PUT THE PIECES IN ORDER · ENGLISH → MALAY</div><h2 class="assemble-target">${esc(s.en)}</h2><p class="sentence-hint">Build this example from the tiles. Other translations may also be valid.</p><div class="answer-slots" aria-label="Your sentence">${assembled.length ? assembled.map((id) => `<button class="sentence-tile" data-remove="${id}">${esc(tiles.find((t) => t.id === id).word)}</button>`).join(" ") : '<span class="empty-slot">Your sentence goes here</span>'}</div><div class="tile-bank">${tiles.map((t) => `<button class="sentence-tile" data-tile="${t.id}" ${assembled.includes(t.id) ? "disabled" : ""}>${esc(t.word)}</button>`).join("")}</div></div><div class="guess-zone">${focusControl(s)}<div class="card-actions"><button class="secondary-button" id="clear-tiles">Start over</button><button class="primary-button" id="check-assembly" ${assembled.length !== tiles.length ? "disabled" : ""}>Check the order ${icon("check")}</button></div><p class="feedback" role="status">${checked ? "Not the order in this example yet. Try arranging the chunks." : ""}</p></div>${revealed ? renderExplanation(s) : ""}`;
}
function renderCompare() {
  const c = currentPattern().compare;
  return `<div class="comparison-grid"><div class="comparison-card"><span class="micro-label">FIRST CONNECTION</span><h3 lang="ms">${esc(c.a)}</h3><p>${esc(c.meaningA)}</p></div><div class="comparison-card"><span class="micro-label">ONE DIFFERENCE</span><h3 lang="ms">${esc(c.b)}</h3><p>${esc(c.meaningB)}</p></div></div><div class="guess-zone" style="margin-top:24px"><p class="compare-question">${esc(c.question)}</p><div class="choice-row">${c.answers.map((answer, i) => `<button class="choice-button ${compareChoice === i ? (i === c.correct ? "correct" : "wrong") : ""}" data-choice="${i}">${esc(answer)}</button>`).join("")}</div>${compareChoice !== null ? `<div class="grammar-note" role="status"><strong>${compareChoice === c.correct ? "You spotted it." : "A connection to notice."}</strong><br>${esc(c.note)}</div><p class="small-note">This guided comparison explains the pattern. It does not count as a recall review.</p><button class="primary-button" id="compare-practise">Practise without the hints ${icon("arrow")}</button>` : ""}</div>`;
}
function exampleFor(w) {
  if (w.example)
    return `<div class="dialog-example"><p>${esc(w.example)}</p></div>`;
  const s = SENTENCES.find((s) => s.words.includes(w.word));
  return s
    ? `<div class="dialog-example"><strong lang="ms">${esc(s.ms)}</strong><p>${esc(s.en)}</p><small>Example preview · other words may be new</small></div>`
    : "";
}
function renderVocab() {
  if (!vocabCard) {
    vocabCard = nextVocabulary(
      state,
      state.settings.direction,
      Date.now(),
      prerequisites,
    );
    persist();
  }
  const w = vocabCard ? getWord(vocabCard.id) : null,
    d = vocabCard?.direction;
  return `${heading("VOCABULARY / SPACED REPETITION", "A word today. <em>A memory tomorrow.</em>", "Recognise it, recall it, then reconnect it in a sentence.")}${settingsBar()}<div class="workspace"><div>${prerequisites.length ? `<div class="path-intro">${icon("path")}<p>Preparing words for <strong>${esc(currentPattern().title)}</strong>. Due reviews take priority. <a class="text-button" href="#practice">Return to sentences</a><button class="text-button" id="stop-prep">Use normal frequency order</button></p></div>` : ""}<section class="practice-card vocab-study">${w ? `<div class="card-top"><span class="pattern-label">${icon(vocabCard.reason === "due" ? "repeat" : "book")}${vocabCard.reason === "due" ? "Due for another look" : vocabCard.reason === "prerequisite" ? "A sentence preparation word" : "A new connection"}</span><span class="card-count">${directionLabel(d)}</span></div><div class="sentence-zone"><div class="micro-label">${d === "recognition" ? "WHAT DOES THIS WORD MEAN?" : "RECALL THE MALAY WORD"}</div><h2 class="vocab-prompt" ${d === "recognition" ? 'lang="ms"' : ""}>${esc(d === "recognition" ? w.word : w.meaning)}</h2><p class="sentence-hint">${w.source === "wordnet" ? "An imported dictionary sense; other senses may also apply." : "Everyday Malaysian Malay, with usage notes."}</p><div class="vocab-meta"><span>${esc(w.type)}</span><span>${w.rank ? "frequency #" + w.rank : "lesson-specific form"}</span></div></div><div class="guess-zone">${!revealed ? '<button class="primary-button wide" id="reveal-vocab">Reveal the answer</button>' : `<div class="vocab-back"><span class="micro-label">${d === "recognition" ? "THE MEANING" : "THE WORD"}</span><h3 ${d === "recall" ? 'lang="ms"' : ""}>${esc(d === "recognition" ? w.meaning : w.word)}</h3><p>${esc(w.note)}</p>${w.root ? `<button class="word-chip verb" data-word="${esc(wordId(w.root))}">Root: ${esc(w.root)}</button>` : ""}${exampleFor(w)}${contextSentenceFor(w) ? '<button class="secondary-button" id="word-in-context">Use this word in a sentence ↗</button>' : ""}${w.senses ? `<details><summary>Explore the dictionary senses</summary>${w.senses.map((s) => `<p><strong>${esc(s.meaning)}</strong><br>${esc(s.definition)}</p>`).join("")}</details>` : ""}</div>${ratings("word", w.id, d)}`}</div><div class="card-bottom">${icon("repeat")}Both practice modes use the same per-word schedule.</div>` : renderQueueComplete()}</section><div class="pattern-callout"><span class="callout-icon">${icon("spark")}</span><div><h3>Bring a word into a sentence.</h3><p>Knowing a meaning and knowing how to use it are different connections.</p><a class="text-button" href="#practice">Practise the pattern ${icon("arrow")}</a></div></div></div>${rail()}</div>`;
}
function renderQueueComplete() {
  const next = Object.entries(state.records)
    .filter(([key]) => key.startsWith("word|"))
    .map(([, r]) => r.card.due)
    .filter((d) => d > Date.now())
    .sort((a, b) => a - b)[0];
  return `<div class="sentence-zone"><span class="micro-label">LET THE MEMORY SETTLE</span><h2 class="assemble-target">A good place for a pause.</h2><p class="sentence-hint">${next ? "Your next vocabulary review is in " + duration(next - Date.now()) + "." : "No review is due right now."}</p><p class="small-note">${state.daily.count >= state.settings.newPerDay ? "You have reached today’s new-word limit." : "New words follow once the current pool is comfortable in your chosen directions."}</p></div><div class="guess-zone"><button class="primary-button wide" id="check-due">Check for due reviews ${icon("repeat")}</button><a class="secondary-button wide" href="#practice" style="margin-top:10px">Explore sentence patterns</a></div>`;
}
function renderDictionary() {
  const matches = getCatalogue().filter(
    (w) =>
      (!search ||
        `${w.word} ${w.meaning}`
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (role === "all" || w.type === role) &&
      (status === "all" || wordStatus(state, w.id) === status),
  );
  const types = [...new Set(getCatalogue().map((w) => w.type))].sort();
  return `${heading("YOUR BUILDING BLOCKS", "Common first. <em>Connected often.</em>", "1,000 frequency-ranked entries, plus 11 lesson forms and phrases.")}<div class="dictionary-tools"><label class="search-label">Find a word<input id="word-search" type="search" placeholder="Search Malay or English…" value="${esc(search)}"></label><label>Role<select id="role-filter"><option value="all">All roles</option>${types.map((t) => `<option value="${esc(t)}" ${role === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label><label>Progress<select id="status-filter">${[
    ["all", "All progress"],
    ["new", "New in my pool"],
    ["learning", "Learning"],
    ["due", "Due"],
    ["familiar", "Familiar"],
    ["locked", "Not introduced"],
  ]
    .map(
      ([v, l]) =>
        `<option value="${v}" ${status === v ? "selected" : ""}>${l}</option>`,
    )
    .join(
      "",
    )}</select></label></div><p class="small-note">${matches.length} matching entries · ordered by source frequency. ${metadata.curated} catalogue entries have authored everyday notes; other entries show imported dictionary senses. <button class="text-button" id="sources-button">About the sources</button></p><div class="catalogue-grid">${matches
    .slice(0, dictionaryLimit)
    .map(
      (w) =>
        `<button class="catalogue-card ${esc(w.type)}" data-word="${esc(w.id)}"><div class="catalogue-top"><span>${w.rank ? "#" + w.rank : "lesson form"}</span><span class="status-label status-${wordStatus(state, w.id)}">${wordStatus(state, w.id) === "locked" ? "not introduced" : wordStatus(state, w.id)}</span></div><strong lang="ms">${esc(w.word)}</strong><span class="word-meaning">${esc(w.meaning)}</span><small>${w.source === "everyday" ? "everyday note" : "dictionary import"} · ${esc(w.type)}</small></button>`,
    )
    .join(
      "",
    )}</div>${matches.length > dictionaryLimit ? '<button class="secondary-button" id="more-words" style="margin-top:20px">Show 30 more entries</button>' : ""}${matches.length === 0 ? "<p>No words match these filters.</p>" : ""}`;
}
function renderPath() {
  return `${heading("YOUR LEARNING PATH", "Grow a little. <em>Connect a lot.</em>", "Short sentences become longer by adding familiar chunks.")}<div class="path-intro">${icon("path")}<p>One successful grammar self-review in <strong>each direction</strong> opens the next pattern for learning. Opening a pattern does not mark it familiar; spaced reviews build retention over time.</p></div><div class="path-list">${PATTERNS.map(
    (p, i) => {
      const available = state.unlocked.includes(p.id);
      return `<section class="path-card ${state.activePattern === p.id ? "current" : ""} ${!available ? "locked" : ""}"><span class="stage-circle">${available ? String(i + 1).padStart(2, "0") : icon("lock")}</span><div><span class="eyebrow">${esc(p.tag)}</span><h2>${esc(p.title)}</h2><p>${esc(p.description)}</p><p class="path-sample" lang="ms">${esc(p.sample)}</p><div class="path-meta">${DIRECTIONS.map((d) => `${directionLabel(d)}: ${dueLabel(record("grammar", p.id, d))}`).join(" · ")}</div></div><button class="${available ? "primary-button" : "secondary-button"}" data-pattern="${p.id}">${available ? "Practise" : "Preview"} ${icon("arrow")}</button></section>`;
    },
  ).join("")}</div>`;
}
function renderProgress() {
  return `${heading("YOUR PROGRESS / YOUR SAVE", "Keep your connections. <em>Carry them with you.</em>", "Automatic browser saving, plus a portable backup you control.")}<div class="stats-grid"><div><strong>${state.introduced.length}</strong><span>words introduced</span></div><div><strong>${familiarWords().length}</strong><span>familiar in both directions</span></div><div><strong>${state.reviews}</strong><span>self-rated reviews</span></div><div><strong>${dueCount(state)}</strong><span>reviews due now</span></div></div>${state.legacy ? `<div class="path-intro">${icon("check")}<p>Your earlier prototype progress was preserved: <strong>${state.legacy.confident.length} familiar sentence ratings</strong>. Per-word schedules start from actual reviews; earlier ratings were not turned into invented word mastery.</p></div>` : ""}<section class="full-card"><div class="section-heading"><h2>Your learning rhythm</h2><span class="tiny-pill">FSRS · 90% target retention</span></div><p class="small-note">New words follow frequency order when the active pool is comfortable. Due reviews come first. Choosing a sentence pattern can prioritise its missing words.</p><label class="settings-label">New words per day<select id="new-limit">${Array.from(
    { length: 20 },
    (_, i) => i + 1,
  )
    .map(
      (n) =>
        `<option value="${n}" ${state.settings.newPerDay === n ? "selected" : ""}>${n}</option>`,
    )
    .join(
      "",
    )}</select></label><p class="small-note">Familiar means successful reviews on separate days in both directions. Retention estimates change with time and are not a mastery guarantee.</p></section><section class="full-card backup-card"><div class="section-heading"><h2>A portable save</h2><span class="tiny-pill">compressed · text</span></div><p class="small-note">Includes schedules, word pool, grammar progress, settings, and recent history. It contains no dictionary. Download it or copy the code to another device.</p><div class="backup-actions"><button class="primary-button" id="generate-save">Create current save</button><button class="secondary-button" id="download-save">Download progress.txt</button><button class="secondary-button" id="copy-save">Copy current save</button></div><label class="save-label" for="save-output">Current save code</label><textarea class="save-code" id="save-output" readonly placeholder="Create a save to display its code here.">${esc(saveCode)}</textarea><p class="small-note" id="save-size">${saveCode ? saveCode.length.toLocaleString() + " text characters · gzip + base64 · SHA-256 integrity check" : "Save codes are versioned and checked before restoring."}</p></section><section class="full-card"><h2>Restore a save</h2><p class="small-note">Paste a code or select your .txt file. Preview before replacing this device’s progress. Importing does not automatically merge two devices.</p><label class="save-label" for="import-code">Save code to restore</label><textarea class="save-code" id="import-code" placeholder="RG2G.…" spellcheck="false" maxlength="6291456"></textarea><div class="backup-actions"><button class="primary-button" id="preview-import">Check & preview save</button><label class="secondary-button file-label">Choose save file<input id="import-file" type="file" accept=".txt,text/plain"></label></div><p class="feedback" id="import-status" role="status"></p><div id="import-preview"></div></section><p class="small-note">Progress is stored on this browser and site, not in cookies or an account. Clearing browser data can erase it; a save file restores it. Keep a copy outside the browser.</p><div class="reset-row"><button class="text-button" id="recover-backup">Recover the save from before your last restore</button><button class="text-button" id="reset-progress">Reset progress</button></div>`;
}
function nextSentence() {
  manualPattern = false;
  lessonTurn++;
  resetStudy();
  render();
}
function ratingClick(rating) {
  const oldUnlocked = state.unlocked.length;
  try {
    if (page() === "vocab") {
      if (!vocabCard || !revealed) return;
      review(state, "word", vocabCard.id, vocabCard.direction, rating);
      vocabCard = null;
      revealed = false;
      saveCode = "";
      persist();
      render();
    } else {
      if (!revealed || !lessonCard || sentenceMode === "compare") return;
      const s = lessonCard;
      review(
        state,
        target === "grammar" ? "grammar" : "word",
        target === "grammar" ? s.pattern : target,
        direction(),
        rating,
      );
      noteExposure(state, s.words);
      saveCode = "";
      if (state.unlocked.length > oldUnlocked) {
        state.activePattern = state.unlocked.at(-1);
        toast(
          "A new pattern is open. Prepare its words, then connect the pieces.",
        );
      }
      persist();
      nextSentence();
    }
  } catch (e) {
    toast(e.message);
  }
}
function bindPage() {
  const on = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.onclick = fn;
  };
  content
    .querySelectorAll("[data-word]")
    .forEach((b) => (b.onclick = () => wordDetail(b.dataset.word)));
  content
    .querySelectorAll("[data-rating]")
    .forEach((b) => (b.onclick = () => ratingClick(+b.dataset.rating)));
  content.querySelectorAll("[data-chunk]").forEach(
    (b) =>
      (b.onclick = () => {
        const c = lessonCard.chunks.find((c) => c.ms === b.dataset.chunk);
        openDialog(
          c.ms,
          `<p><strong>${esc(c.en)}</strong></p><p>${esc(c.note)}</p><div class="word-chips">${c.ms
            .toLowerCase()
            .split(" ")
            .map(
              (w) =>
                `<button class="word-chip ${esc(getWord(wordId(w))?.type)}" data-dialog-word="${esc(wordId(w))}">${esc(w)}</button>`,
            )
            .join("")}</div>`,
          "SENTENCE CHUNK",
        );
        dialog
          .querySelectorAll("[data-dialog-word]")
          .forEach(
            (btn) => (btn.onclick = () => wordDetail(btn.dataset.dialogWord)),
          );
      }),
  );
  const select = $("#direction-select");
  if (select)
    select.onchange = () => {
      state.settings.direction = select.value;
      saveCode = "";
      persist();
      vocabCard = null;
      resetStudy();
      render();
    };
  const focus = $("#focus-select");
  if (focus)
    focus.onchange = () => {
      target = focus.value;
      render();
    };
  const input = $("#guess");
  if (input) input.oninput = () => (guess = input.value);
  on("reveal-sentence", () => {
    revealed = true;
    render();
    $(".translation")?.focus();
  });
  on("next-sentence", nextSentence);
  on("reveal-vocab", () => {
    revealed = true;
    render();
  });
  on("word-in-context", () => {
    const s = contextSentenceFor(getWord(vocabCard.id));
    if (!s) return;
    pendingContext = { s, id: vocabCard.id, d: vocabCard.direction };
    state.activePattern = s.pattern;
    persist();
    manualPattern = true;
    location.hash = "practice";
  });
  on("check-due", () => {
    vocabCard = null;
    render();
  });
  on("stop-prep", () => {
    prerequisites = [];
    vocabCard = null;
    revealed = false;
    render();
  });
  on("prepare-words", () => {
    prerequisites = lessonCard.unknown.map(wordId);
    vocabCard = null;
    resetStudy();
    location.hash = "vocab";
  });
  on("preview-sentence", () => previewPattern(currentPattern().id));
  content.querySelectorAll("[data-mode]").forEach((b, index, buttons) => {
    b.onclick = () => {
      const s = lessonCard,
        focus = target;
      sentenceMode = b.dataset.mode;
      resetStudy();
      lessonCard = s;
      target = focus;
      prepareTiles();
      render();
      $(`[data-mode="${sentenceMode}"]`).focus();
    };
    b.onkeydown = (e) => {
      if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      buttons[
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? 2
            : (index + (e.key === "ArrowRight" ? 1 : 2)) % 3
      ].click();
    };
  });
  content.querySelectorAll("[data-tile]").forEach(
    (b) =>
      (b.onclick = () => {
        assembled.push(+b.dataset.tile);
        checked = false;
        revealed = false;
        render();
        ($("[data-tile]:not(:disabled)") ?? $("#check-assembly")).focus();
      }),
  );
  content.querySelectorAll("[data-remove]").forEach(
    (b) =>
      (b.onclick = () => {
        assembled = assembled.filter((i) => i !== +b.dataset.remove);
        checked = false;
        revealed = false;
        render();
        $(`[data-tile="${b.dataset.remove}"]`).focus();
      }),
  );
  on("clear-tiles", () => {
    assembled = [];
    checked = false;
    revealed = false;
    render();
    $("[data-tile]").focus();
  });
  on("check-assembly", () => {
    revealed =
      assembled.map((id) => tiles.find((t) => t.id === id).word).join(" ") ===
      lessonCard.ms.replace(/[.?]$/, "");
    checked = !revealed;
    render();
    if (revealed) toast("The pieces fit. Now self-rate the selected focus.");
  });
  content.querySelectorAll("[data-choice]").forEach(
    (b) =>
      (b.onclick = () => {
        compareChoice = +b.dataset.choice;
        render();
      }),
  );
  on("compare-practise", () => {
    sentenceMode = "understand";
    resetStudy();
    render();
  });
  content.querySelectorAll("[data-pattern]").forEach(
    (b) =>
      (b.onclick = () => {
        const id = b.dataset.pattern;
        if (!state.unlocked.includes(id)) {
          previewPattern(id);
          return;
        }
        manualPattern = true;
        state.activePattern = id;
        persist();
        resetStudy();
        sentenceMode = "understand";
        location.hash = "practice";
      }),
  );
  const wordSearch = $("#word-search");
  if (wordSearch)
    wordSearch.oninput = () => {
      const caret = wordSearch.selectionStart;
      search = wordSearch.value;
      dictionaryLimit = 30;
      render();
      const input = $("#word-search");
      input.focus();
      try {
        input.setSelectionRange(caret, caret);
      } catch {}
    };
  const roleFilter = $("#role-filter");
  if (roleFilter)
    roleFilter.onchange = () => {
      role = roleFilter.value;
      dictionaryLimit = 30;
      render();
    };
  const statusFilter = $("#status-filter");
  if (statusFilter)
    statusFilter.onchange = () => {
      status = statusFilter.value;
      dictionaryLimit = 30;
      render();
    };
  on("more-words", () => {
    dictionaryLimit += 30;
    render();
  });
  on("sources-button", sourcesDialog);
  const limit = $("#new-limit");
  if (limit)
    limit.onchange = () => {
      state.settings.newPerDay = +limit.value;
      saveCode = "";
      persist();
      toast("Your new-word limit is saved.");
    };
  on("generate-save", generateCurrentSave);
  on("download-save", downloadSave);
  on("copy-save", copySave);
  on("preview-import", () => checkImport($("#import-code").value));
  const file = $("#import-file");
  if (file)
    file.onchange = async () => {
      const f = file.files[0];
      if (!f) return;
      if (f.size > 6 * 1024 * 1024) {
        $("#import-status").textContent =
          "That file is too large. Nothing was changed.";
        return;
      }
      const text = await f.text();
      $("#import-code").value = text;
      await checkImport(text);
    };
  on("recover-backup", async () => {
    try {
      const code = localStorage.getItem("rangkai-pre-restore");
      if (!code) {
        toast("There is no earlier restore backup on this device.");
        return;
      }
      await checkImport(code);
    } catch {
      toast("The earlier restore backup could not be read.");
    }
  });
  on("reset-progress", () => {
    openDialog(
      "Start with a clean slate?",
      `<p>This resets your current schedules. A recoverable pre-reset save will be kept locally. Download a portable save first for a copy outside this browser.</p><button class="primary-button" id="confirm-reset">Reset this device’s progress</button>`,
      "YOUR PROGRESS",
    );
    $("#confirm-reset").onclick = async () => {
      try {
        localStorage.setItem("rangkai-pre-restore", await encodeSave(state));
      } catch {
        toast(
          "Could not keep a recovery copy. Download a save before resetting.",
        );
        return;
      }
      state = freshState();
      saveCode = "";
      persist();
      vocabCard = null;
      prerequisites = [];
      resetStudy();
      closeDialog();
      render();
      toast("A fresh beginning. Your earlier save is available in recovery.");
    };
  });
}
function previewPattern(id) {
  const p = PATTERNS.find((p) => p.id === id),
    s = SENTENCES.find((s) => s.pattern === id);
  openDialog(
    p.title,
    `<p lang="ms"><strong>${esc(s.ms)}</strong></p><p>${esc(s.en)}</p><div class="chunk-grid">${s.chunks.map((c) => `<div class="chunk-card"><strong>${esc(c.ms)}</strong><small>${esc(c.en)}</small><p>${esc(c.note)}</p></div>`).join("")}</div><p>${esc(p.note)}</p><p class="small-note">Preview only. No review scores change. Learn earlier patterns and prepare missing words to practise this one.</p>`,
    "A LOOK AHEAD",
  );
}
function sourcesDialog() {
  openDialog(
    "Where the words come from",
    `<p>1,000 supported lexical entries selected in frequency order, plus 11 lesson phrases and forms. This is not the unfiltered top 1,000 corpus tokens.</p><ul><li><a href="https://github.com/rspeer/wordfreq" target="_blank" rel="noopener">wordfreq 3.1.1</a>: Malay frequency ranks from a mixed-source snapshot through about 2021. Ranks have gaps after filtering.</li><li><a href="https://github.com/omwn/omw-data/tree/master/wns/msa" target="_blank" rel="noopener">Malaysian Wordnet Bahasa (zsm)</a>: word-to-sense mappings, MIT licence.</li><li><a href="https://wordnet.princeton.edu/" target="_blank" rel="noopener">Princeton WordNet 3.0</a>: English labels and definitions.</li></ul><p>${metadata.curated} catalogue entries have authored everyday notes. Imported senses can be broad or uncommon; the first listed sense is not a verified primary meaning. Educator review is needed for the imported curriculum.</p><p>Frequency-derived data is distributed under CC BY-SA 4.0 with upstream attribution. See <a href="./ATTRIBUTION.md" target="_blank" rel="noopener">attribution</a> and <a href="./licenses/wordfreq.txt" target="_blank" rel="noopener">licences</a>.</p><p>The locally bundled scheduler is <a href="https://github.com/open-spaced-repetition/ts-fsrs" target="_blank" rel="noopener">ts-fsrs 5.4.2</a>, MIT licensed.</p>`,
    "DATA & ATTRIBUTION",
  );
}
async function generateCurrentSave() {
  if (backupBusy) return;
  backupBusy = true;
  const button = $("#generate-save");
  if (button) {
    button.disabled = true;
    button.textContent = "Preparing…";
  }
  try {
    saveCode = await encodeSave(state);
    if (page() === "progress") {
      $("#save-output").value = saveCode;
      $("#save-size").textContent =
        saveCode.length.toLocaleString() +
        " text characters · compressed and checked";
    }
    return saveCode;
  } catch (e) {
    toast(e.message);
    return null;
  } finally {
    backupBusy = false;
    if (button?.isConnected) {
      button.disabled = false;
      button.textContent = "Create current save";
    }
  }
}
async function downloadSave() {
  const code = await generateCurrentSave();
  if (!code) return;
  const url = URL.createObjectURL(
      new Blob([code + "\n"], { type: "text/plain" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = `rangkai-progress-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast("Progress downloaded. Keep it somewhere safe.");
}
async function copySave() {
  const code = await generateCurrentSave();
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    toast("Current save copied.");
  } catch {
    const el = $("#save-output");
    el.focus();
    el.select();
    toast("Select and copy the save code above.");
  }
}
async function checkImport(text) {
  importCandidate = null;
  $("#import-preview").innerHTML = "";
  $("#import-status").textContent = "Checking the save…";
  try {
    const parsed = await decodeSave(text);
    importCandidate = parsed;
    $("#import-status").textContent =
      "Save is valid. Your current progress has not changed.";
    $("#import-preview").innerHTML =
      `<div class="import-summary"><h3>Ready to restore</h3><p>Saved ${esc(new Date(parsed.updatedAt).toLocaleString())}<br>${parsed.introduced.length} words introduced · ${parsed.reviews} reviews · ${parsed.unlocked.length} open patterns</p><p>Current device: ${state.introduced.length} words · ${state.reviews} reviews. Restoring replaces this snapshot; it does not merge it.</p><button class="primary-button" id="confirm-import">Restore this save</button><button class="secondary-button" id="cancel-import">Cancel</button></div>`;
    $("#confirm-import").onclick = async () => {
      if (!importCandidate) return;
      try {
        localStorage.setItem("rangkai-pre-restore", await encodeSave(state));
      } catch {
        $("#import-status").textContent =
          "Could not preserve current progress. Download it before restoring; nothing was changed.";
        return;
      }
      state = importCandidate;
      importCandidate = null;
      saveCode = "";
      persist();
      vocabCard = null;
      prerequisites = [];
      resetStudy();
      render();
      toast("Progress restored, including every review schedule.");
    };
    $("#cancel-import").onclick = () => {
      importCandidate = null;
      $("#import-preview").innerHTML = "";
      $("#import-status").textContent =
        "Restore cancelled. Your progress is unchanged.";
    };
  } catch (e) {
    $("#import-status").textContent = e.message + " Nothing was changed.";
  }
}
function howItWorks() {
  openDialog(
    "A little, then connected.",
    `<p>Begin with a small word pool. Review vocabulary in both directions, then practise it in sentences. Each sentence has one selected focus; only that word or grammar pattern gets a rating.</p><ol><li>Reveal the answer and rate Again, Hard, Good, or Easy.</li><li>FSRS brings it back when a review is due.</li><li>New words follow frequency order once the current pool is comfortable.</li><li>Longer sentences reuse familiar chunks. Missing words are prepared before introducing the pattern.</li></ol><p>A successful grammar review in each direction opens the next pattern for learning. Familiarity requires spaced success; opening a chapter is not proof of mastery.</p><p>Autosaving works on this browser and site. Download a save code for a portable backup. No account, AI service, or API key is needed.</p>`,
    "THE LEARNING IDEA",
  );
}
async function boot() {
  try {
    const response = await fetch("./data/vocabulary.json");
    if (!response.ok) throw new Error("Vocabulary could not be loaded.");
    const data = await response.json();
    metadata = data.metadata;
    configureCatalogue(data);
    prepareLessons();
    let raw = null,
      legacy = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
      legacy = localStorage.getItem("rangkai-v1");
    } catch {
      storageIssue =
        "Browser storage is unavailable. Download a portable save before leaving.";
    }
    if (raw) {
      try {
        state = validateState(JSON.parse(raw));
      } catch {
        state = freshState();
        storageIssue =
          "Stored progress could not be read. An unreadable copy was left in browser storage; recover from a portable save.";
        try {
          localStorage.setItem("rangkai-unreadable-backup", raw);
        } catch {}
      }
    } else if (legacy) {
      try {
        state = migrateLegacy(JSON.parse(legacy));
        persist();
        toast(
          "Earlier prototype progress preserved. New word schedules are ready.",
        );
      } catch {
        state = freshState();
        storageIssue =
          "Earlier progress could not be read. The original prototype save was left untouched.";
      }
    } else state = freshState();
    $("#how-button").onclick = howItWorks;
    $("#prototype-button").onclick = () => {
      openDialog(
        "Learn Malay, piece by piece.",
        `<p>1,000 ranked dictionary entries, per-word recognition and recall schedules, nine authored sentence patterns, and portable saves.</p><p>This remains a learning preview. Imported senses need educator review. Explanations are authored, not AI-generated, and free-text guesses are self-checked.</p><button class="primary-button" id="about-sources">Read about the sources</button>`,
        "ABOUT RANGKAI",
      );
      $("#about-sources").onclick = sourcesDialog;
    };
    $("#close-dialog").onclick = closeDialog;
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) {
        const r = dialog.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          closeDialog();
      }
    });
    window.addEventListener("hashchange", () => {
      resetStudy();
      vocabCard = null;
      importCandidate = null;
      if (pendingContext && page() === "practice") {
        const { s, id, d } = pendingContext;
        lessonCard = { ...s, unknown: [] };
        target = id;
        sentenceMode = "understand";
        lessonTurn = d === "recall" ? 1 : 0;
        prepareTiles();
        pendingContext = null;
      }
      render();
      window.scrollTo({ top: 0 });
    });
    window.addEventListener("storage", (e) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        state = validateState(JSON.parse(e.newValue));
        lastPersistedBody = JSON.stringify({ ...state, updatedAt: 0 });
        vocabCard = null;
        saveCode = "";
        importCandidate = null;
        resetStudy();
        if (dialog.open) closeDialog();
        render();
        toast(
          "Progress updated from another tab. The current card was refreshed.",
        );
      } catch {
        toast(
          "Another tab saved unreadable progress; this tab kept its current state.",
        );
      }
    });
    setInterval(
      () =>
        document
          .querySelectorAll("[data-due-count]")
          .forEach((el) => (el.textContent = dueCount(state))),
      30000,
    );
    render();
  } catch (e) {
    content.innerHTML = `<div class="full-card"><h1>Couldn’t open the word pool.</h1><p>${esc(e.message)}</p><p>Please refresh. Local development needs a static HTTP server.</p></div>`;
  }
}
boot();
