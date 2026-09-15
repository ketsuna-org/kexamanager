#!/bin/sh
# Seed du harnais S3 en mode NATIF (sans Docker, sans mc).
#
# Le serveur S3 natif (`rclone serve s3`, cible dev-s3-native) expose un DOSSIER :
# un sous-dossier de la racine = un bucket. Ce script reproduit donc la fixture de
# tools/dev/seed-s3.sh (memes noms d'objets, memes tailles) en la materialisant sur
# le disque, pour que le rendu de l'UI soit identique en mode Docker et en mode natif.
#
# Limite assumee : les metadonnees personnalisees (x-amz-meta-*) de l'objet
# `releases/v2.1.16/labelled.zip` ne survivent pas a un backend dossier : la fiche
# objet les montrera vides en mode natif. Le mode Docker (MinIO) reste la reference
# pour ce point precis.
#
# Usage: sh tools/dev/seed-s3-dir.sh <data-dir>
set -e

ROOT="${1:?usage: sh tools/dev/seed-s3-dir.sh <data-dir>}"

mkdir -p \
    "$ROOT/bot-creator/releases/v2.1.16" \
    "$ROOT/bot-creator/releases/v2.0.0" \
    "$ROOT/audio" \
    "$ROOT/config-bcm/backup"

# Idempotent : un objet deja present avec la bonne taille n'est pas reecrit.
seed() {
    bytes="$1"
    target="$2"
    if [ -s "$target" ] && [ "$(wc -c < "$target")" = "$bytes" ]; then
        return 0
    fi
    head -c "$bytes" /dev/urandom > "$target"
}

# Les deux fichiers texte portent un contenu REEL : sans ca, l'apercu de l'objet
# affiche 300 Ko d'octets aleatoires et on croit que l'app est cassee. Les binaires
# (archives, mp3, sqlite) restent des octets aleatoires, c'est ce qu'on veut tester.
text() {
    printf '%s' "$2" > "$1"
}

text "$ROOT/bot-creator/readme.md" '# bot-creator — artefacts de release

Depot de publication des binaires du bot.

## Arborescence
- releases/v2.0.0/  : version precedente
- releases/v2.1.16/ : version courante (archive linux x64 steam, manifeste, archive labellisee)

## Notes
Le manifeste decrit les artefacts de la version. Les archives sont immuables :
une correction passe par un nouveau dossier de version.

Contact : equipe plateforme.
'

text "$ROOT/bot-creator/releases/v2.1.16/manifest.json" '{
  "version": "2.1.16",
  "channel": "steam",
  "platform": "linux-x64",
  "artifacts": [
    { "name": "bot_creator-linux-x64-steam.zip", "size": 12000000 },
    { "name": "labelled.zip" }
  ],
  "publishedAt": "2026-09-15T13:24:00Z"
}
'

seed 12000000 "$ROOT/bot-creator/releases/v2.1.16/bot_creator-linux-x64-steam.zip"
seed 300000   "$ROOT/bot-creator/releases/v2.1.16/labelled.zip"
seed 300000   "$ROOT/bot-creator/releases/v2.0.0/bot_creator-linux-x64-steam.zip"
seed 300000   "$ROOT/audio/track.mp3"
seed 300000   "$ROOT/config-bcm/backup/db.sqlite"

echo "--- buckets ---"
ls -1 "$ROOT"
echo "--- arborescence bot-creator ---"
find "$ROOT/bot-creator" -type f -printf '%10s  %P\n' | sort -k2
