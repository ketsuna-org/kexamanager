#!/usr/bin/env python
"""Verifie la parite stricte des locales FR et EN (memes cles, valeurs comparables).

Usage : python tools/i18n/check-parity.py
Sortie : nombre de cles par langue, cles orphelines dans chaque sens, exit 1 si
une cle manque d'un cote.
    """
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
LOCALES = REPO / "front" / "src" / "locales"


def flatten(obj, prefix=""):
    out = {}
    for k, v in obj.items():
        key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            out.update(flatten(v, key))
        else:
            out[key] = v
    return out


def main():
    fr = flatten(json.loads((LOCALES / "fr" / "translation.json").read_text(encoding="utf-8")))
    en = flatten(json.loads((LOCALES / "en" / "translation.json").read_text(encoding="utf-8")))
    print(f"cles FR={len(fr)} EN={len(en)}")
    only_fr = sorted(set(fr) - set(en))
    only_en = sorted(set(en) - set(fr))
    print("FR sans EN:", only_fr if only_fr else "[]")
    print("EN sans FR:", only_en if only_en else "[]")
    same = sorted(k for k in set(fr) & set(en) if fr[k] == en[k])
    print(f"valeurs identiques FR==EN: {len(same)}")
    return 1 if (only_fr or only_en) else 0


if __name__ == "__main__":
    sys.exit(main())
