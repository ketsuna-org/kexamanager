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

seed 300000   "$ROOT/bot-creator/readme.md"
seed 12000000 "$ROOT/bot-creator/releases/v2.1.16/bot_creator-linux-x64-steam.zip"
seed 300000   "$ROOT/bot-creator/releases/v2.1.16/manifest.json"
seed 300000   "$ROOT/bot-creator/releases/v2.1.16/labelled.zip"
seed 300000   "$ROOT/bot-creator/releases/v2.0.0/bot_creator-linux-x64-steam.zip"
seed 300000   "$ROOT/audio/track.mp3"
seed 300000   "$ROOT/config-bcm/backup/db.sqlite"

echo "--- buckets ---"
ls -1 "$ROOT"
echo "--- arborescence bot-creator ---"
find "$ROOT/bot-creator" -type f -printf '%10s  %P\n' | sort -k2
