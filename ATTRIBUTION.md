# Rangkai data and dependency attribution

The application and the learning data have separate licences. The frequency-derived catalogue (`data/vocabulary.json`) is distributed under **Creative Commons Attribution-ShareAlike 4.0 International**: https://creativecommons.org/licenses/by-sa/4.0/ . Preserve attribution and licence information when redistributing adaptations of this catalogue.

## Frequency ranks

[wordfreq](https://github.com/rspeer/wordfreq), version 3.1.1, by Robyn Speer and contributors. The package is Apache-2.0 licensed; its frequency data has CC BY-SA 4.0 attribution and additional source notices. The package notice is retained in [licenses/wordfreq.txt](licenses/wordfreq.txt), and the upstream data attribution and citations are retained in [licenses/wordfreq-data-notices.md](licenses/wordfreq-data-notices.md).

Rangkai uses `top_n_list('ms', 30000)` and `zipf_frequency(word, 'ms')`. This is a mixed-source Malay frequency snapshot through approximately 2021, not an audited ranking of current Malaysian conversation. Numbers, a documented set of names/foreign tokens, and entries without a supported meaning are excluded. The first 1,000 remaining lexical entries retain their original corpus ranks; gaps are intentional. Eleven extra authored forms/phrases support the lessons.

Changes: filtered selection, stable IDs, lexical-role labels, word-family links where authored, English senses attached via Wordnet Bahasa, and authored everyday notes. Imported sense order is not a claim about the most common Malay meaning. Dictionary mappings and learner-facing meanings need educator review.

## Malay word-to-sense mappings

[Wordnet Bahasa](https://github.com/omwn/omw-data/tree/master/wns/msa), Malaysian Malay (`zsm`) file, by Francis Bond, David Moeljadi, Muhammad Zulhelmy Mohamed Rosman, Nurril Hirfana Mohamed Noor, Suerya Sapuan, Hammam Riza, and Tan Enya Kong. The Indonesian (`ind`) file is not used.

MIT licence, copyright 2011–2015 as detailed in [licenses/wordnet-bahasa-MIT.txt](licenses/wordnet-bahasa-MIT.txt).

## English labels and definitions

[Princeton WordNet 3.0](https://wordnet.princeton.edu/), copyright 2006 Princeton University. Its full copyright, permission, and disclaimer are retained in [licenses/princeton-wordnet.txt](licenses/princeton-wordnet.txt). English labels and definitions are attached to Malay mappings by WordNet 3.0 synset IDs. They are lexical senses, not machine translations of arbitrary sentences.

## Scheduling

[ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs), version **5.4.2**, by its contributors, MIT licensed. An unmodified browser ES module is bundled as `vendor/fsrs.mjs`. The full notice is in [licenses/ts-fsrs-MIT.txt](licenses/ts-fsrs-MIT.txt).

Downloaded through npm with the registry integrity:

```
sha512-z4qop4pzTcyTzuJ566d9EaX/4bZZzhYfeaPImfVr+xcYT65c5oBgFDijUhCE/D+C78eaolHIhKRZ04/RwF+v2g==
```

The app uses FSRS defaults with 90% target retention and deterministic scheduling (`enable_fuzz: false`). The default parameters are not personally optimised; retention is an estimate, not a guarantee. Recent review history is saved, but no optimiser or AI service runs.

## Authored lessons

The everyday notes in `data/curated.json` and `data/everyday.tsv`, sentence templates, English renderings, and chunk explanations were authored for this project. Catalogue notes are included in the CC BY-SA 4.0 learning dataset. Templates are constrained and manually inspected; they have not been certified by a language educator.

## Reproduction

`scripts/build_vocab.py` records the SHA-256 hashes of the upstream WordNet archives in the generated metadata. See README.md for commands. Runtime requires only the bundled files; no dictionary or scheduling CDN is contacted.
