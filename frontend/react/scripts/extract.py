"""One-off: have DeepSeek move a component's English UI text into t() calls
and en.ts keys. Each file is type-checked; failures are reverted."""
import json, re, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import importlib.util
spec = importlib.util.spec_from_file_location("tr", Path(__file__).parent / "translate.py")
SRC = Path(__file__).resolve().parent.parent / "src"
import os, requests
from dotenv import load_dotenv
load_dotenv(SRC.parent.parent.parent / "backend" / ".env")
URL, KEY, MODEL = os.environ["AZURE_LLM_URL"], os.environ["AZURE_LLM_KEY"], os.environ["AZURE_LLM_MODEL"]

PROMPT = """You internationalise a React + TypeScript file. Replace every user-visible English string \
(JSX text, placeholder, aria-label, title, alt, error/notice messages shown to users) with t('<key>') calls.
- import {{ t }} from '{rel}i18n' (and tn for plurals: tn('<base>', n) uses keys <base>_one/<base>_other with {{n}}).
- Placeholders: t('key', {{ name: value }}) with "{{name}}" in the English text.
- Text containing links/elements: import Trans from '{rel}i18n/Trans' and use \
<Trans k="key" vars={{{{...}}}} tags={{{{ link: (text) => <Link to="...">{{text}}</Link> }}}} /> with "<link>...</link>" in the English.
- Keys: '{prefix}.<camelCase>'. Reuse these existing keys when the English matches exactly: {existing}
- Do NOT translate: code identifiers, URLs, CSS classes, console messages, comments, API field values, 'Banyan'.
- Keep all other code byte-for-byte identical. Never rename variables.
Reply with JSON only: {{"code": "<the full new file>", "keys": {{"<key>": "<English text>"}}}}"""

def ask(path: Path):
    rel = "../" * (len(path.relative_to(SRC).parts) - 1) or "./"
    en = (SRC / "i18n/en.ts").read_text()
    existing = dict(re.findall(r"^\s*'([^']+)':\s*\"(.*?)\",?$", en, re.M))
    prefix = path.stem[0].lower() + path.stem[1:]
    r = requests.post(f"{URL}/chat/completions", headers={"api-key": KEY}, timeout=300, json={
        "model": MODEL, "temperature": 0, "max_tokens": 32000,
        "messages": [{"role": "system", "content": PROMPT.format(rel=rel, prefix=prefix, existing=json.dumps(existing, ensure_ascii=False))},
                     {"role": "user", "content": path.read_text()}]})
    r.raise_for_status()
    text = r.json()["choices"][0]["message"]["content"]
    return json.loads(text[text.find("{"): text.rfind("}") + 1])

def add_keys(keys: dict):
    p = SRC / "i18n/en.ts"; s = p.read_text()
    add = "".join(f"  '{k}': {json.dumps(v, ensure_ascii=False)},\n" for k, v in keys.items() if f"'{k}':" not in s)
    p.write_text(s.replace("}\n\nexport type Key", add + "}\n\nexport type Key", 1))

for name in sys.argv[1:]:
    path = SRC / name
    before, en_before = path.read_text(), (SRC / "i18n/en.ts").read_text()
    try:
        out = ask(path)
        code = out["code"]
        if "tn(" not in code.replace("import { t, tn }", ""):
            code = code.replace("import { t, tn }", "import { t }")
        if "<Trans" not in code:
            code = re.sub(r"^import Trans from .*\n", "", code, flags=re.M)
        path.write_text(code); add_keys(out["keys"])
        res = subprocess.run(["npx", "tsc", "-b"], cwd=SRC.parent, capture_output=True, text=True)
        errs = [l for l in res.stdout.splitlines() if "error" in l and "src/i18n/es.ts" not in l and "src/i18n/hi.ts" not in l]
        if errs:
            raise RuntimeError("; ".join(errs[:3]))
        print("ok  ", name, len(out["keys"]), "keys")
    except Exception as e:
        path.write_text(before); (SRC / "i18n/en.ts").write_text(en_before)
        print("FAIL", name, str(e)[:300])
