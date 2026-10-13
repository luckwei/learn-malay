"""Build the catalogue from wordfreq + Malaysian Wordnet Bahasa + Princeton WN.

Requires wordfreq==3.1.1. Download the upstream Wordnet files to --sources first.
The script deliberately excludes unmatched tokens rather than inventing glosses.
"""
import argparse
import hashlib
import json
import re
import zipfile
from collections import defaultdict
from pathlib import Path
from wordfreq import top_n_list, zipf_frequency

ROOT = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser()
p.add_argument('--sources', type=Path, required=True)
args = p.parse_args()
EXPECTED = {
    'wordnet.zip': 'cbda5ea6eef7f36a97a43d4a75f85e07fccbb4f23657d27b4ccbc93e2646ab59',
    'wn-data-zsm.tab': '6d672be825026e45d175f1927edad4d9a28f9037fe4a933ca2eba2b5a0ff1888',
}
for name, digest in EXPECTED.items():
    actual = hashlib.sha256((args.sources / name).read_bytes()).hexdigest()
    if actual != digest:
        raise RuntimeError(f'{name} does not match the inspected source snapshot. Review upstream changes before rebuilding.')
curated = json.loads((ROOT / 'data/curated.json').read_text())
for line in (ROOT / 'data/everyday.tsv').read_text().splitlines():
    if not line or line.startswith('#'):
        continue
    word, meaning, role, note, *root = line.split('|')
    curated[word] = {'meaning': meaning, 'type': role, 'note': note}
    if root and root[0]:
        curated[word]['root'] = root[0]

z = zipfile.ZipFile(args.sources / 'wordnet.zip')
english = {}
for name in ['noun', 'verb', 'adj', 'adv']:
    for line in z.read('wordnet/data.' + name).decode().splitlines():
        if not line or not line[0].isdigit():
            continue
        data, gloss = line.split('|', 1)
        fields = data.split()
        pos = 'a' if fields[2] == 's' else fields[2]
        labels = [fields[4 + i * 2].replace('_', ' ') for i in range(int(fields[3], 16))]
        english[fields[0] + '-' + pos] = {'labels': labels, 'gloss': gloss.strip(), 'pos': pos}

malay = defaultdict(list)
for line in (args.sources / 'wn-data-zsm.tab').read_text().splitlines():
    if not line or line.startswith('#'):
        continue
    synset, kind, word = line.split('\t', 2)
    if kind == 'zsm:lemma' and synset in english:
        malay[word.lower().replace('_', ' ')].append(synset)

frequency = top_n_list('ms', 30000)
rank = {w: i + 1 for i, w in enumerate(frequency)}
# Exclude names, numbers, and untranslated foreign tokens. Keep useful compounds.
excluded = {'malaysia', 'indonesia', 'singapura', 'islam', 'allah', 'muhammad',
            'johor', 'selangor', 'melayu', 'cina', 'india', 'facebook', 'twitter',
            'youtube', 'english', 'the', 'and', 'of', 'to', 'in', 'for', 'is', 'on', 'a'}
items = []
for word in frequency:
    if word in excluded or not re.fullmatch(r'[a-z]+(?:[- ][a-z]+)*', word):
        continue
    if word not in curated and word not in malay:
        continue
    row = {'id': 'ms:' + word, 'word': word, 'rank': rank[word],
           'frequency': zipf_frequency(word, 'ms')}
    if word in curated:
        row.update(curated[word])
        row['source'] = 'everyday'
    else:
        senses = []
        for synset in dict.fromkeys(malay[word]):
            d = english[synset]
            senses.append({'synset': synset, 'meaning': ' / '.join(d['labels'][:3]),
                           'definition': d['gloss'], 'pos': d['pos']})
        # Keep multiple senses visible; no claim that the first is the Malay primary sense.
        row.update({'meaning': senses[0]['meaning'], 'type': {'n': 'object', 'v': 'verb', 'a': 'adjective', 'r': 'function'}[senses[0]['pos']],
                    'source': 'wordnet', 'senses': senses[:6],
                    'note': 'Imported dictionary senses. The first sense is not necessarily the most common everyday use.'})
    items.append(row)
    if len(items) == 1000:
        break
if len(items) != 1000:
    raise RuntimeError(f'Only {len(items)} candidates; do not fabricate missing entries.')
# Reviewed lesson words may fall beyond the 1,000-entry catalogue. Keep them separate.
present = {r['word'] for r in items}
lesson_words = []
for word, d in curated.items():
    if word not in present:
        lesson_words.append({'id': 'ms:' + word, 'word': word, 'rank': rank.get(word),
                             'frequency': zipf_frequency(word, 'ms'), 'source': 'everyday', **d})
metadata = {'version': 1, 'entries': len(items), 'curated': sum(r['source'] == 'everyday' for r in items),
            'ranking': 'wordfreq 3.1.1 Malay (ms), mixed-source frequency snapshot through ~2021',
            'selection': 'First 1,000 supported lexical entries in frequency order after documented filtering; not the raw top 1,000 tokens.',
            'sources': ['https://github.com/rspeer/wordfreq', 'https://github.com/omwn/omw-data/tree/master/wns/msa', 'https://wordnet.princeton.edu/'],
            'licence': 'CC BY-SA 4.0; see ATTRIBUTION.md and licences below',
            'licence_url': 'https://creativecommons.org/licenses/by-sa/4.0/',
            'copyright_notices': {n: (ROOT / 'licenses' / n).read_text() for n in ['wordfreq.txt','wordfreq-data-notices.md','wordnet-bahasa-MIT.txt','princeton-wordnet.txt']},
            'upstream_sha256': {n: hashlib.sha256((args.sources / n).read_bytes()).hexdigest() for n in ['wordnet.zip', 'wn-data-zsm.tab']}}
(ROOT / 'data/vocabulary.json').write_text(json.dumps({'metadata': metadata, 'words': items, 'lessonWords': lesson_words}, ensure_ascii=False, separators=(',', ':')) + '\n')
print(json.dumps(metadata, indent=2))
print('Additional lesson words:', len(lesson_words))
