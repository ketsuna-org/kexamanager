#!/bin/sh
# Cree (ou retrouve) un projet de dev de type `garage` pointant sur le mock
# d'admin (tools/dev/garage-admin-mock.py) et affiche ses capacites reelles.
#
# Idempotent : si un projet du meme nom existe deja pour l'utilisateur, il est
# reutilise tel quel (aucun doublon, aucune ecriture en base).
#
# S'execute sur l'HOTE (l'API est joignable sur localhost:8080), tandis que
# `admin_url` doit etre joignable DEPUIS le conteneur API : on utilise donc le
# nom de conteneur du reseau docker kexa-dev, pas localhost.
#
# Env :
#   API_URL           (defaut http://localhost:8080)
#   KEXA_USER         (defaut root)
#   KEXA_PASSWORD     (defaut admin)
#   GARAGE_PROJECT    (defaut "Garage dev (mock admin)")
#   GARAGE_ADMIN_URL  (defaut http://kexa-garage-admin:3903)
#   GARAGE_ADMIN_TOKEN(defaut dev-admin-token)
set -e

API_URL="${API_URL:-http://localhost:8080}"
KEXA_USER="${KEXA_USER:-root}"
KEXA_PASSWORD="${KEXA_PASSWORD:-admin}"
GARAGE_PROJECT="${GARAGE_PROJECT:-Garage dev (mock admin)}"
GARAGE_ADMIN_URL="${GARAGE_ADMIN_URL:-http://kexa-garage-admin:3903}"
GARAGE_ADMIN_TOKEN="${GARAGE_ADMIN_TOKEN:-dev-admin-token}"

# Python disponible selon l'hote (python3 en conteneur, python sous git-bash).
# On ne se fie pas a `command -v` : sous Windows, l'alias Microsoft Store fournit
# un python3.exe qui existe mais qui echoue a l'execution.
PY=""
for candidate in python3 python py; do
    if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'pass' >/dev/null 2>&1; then
        PY="$candidate"
        break
    fi
done
if [ -z "$PY" ]; then echo "ERROR: aucun interpreteur python utilisable trouve" >&2; exit 1; fi

# --- 1. authentification -----------------------------------------------------
TOKEN=$(curl -s -m 15 -X POST "$API_URL/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"$KEXA_USER\",\"password\":\"$KEXA_PASSWORD\"}" \
    | "$PY" -c 'import json,sys; print(json.load(sys.stdin).get("token",""))')
if [ -z "$TOKEN" ]; then echo "ERROR: login echoue pour $KEXA_USER sur $API_URL" >&2; exit 1; fi

# --- 2. le projet existe-t-il deja ? (idempotence) ---------------------------
PROJECT_ID=$(curl -s -m 15 "$API_URL/api/s3-configs" -H "Authorization: Bearer $TOKEN" \
    | "$PY" -c '
import json, sys
name = sys.argv[1]
for cfg in json.load(sys.stdin) or []:
    if cfg.get("name") == name:
        print(cfg.get("id", ""))
        break
' "$GARAGE_PROJECT")

if [ -z "$PROJECT_ID" ]; then
    echo "--- creation du projet garage ---"
    CREATED=$(curl -s -m 15 -X POST "$API_URL/api/s3-configs/create" \
        -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
        -d "{\"name\":\"$GARAGE_PROJECT\",\"type\":\"garage\",\
\"s3_url\":\"http://kexa-s3:9000\",\"admin_url\":\"$GARAGE_ADMIN_URL\",\
\"admin_token\":\"$GARAGE_ADMIN_TOKEN\",\"client_id\":\"kexa\",\
\"client_secret\":\"kexa-secret\",\"region\":\"garage\",\"force_path_style\":true}")
    echo "$CREATED"
    PROJECT_ID=$(echo "$CREATED" | "$PY" -c 'import json,sys; print(json.load(sys.stdin).get("id",""))')
else
    echo "--- projet '$GARAGE_PROJECT' deja present, reutilise ---"
fi

if [ -z "$PROJECT_ID" ]; then echo "ERROR: id de projet introuvable" >&2; exit 1; fi
echo "PROJECT_ID=$PROJECT_ID"

# --- 3. preuve brute : les capacites annoncees par le proxy ------------------
echo "--- GET /api/$PROJECT_ID/capabilities ---"
curl -s -m 15 "$API_URL/api/$PROJECT_ID/capabilities" -H "Authorization: Bearer $TOKEN"
echo
echo "--- GET /api/$PROJECT_ID/stats/buckets ---"
curl -s -m 30 "$API_URL/api/$PROJECT_ID/stats/buckets" -H "Authorization: Bearer $TOKEN"
echo
