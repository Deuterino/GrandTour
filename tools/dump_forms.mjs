// Print the app's inflected-form index as JSON so the Python build can reuse exactly the same analysis.
// Usage (repo root): jsc -m tools/dump_forms.mjs -- de > build/forms_de.json
import { LangData } from '../app/js/core/data.js';

const args = typeof scriptArgs !== 'undefined' ? scriptArgs : (typeof arguments !== 'undefined' ? arguments : []);
const lang = args[0];
const L = new LangData(lang, JSON.parse(read(`app/data/${lang}/lexicon.json`)));
const out = {};
for (const [form, list] of L.forms()) out[form] = [...new Set(list.map((x) => x.id))];
print(JSON.stringify(out));
