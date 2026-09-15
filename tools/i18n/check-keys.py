"""Controle exhaustif des cles i18n utilisees dans front/src vs locales FR/EN.

Methode :
 1. parcourt front/src/**/*.{ts,tsx}
 2. extrait les appels t("...") / t('...') / t(`...`) (guillemets simples, doubles,
    backticks sans interpolation) ainsi que i18n.t(...)
 3. normalise : supprime les espaces, ignore les cles dynamiques (${...})
 4. aplatit les locales FR et EN et verifie l'existence de chaque cle dans les deux
 5. sort 0 cle manquante si tout est bon, exit code 1 sinon

Usage : python tools/i18n/check-keys.py (depuis n'importe quel dossier)
"""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SRC = REPO / "front" / "src"
LOCALES = SRC / "locales"

CALL = re.compile(r"""(?<![\w$])t\(\s*(?P<q>["'`])(?P<key>[^"'`\\]*?)(?P=q)""")
PLURALISH = re.compile(r"^\s*$")


def flatten(obj, prefix=""):
    out = {}
    for k, v in obj.items():
        key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            out.update(flatten(v, key))
        else:
            out[key] = v
    return out


def used_keys():
    used = defaultdict(set)
    files = sorted([p for p in SRC.rglob("*") if p.suffix in (".ts", ".tsx")])
    for path in files:
        text = path.read_text(encoding="utf-8", errors="replace")
        # retire les commentaires de ligne pour eviter les faux positifs
        cleaned = re.sub(r"^\s*//.*$", "", text, flags=re.M)
        for m in CALL.finditer(cleaned):
            key = m.group("key").strip()
            if not key or PLURALISH.match(key):
                continue
            if "${" in key or "{{" in key:
                continue
            if not re.match(r"^[A-Za-z_][A-Za-z0-9_.]*$", key):
                continue
            rel = path.relative_to(REPO).as_posix()
            used[key].add(rel)
    return used, len(files)


def main():
    fr = flatten(json.loads((LOCALES / "fr" / "translation.json").read_text(encoding="utf-8")))
    en = flatten(json.loads((LOCALES / "en" / "translation.json").read_text(encoding="utf-8")))
    used, nfiles = used_keys()

    missing_fr = sorted(k for k in used if k not in fr)
    missing_en = sorted(k for k in used if k not in en)

    print(f"fichiers source scannes      : {nfiles}")
    print(f"cles distinctes utilisees    : {len(used)}")
    print(f"cles FR={len(fr)}  EN={len(en)}")
    print(f"MANQUANTES EN FR ({len(missing_fr)}) :")
    for k in missing_fr:
        print(f"  - {k}  <- {', '.join(sorted(used[k]))}")
    print(f"MANQUANTES EN EN ({len(missing_en)}) :")
    for k in missing_en:
        print(f"  - {k}  <- {', '.join(sorted(used[k]))}")
    print("RESULTAT : " + ("OK - 0 cle manquante" if not missing_fr and not missing_en else f"ECHEC - {len(set(missing_fr) | set(missing_en))} cle(s) manquante(s)"))
    return 1 if (missing_fr or missing_en) else 0


if __name__ == "__main__":
    sys.exit(main())
