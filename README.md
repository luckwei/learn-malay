# Rangkai

A Malay learning app that expands a small vocabulary pool through repeated sentence patterns and spaced review. Prioritises everyday Malaysian Malay, with standard forms explained alongside conversational ones.

**Live:** https://luckwei.github.io/learn-malay/

## Develop

```sh
python3 -m http.server 8001 --bind 127.0.0.1 --directory /workspace/learn-malay
```

No build, package installation, account, API key, or backend is required. Serve over HTTP rather than opening `index.html` as a file, because vocabulary loads from JSON and the JavaScript uses modules. The FSRS scheduler is bundled locally. Google Fonts are optional; system fonts are the fallback.

```sh
npm test
npm run check
python3 tests/browser_smoke.py
```

The unit suite requires Node 20+. Browser checks additionally use the installed Python Playwright package and `/usr/bin/chromium`; override `RANGKAI_TEST_URL` and `RANGKAI_CHROMIUM` if needed. The browser suite exercises isolated progress, both directions, negative and positive word-order checks, backups, migration, multiple tabs, and responsive layouts.

## Learning

- A catalogue of **1,000 frequency-ranked lexical entries**, plus **11 lesson-specific forms/phrases**. **153 catalogue entries** have authored everyday notes. Other entries display imported Malaysian Wordnet Bahasa senses with Princeton WordNet English labels/definitions.
- Five initial subjects, five verbs, and four objects. New words follow source frequency order after the active pool is comfortable in the selected directions. Review due items first; default limit is five new words per local calendar day, adjustable from 1 to 20.
- Vocabulary flashcards in Malay → English and English → Malay. Reveal and self-rate Again / Hard / Good / Easy. Supported vocabulary can be carried directly into an available sentence pattern.
- **Nine authored patterns** produce **266 compatible sentence combinations**, including destinations, time phrases, questions, descriptions, relative clauses, and reasons. Template coverage is a curated subset of the catalogue; arbitrary dictionary words are not randomly placed into sentences.
- Missing sentence vocabulary is prepared first. Choosing a pattern can prioritise its prerequisites in frequency order, while due reviews retain priority.
- Recognition and recall, individual word forms, and grammar patterns each have separate FSRS records. Only the selected focus is scored; other words receive exposure counts. Root and derived forms are linked but not treated as identical knowledge.
- Both directions need a successful grammar self-review to open the next pattern **for learning**. This is not a mastery claim. Familiar status requires two successful reviews separated from the prior review by at least a day, in each direction, and a current FSRS Review state with a successful last rating.
- Due grammar reviews are preferred in sentence practice when their vocabulary is available. Manually selected patterns can also be reviewed early; the UI identifies early reviews.

Uses `ts-fsrs@5.4.2` / FSRS-6, default parameters, 90% target retention, and no random interval fuzz. Estimates are not personally optimised or guarantees of mastery. Free-text translations are self-checked; supplied tile exercises check the target example's order, not all possible valid translations. No AI service is connected.

## Persistence and portable saves

Progress automatically saves under `rangkai-v2` in localStorage for the same browser and origin. Cookies and server accounts are not used. Another tab's saved progress refreshes the current card; simultaneous independent-device progress is not automatically merged.

Progress & saves offers download, copy/paste, and file upload. Text codes are versioned JSON compressed with gzip and encoded as base64 (`RG2G` prefix), with a SHA-256 integrity check of the uncompressed snapshot. A plain JSON payload variant (`RG2J`) supports browsers without compression when exporting. Current browsers with CompressionStream/DecompressionStream are recommended. Save codes are encoded, **not encrypted**.

Stable word IDs preserve schedules when catalogue ordering changes. Saves contain review records, introduced words, grammar access, settings, exposures, and up to 3,000 recent review events; the dictionary is not duplicated. Detailed review records retain lifetime counts even when older events leave the bounded log.

Restore validates checksums, format, vocabulary IDs, dates, numeric bounds, and a maximum 4 MiB decoded payload before showing a preview. Confirmation replaces the current snapshot; it does not merge two devices. A pre-restore/pre-reset recovery copy is retained locally. Download a copy outside the browser because clearing site data erases local progress and local recovery copies.

Earlier `rangkai-v1` sentence ratings and chapter access are migrated and retained, with the original v1 storage key left untouched. They do not manufacture per-word mastery. Storage failures show a warning; a downloadable in-memory save is still available.

## Data sources and limitations

See [ATTRIBUTION.md](ATTRIBUTION.md) and [licenses/](licenses/). Frequency ranks use wordfreq 3.1.1's mixed-source Malay snapshot through approximately 2021. This catalogue is the first 1,000 supported lexical entries after documented filtering, **not an unfiltered or certified top-1,000 ranking of current Malaysian conversation**. Imported dictionary sense order is not a verified most-common meaning. Educator review is needed before presenting the imported catalogue as a vetted curriculum.

The catalogue is CC BY-SA 4.0 with upstream attribution. Wordnet Bahasa is MIT licensed; Princeton WordNet and the bundled FSRS scheduler retain their notices. Names, unsupported tokens, and entries without sourced meanings are excluded instead of inventing definitions.

To regenerate the catalogue, install `wordfreq==3.1.1` into a temporary tooling directory, and obtain these inspected upstream files over verified HTTPS:

- `wn-data-zsm.tab`: https://raw.githubusercontent.com/omwn/omw-data/master/wns/msa/wn-data-zsm.tab
- `wordnet.zip`: https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/wordnet.zip

Place them in a source directory and run:

```sh
PYTHONPATH=/tmp/rangkai-data-tools python3 scripts/build_vocab.py --sources /tmp
```

The builder checks the inspected SHA-256 source snapshots and emits provenance/licence metadata. If upstream files change, inspect the changes before updating expected hashes. Everyday notes live in `data/curated.json` and `data/everyday.tsv`; sentence patterns live in `lessons.js`.

## GitHub Pages

The `gh-pages` branch deploys from `/ (root)`; `main` holds the same tested static application. Asset paths are relative for `/learn-malay/`. Publish tested changes to both branches when authorised, then verify the Pages deployment and live browser behaviour. User progress stays in localStorage on the existing Pages origin across deployments.
