#!/bin/sh
# Seed du harnais S3 local (MinIO) avec une arborescence realiste a deux niveaux.
# S'execute DANS un conteneur minio/mc (l'endpoint est le nom de service du harnais).
#
# Env attendues:
#   S3_ENDPOINT (defaut http://kexa-s3:9000)
#   S3_USER     (defaut kexa)
#   S3_PASSWORD (defaut kexa-secret)
#
# Role: valider NOTRE contrat (endpoints, parsing, rendu) sans cluster de production.
# Ce n'est PAS Garage: la semantique vendor (InspectObject, quotas reels) doit etre
# validee contre un vrai cluster (cf. .hermes/plans/2026-09-15_142902-*).
set -e

ENDPOINT="${S3_ENDPOINT:-http://kexa-s3:9000}"
S3_USER="${S3_USER:-kexa}"
S3_PASSWORD="${S3_PASSWORD:-kexa-secret}"

mc alias set harness "$ENDPOINT" "$S3_USER" "$S3_PASSWORD" >/dev/null
mc mb -p harness/bot-creator harness/audio harness/config-bcm >/dev/null 2>&1 || true

head -c 300000 /dev/urandom > /tmp/small.bin
head -c 12000000 /dev/urandom > /tmp/big.bin

mc cp -q /tmp/small.bin harness/bot-creator/readme.md
mc cp -q /tmp/big.bin  harness/bot-creator/releases/v2.1.16/bot_creator-linux-x64-steam.zip
mc cp -q /tmp/small.bin harness/bot-creator/releases/v2.1.16/manifest.json
mc cp -q /tmp/small.bin harness/bot-creator/releases/v2.0.0/bot_creator-linux-x64-steam.zip
mc cp -q /tmp/small.bin harness/config-bcm/backup/db.sqlite
mc cp -q /tmp/small.bin harness/audio/track.mp3
# Objet porteur de metadonnees personnalisees: sert a valider stat-object / fiche objet.
mc cp -q --attr "x-amz-meta-owner=jeremy;x-amz-meta-project=kexamanager" /tmp/small.bin harness/bot-creator/releases/v2.1.16/labelled.zip

echo "--- buckets ---"
mc ls harness
echo "--- arborescence bot-creator ---"
mc ls --recursive harness/bot-creator
