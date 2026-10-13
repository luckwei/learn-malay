import { getWord, wordId } from "./engine.js";

const subjects = [
  { ms: "Saya", en: "I", be: "am", third: false },
  { ms: "Awak", en: "You", be: "are", third: false },
  { ms: "Dia", en: "He / she", be: "is", third: true },
  { ms: "Kami", en: "We", be: "are", third: false },
  { ms: "Kita", en: "We", be: "are", third: false },
];
const lowerSubject = (s) => (s.en === "I" ? "I" : s.en.toLowerCase());
const actions = [
  {
    ms: "makan",
    en: "eat",
    third: "eats",
    ongoing: "eating",
    objects: [
      ["nasi", "rice"],
      ["roti", "bread"],
    ],
  },
  {
    ms: "minum",
    en: "drink",
    third: "drinks",
    ongoing: "drinking",
    objects: [
      ["air", "water"],
      ["teh", "tea"],
    ],
  },
  {
    ms: "baca",
    en: "read",
    third: "reads",
    ongoing: "reading",
    objects: [["buku", "a book"]],
  },
  {
    ms: "tulis",
    en: "write",
    third: "writes",
    ongoing: "writing",
    objects: [["surat", "a letter"]],
  },
  {
    ms: "beli",
    en: "buy",
    third: "buys",
    ongoing: "buying",
    objects: [
      ["buku", "a book"],
      ["roti", "bread"],
      ["makanan", "food"],
      ["meja", "a table"],
      ["katil", "a bed"],
    ],
  },
  {
    ms: "lihat",
    en: "see",
    third: "sees",
    ongoing: null,
    objects: [
      ["kucing", "a cat"],
      ["anjing", "a dog"],
      ["rumah", "a house"],
    ],
  },
  {
    ms: "suka",
    en: "like",
    third: "likes",
    ongoing: null,
    objects: [
      ["buku", "a book"],
      ["teh", "tea"],
      ["roti", "bread"],
      ["makanan", "food"],
    ],
  },
  {
    ms: "ada",
    en: "have",
    third: "has",
    ongoing: null,
    objects: [
      ["buku", "a book"],
      ["rumah", "a house"],
      ["kawan", "a friend"],
    ],
  },
];
function chunk(ms, en, note, role = "function") {
  return { ms, en, note, role };
}
function subjectChunk(s) {
  return chunk(s.ms, s.en, getWord(wordId(s.ms))?.note, "subject");
}
function sentence(pattern, chunks, english, extra = {}) {
  const ms =
    chunks.map((c) => c.ms).join(" ") + (pattern === "question" ? "?" : ".");
  return {
    id: pattern + ":" + ms.toLowerCase(),
    pattern,
    ms,
    en: english,
    chunks,
    words: [...new Set(chunks.flatMap((c) => c.ms.toLowerCase().split(" ")))],
    ...extra,
  };
}
export const PATTERNS = [
  {
    id: "basic",
    title: "First connections",
    tag: "WHO → ACTION → THING",
    description: "A familiar subject, a verb, and a compatible object.",
    note: "Malay verbs do not change for I, you, or we. Baca, tulis, and beli are common root forms in conversation; standard active forms come later.",
    sample: "Saya makan nasi.",
    compare: {
      a: "Kami makan nasi.",
      b: "Kita makan nasi.",
      meaningA: "We eat rice, excluding the listener.",
      meaningB: "We eat rice, including the listener.",
      question: "Which sentence includes the listener?",
      answers: ["Kami makan nasi.", "Kita makan nasi."],
      correct: 1,
      note: "Kita includes the person you are speaking to. Kami excludes them.",
    },
  },
  {
    id: "ongoing",
    title: "Happening now",
    tag: "ONE ASPECT MARKER",
    description: "Add sedang to an action you already know.",
    note: "Sedang comes before the verb and explicitly marks an ongoing action. It does not change the root of the verb.",
    sample: "Saya sedang makan nasi.",
    compare: {
      a: "Saya makan nasi.",
      b: "Saya sedang makan nasi.",
      meaningA: "I eat rice; timing depends on context.",
      meaningB: "I am eating rice.",
      question: "What makes the action explicitly ongoing?",
      answers: ["saya", "sedang", "nasi"],
      correct: 1,
      note: "Sedang signals an action in progress; the verb makan stays the same.",
    },
  },
  {
    id: "forms",
    title: "Meet the verb family",
    tag: "ROOTS & STANDARD FORMS",
    description: "Link baca → membaca, tulis → menulis, and beli → membeli.",
    note: "MeN- marks an active verb here, not tense. Its surface form depends on the root: mem- before b, and men- with the initial t dropped in menulis.",
    sample: "Dia menulis surat.",
    compare: {
      a: "Dia baca buku.",
      b: "Dia membaca buku.",
      meaningA: "He / she reads a book; conversational root form.",
      meaningB: "He / she reads a book; standard active form.",
      question: "Does membaca itself mean “reading right now”?",
      answers: [
        "Yes, mem- marks continuous action.",
        "No. Add sedang or use context.",
      ],
      correct: 1,
      note: "MeN- is not a continuous-action marker. Dia sedang membaca buku explicitly marks an ongoing action.",
    },
  },
  {
    id: "destination",
    title: "An action, a destination",
    tag: "MOVEMENT → KE → PLACE",
    description: "Keep a familiar action and add where it leads.",
    note: "Ke marks direction or destination. Berjalan is ber- + jalan: an intransitive verb meaning walk. Ber- does not itself mark time.",
    sample: "Saya sedang berjalan ke taman.",
    compare: {
      a: "Saya di taman.",
      b: "Saya berjalan ke taman.",
      meaningA: "I am at the park.",
      meaningB: "I walk to the park.",
      question: "Which word marks movement towards a place?",
      answers: ["di", "ke"],
      correct: 1,
      note: "Di marks location; ke marks destination. They are separate words, not prefixes in these phrases.",
    },
  },
  {
    id: "past",
    title: "Let time do the work",
    tag: "SAME VERB, DIFFERENT TIME",
    description: "Add semalam or esok without changing pergi.",
    note: "Malay verbs do not conjugate into an English-style past tense. Here semalam establishes the past, and esok establishes the future.",
    sample: "Saya pergi ke sana semalam.",
    compare: {
      a: "Saya pergi ke sana semalam.",
      b: "Saya pergi ke sana esok.",
      meaningA: "I went there yesterday.",
      meaningB: "I will go there tomorrow.",
      question: "Which part changes the time of the action?",
      answers: ["The verb pergi changes.", "The time expression changes."],
      correct: 1,
      note: "Pergi stays the same. Semalam and esok give these examples their time reference.",
    },
  },
  {
    id: "question",
    title: "Ask a little more",
    tag: "WHY → PERSON → FEELING → PLACE",
    description: "Combine a question, a feeling, and a familiar location.",
    note: "Kenapa is common in everyday questions; mengapa is a standard alternative. An adjective such as gembira can be a predicate without adding an English-style be verb.",
    sample: "Kenapa awak gembira di dalam kelas?",
    compare: {
      a: "Awak gembira.",
      b: "Kenapa awak gembira?",
      meaningA: "You are happy.",
      meaningB: "Why are you happy?",
      question: "Must we insert adalah before gembira here?",
      answers: [
        "Yes, every English be needs adalah.",
        "No, gembira can be the predicate.",
      ],
      correct: 1,
      note: "Malay adjective predicates commonly work without adalah. Translate the structure, not each English word.",
    },
  },
  {
    id: "description",
    title: "A more detailed picture",
    tag: "ANIMAL → THAT → ACTION → LOCATION",
    description: "Describe an animal jumping onto a familiar object.",
    note: "Itu follows the noun: kucing itu means that cat or the cat in context. Ke atas describes movement onto or upwards; di atas describes location on or above.",
    sample: "Kucing itu melompat ke atas katil.",
    compare: {
      a: "Kucing itu di atas katil.",
      b: "Kucing itu melompat ke atas katil.",
      meaningA: "The cat is on the bed.",
      meaningB: "The cat jumps onto the bed.",
      question: "Which phrase describes movement onto the bed?",
      answers: ["di atas katil", "ke atas katil"],
      correct: 1,
      note: "Ke atas is directional. Di atas describes location. Melompat is an active verb, not a past-tense form.",
    },
  },
  {
    id: "relative",
    title: "Connect a little clause",
    tag: "NOUN → YANG → DESCRIPTION",
    description: "Reuse familiar words to identify which book you mean.",
    note: "Yang links a noun to a descriptive clause. The whole phrase buku yang dia baca means the book that he / she reads. These examples use conversational root verbs.",
    sample: "Saya suka buku yang awak baca.",
    compare: {
      a: "Saya suka buku itu.",
      b: "Saya suka buku yang awak baca.",
      meaningA: "I like that book.",
      meaningB: "I like the book that you read.",
      question: "What does yang introduce here?",
      answers: [
        "A description identifying the book.",
        "An ongoing-action marker.",
      ],
      correct: 0,
      note: "Yang introduces the clause awak baca, which tells us which book. It is not an aspect marker.",
    },
  },
  {
    id: "reason",
    title: "Say what happens, and why",
    tag: "ACTION → REASON → CONNECTED ACTION",
    description: "Put familiar chunks together into a longer sentence.",
    note: "Kerana introduces a reason; dan connects the two predicates lapar and nampak makanan. Melompat-lompat expresses repeated jumping. Nampak is common everyday usage.",
    sample:
      "Anjing itu melompat-lompat dengan teruja kerana lapar dan nampak makanan.",
    compare: {
      a: "Anjing itu melompat-lompat.",
      b: "Anjing itu melompat-lompat kerana lapar.",
      meaningA: "The dog jumps repeatedly.",
      meaningB: "The dog jumps repeatedly because it is hungry.",
      question: "Which word introduces the reason?",
      answers: ["itu", "kerana", "melompat-lompat"],
      correct: 1,
      note: "Kerana means because. The reason is a separate chunk, so you can understand the longer sentence piece by piece.",
    },
  },
];

export function generateSentences(pattern) {
  const result = [];
  if (["basic", "ongoing", "forms"].includes(pattern)) {
    const selected =
      pattern === "forms"
        ? actions.filter((a) => ["baca", "tulis", "beli"].includes(a.ms))
        : pattern === "ongoing"
          ? actions.filter((a) => a.ongoing)
          : actions;
    for (const s of subjects)
      for (const a of selected)
        for (const [object, enObject] of a.objects) {
          const verb =
            pattern === "forms"
              ? { baca: "membaca", tulis: "menulis", beli: "membeli" }[a.ms]
              : a.ms;
          const ongoing = pattern === "ongoing";
          const chunks = [
            subjectChunk(s),
            ...(ongoing
              ? [
                  chunk(
                    "sedang",
                    "in progress",
                    "Explicitly marks an ongoing action.",
                    "aspect",
                  ),
                ]
              : []),
            chunk(
              verb,
              ongoing ? a.ongoing : a.en,
              getWord(wordId(verb))?.note,
              "verb",
            ),
            chunk(object, enObject, getWord(wordId(object))?.note, "object"),
          ];
          result.push(
            sentence(
              pattern,
              chunks,
              `${s.en} ${ongoing ? s.be + " " + a.ongoing : s.third ? a.third : a.en} ${enObject}.`,
            ),
          );
        }
  } else if (pattern === "destination") {
    for (const s of subjects)
      for (const [place, enPlace] of [
        ["taman", "the park"],
        ["rumah", "home"],
        ["sekolah", "school"],
      ]) {
        result.push(
          sentence(
            pattern,
            [
              subjectChunk(s),
              chunk(
                "sedang berjalan",
                "walking",
                "Sedang marks ongoing action; berjalan comes from ber- + jalan.",
                "verb",
              ),
              chunk(
                "ke " + place,
                enPlace === "home" ? "home" : "to " + enPlace,
                "Ke marks a destination.",
                "preposition",
              ),
            ],
            `${s.en} ${s.be} walking ${enPlace === "home" ? "home" : "to " + enPlace}.`,
          ),
        );
      }
  } else if (pattern === "past") {
    for (const s of subjects)
      for (const [time, enTime, verb] of [
        ["semalam", "yesterday", "went"],
        ["esok", "tomorrow", "will go"],
      ]) {
        result.push(
          sentence(
            pattern,
            [
              subjectChunk(s),
              chunk(
                "pergi",
                "go",
                "The verb stays the same; the time phrase sets the time.",
                "verb",
              ),
              chunk(
                "ke sana",
                "there",
                "Ke sana is a destination; di sana is a location.",
                "preposition",
              ),
              chunk(time, enTime, getWord(wordId(time))?.note, "time"),
            ],
            `${s.en} ${verb} there ${enTime}.`,
          ),
        );
      }
  } else if (pattern === "question") {
    for (const s of subjects)
      for (const [feeling, enFeeling] of [
        ["gembira", "happy"],
        ["lapar", "hungry"],
      ])
        for (const [place, enPlace] of [
          ["kelas", "the classroom"],
          ["rumah", "the house"],
        ]) {
          result.push(
            sentence(
              pattern,
              [
                chunk(
                  "Kenapa",
                  "why",
                  "Everyday question word; mengapa is a standard alternative.",
                  "question",
                ),
                subjectChunk({ ...s, ms: s.ms.toLowerCase() }),
                chunk(
                  feeling,
                  enFeeling,
                  "An adjective predicate needs no English-style be verb.",
                  "adjective",
                ),
                chunk(
                  "di dalam " + place,
                  "in " + enPlace,
                  "Di marks location; dalam means inside.",
                  "preposition",
                ),
              ],
              `Why ${s.be} ${lowerSubject(s)} ${enFeeling} in ${enPlace}?`,
            ),
          );
        }
  } else if (pattern === "description") {
    for (const [animal, enAnimal] of [
      ["Kucing", "cat"],
      ["Anjing", "dog"],
    ])
      for (const [place, enPlace] of [
        ["katil", "bed"],
        ["meja", "table"],
      ]) {
        result.push(
          sentence(
            pattern,
            [
              chunk(
                animal + " itu",
                "the " + enAnimal,
                "Itu follows the noun and identifies the animal acting as the subject.",
                "subject",
              ),
              chunk(
                "melompat",
                "jumps",
                "MeN- + lompat, a standard active verb; not a tense marker.",
                "verb",
              ),
              chunk(
                "ke atas " + place,
                "onto the " + enPlace,
                "Ke atas marks direction onto or upwards.",
                "preposition",
              ),
            ],
            `The ${enAnimal} jumps onto the ${enPlace}.`,
          ),
        );
      }
  } else if (pattern === "relative") {
    for (const s of subjects)
      for (const reader of subjects.filter((r) => r.ms !== s.ms)) {
        result.push(
          sentence(
            pattern,
            [
              subjectChunk(s),
              chunk(
                "suka",
                "like",
                "The verb stays the same across subjects.",
                "verb",
              ),
              chunk(
                "buku",
                "the book",
                "The noun being identified by the following clause.",
                "object",
              ),
              chunk(
                "yang " + reader.ms.toLowerCase() + " baca",
                "that " +
                  lowerSubject(reader) +
                  " " +
                  (reader.third ? "reads" : "read"),
                "Yang introduces a relative clause. Baca is a conversational root form.",
                "connector",
              ),
            ],
            `${s.en} ${s.third ? "likes" : "like"} the book that ${lowerSubject(reader)} ${reader.third ? "reads" : "read"}.`,
          ),
        );
      }
  } else if (pattern === "reason") {
    for (const [animal, enAnimal] of [
      ["Anjing", "dog"],
      ["Kucing", "cat"],
    ]) {
      result.push(
        sentence(
          pattern,
          [
            chunk(
              animal + " itu",
              "the " + enAnimal,
              "Itu follows the noun; this phrase is the subject.",
              "subject",
            ),
            chunk(
              "melompat-lompat",
              "jumps repeatedly",
              "Reduplication here marks repeated jumping, not tense.",
              "verb",
            ),
            chunk(
              "dengan teruja",
              "excitedly",
              "Dengan introduces manner here; teruja means excited.",
              "preposition",
            ),
            chunk(
              "kerana lapar",
              "because it is hungry",
              "Kerana introduces a reason; lapar is an adjective predicate.",
              "connector",
            ),
            chunk(
              "dan nampak makanan",
              "and sees food",
              "Dan connects another predicate. Makanan is a noun related to makan.",
              "connector",
            ),
          ],
          `The ${enAnimal} keeps jumping excitedly because it is hungry and sees food.`,
        ),
      );
    }
  }
  return result;
}
export let SENTENCES = [];
export function prepareLessons() {
  SENTENCES = PATTERNS.flatMap((p) => generateSentences(p.id));
}
export function candidatesFor(state, pattern) {
  const pool = new Set(state.introduced);
  return SENTENCES.filter((s) => s.pattern === pattern)
    .map((s) => ({
      ...s,
      unknown: s.words.filter((w) => !pool.has(wordId(w))),
    }))
    .sort((a, b) => a.unknown.length - b.unknown.length);
}
