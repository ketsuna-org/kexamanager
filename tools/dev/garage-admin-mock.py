#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""MOCK D'ADMIN GARAGE POUR LE DEVELOPPEMENT — NE JAMAIS DEPLOYER EN PRODUCTION.

Ce processus n'est PAS Garage. Il rejoue une poignee de reponses de l'API admin
v2 avec une forme conforme aux schemas du depot (front/src/types/openapi.ts) pour
valider AU REEL le contrat de nos endpoints /capabilities et /stats/* sans
cluster de production.

Portee honnete : il valide NOTRE contrat (routage, parsing, agregation, cache,
degradation gracieuse). Il ne valide AUCUNE semantique vendor Garage : quotas
reels, InspectObject sur donnees vivantes, statistiques de reparation, etc.
doivent etre verifies contre un vrai cluster.

Securite : Bearer obligatoire. Repondre 401 sans en-tete prouve que le proxy
transmet bien le token admin configure sur le projet.

Fixture : derivee du harnais MinIO (make dev-s3, tools/dev/seed-s3.sh), donc les
compteurs sont ceux que l'UI S3 affiche deja. Pour les regenerer :

    make dev-s3
    docker run --rm --network kexa-dev --entrypoint sh minio/mc -c \
      "mc alias set h http://kexa-s3:9000 kexa kexa-secret >/dev/null; \
       mc ls --recursive --json h/bot-creator"   # idem h/audio, h/config-bcm

Puis reporter la somme des `size` dans BUCKET_FIXTURE ci-dessous.

Usage : python3 tools/dev/garage-admin-mock.py [--port 3903]
Env   : MOCK_PORT (3903), MOCK_ADMIN_TOKEN (dev-admin-token)
"""

import argparse
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

MOCK_ADMIN_TOKEN = os.environ.get("MOCK_ADMIN_TOKEN", "dev-admin-token")
MOCK_PORT = int(os.environ.get("MOCK_PORT", "3903"))

# --------------------------------------------------------------------- fixture
# Genere par tools/dev/seed-s3.sh : 4 x 300000 B + 1 x 12000000 B dans
# bot-creator, 1 x 300000 B dans audio et config-bcm (7 objets, 13800000 B).
def _bucket(suffix, alias, created, objects, size, max_size=None):
    return {
        "id": suffix, "global_aliases": [alias], "created": created,
        "objects": objects, "bytes": size,
        "max_size": max_size, "max_objects": None,
    }


BUCKET_FIXTURE = [
    _bucket("b01c4e0a1d2f3a4b5c6d7e8f90112233445566778899aabbccddeeff00112233",
            "bot-creator", "2026-09-15T12:42:31.700Z", 5, 300000 * 4 + 12000000,
            max_size=5368709120),  # 5 GiB : bucket AVEC quota
    _bucket("a1d10e0a1d2f3a4b5c6d7e8f90112233445566778899aabbccddeeff00112233",
            "audio", "2026-09-15T12:42:32.000Z", 1, 300000),  # sans quota
    _bucket("c0f1bce0a1d2f3a4b5c6d7e8f90112233445566778899aabbccddeeff0011223",
            "config-bcm", "2026-09-15T12:42:31.900Z", 1, 300000),  # sans quota
]

NODE_A = "1111111111111111111111111111111111111111111111111111111111111111"
NODE_B = "2222222222222222222222222222222222222222222222222222222222222222"
NODE_C = "3333333333333333333333333333333333333333333333333333333333333333"

# Garage v2 nomme ce champ storageNodesUp (pas storageNodesOk) : on n'ajoute PAS
# l'alias, sinon le repli storageNodesUp -> storageNodesOk du proxy ne serait
# jamais exerce.
CLUSTER_HEALTH = {
    "status": "degraded", "connectedNodes": 2, "knownNodes": 3,
    "storageNodes": 3, "storageNodesUp": 2, "partitions": 256,
    "partitionsAllOk": 192, "partitionsQuorum": 256,
}


def _node(node_id, hostname, is_up, draining, zone, avail):
    node = {
        "id": node_id, "hostname": hostname, "isUp": is_up, "draining": draining,
        "addr": "10.0.0.%s:3901" % hostname[-1], "garageVersion": "v2.1.0",
        "dataPartition": {"available": avail, "total": 536870912000},
        "role": {"zone": zone, "capacity": 536870912000, "tags": ["ssd"] if is_up else []},
    }
    if not is_up:
        node["lastSeenSecsAgo"] = 4210
    return node


NODES = [
    _node(NODE_A, "garage-dev-1", True, False, "dc1", 480000000000),
    _node(NODE_B, "garage-dev-2", True, False, "dc1", 300000000000),
    _node(NODE_C, "garage-dev-3", False, True, "dc2", 0),  # noeud down + draining
]

CLUSTER_STATUS = {"layoutVersion": 7, "nodes": NODES}

CLUSTER_LAYOUT = {
    "version": 7,
    "partitionSize": 1073741824,
    "parameters": {"zoneRedundancy": {"atLeast": 1}},
    "stagedParameters": None,
    "stagedRoleChanges": [],
    "roles": [
        {"id": n["id"], "zone": n["role"]["zone"], "capacity": 536870912000,
         "tags": n["role"]["tags"], "storedPartitions": stored,
         "usableCapacity": stored * 1073741824}
        for n, stored in zip(NODES, (86, 85, 85))
    ],
}

# Le proxy n'accepte `parsed` que si la chaine freeform est un objet JSON valide.
CLUSTER_STATISTICS = {
    "clusterId": "f0c1e0a1d2f3a4b5c6d7e8f90112233445566778899aabbccddeeff00112233",
    "layoutVersion": 7,
    "nodeCount": 3,
    "partitions": {"total": 256, "allOk": 192, "quorum": 256},
    "objectBacklog": {"pendingInSync": 12, "pendingInResync": 0},
    "multipartUploads": {"inProgress": 0, "bytes": 0},
    "dataSize": {"available": 780000000000, "total": 1610612736000},
}

NODE_STATISTICS = {
    "nodeId": NODE_A,
    "hostname": "garage-dev-1",
    "garageVersion": "v2.1.0",
    "role": {"zone": "dc1", "capacity": 536870912000},
    "dataPartition": {"available": 480000000000, "total": 536870912000},
    "data": {"objects": 5, "bytes": 13200000},
    "partitions": {"stored": 86, "usableCapacity": 92341796864},
}


# ------------------------------------------------------------------- handlers
def freeform(payload) -> dict:
    """Enveloppe Garage : le detail est une CHAINE JSON, pas un objet."""
    return {"freeform": json.dumps(payload, separators=(",", ":"))}


def bucket_info(bucket) -> dict:
    """GetBucketInfoResponse, champ par champ (cf. front/src/types/openapi.ts)."""
    return {
        "id": bucket["id"],
        "created": bucket["created"],
        "globalAliases": bucket["global_aliases"],
        "localAliases": [],
        "objects": bucket["objects"],
        "bytes": bucket["bytes"],
        "quotas": {"maxSize": bucket["max_size"], "maxObjects": bucket["max_objects"]},
        "unfinishedUploads": 0,
        "unfinishedMultipartUploads": 0,
        "unfinishedMultipartUploadParts": 0,
        "unfinishedMultipartUploadBytes": 0,
        "keys": [
            {
                "accessKeyId": "GK31c2f218a2e44f485b94239e",
                "name": "kexa-dev",
                "bucketLocalAliases": [],
                "permissions": {"read": True, "write": True, "owner": True},
            },
            {
                "accessKeyId": "GK7d4a1f0b6c8e4d2a9b3c5e7f1a2b4c6",
                "name": "bot-creator-ro",
                "bucketLocalAliases": ["public"],
                "permissions": {"read": True, "write": False, "owner": False},
            },
        ],
        "websiteAccess": False,
        "websiteConfig": None,
    }


def _block(hash_, offset, part_number, size):
    return {"hash": hash_, "offset": offset, "partNumber": part_number, "size": size}


def inspect_object(bucket_id: str, key: str) -> dict:
    """InspectObjectResponse : 2 versions, dont une multi-blocs.

    La somme des `size` de la version 1 egale la taille reelle de l'objet cote
    MinIO (12000000 = 8388608 + 3611392) : le detail bloc par bloc reste coherent.
    """
    return {
        "bucketId": bucket_id,
        "key": key,
        "versions": [
            {
                "uuid": "v0000001-0000-0000-0000-000000000001",
                "etag": "6bec6becece5f36a4177056aa518fd34",
                "created": "2026-09-15T12:42:31.861Z",
                "deleteMarker": False, "aborted": False, "encrypted": False,
                "inline": False, "size": 12000000,
                "headers": [["content-type", "application/zip"]],
                "blocks": [
                    _block("9f2a1c3e5d7b0a48693f4c1e2d8b7a5061c3e5f70819a2b4c6d8e0f123456789",
                           0, 1, 8388608),
                    _block("1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809",
                           8388608, 2, 3611392),
                ],
            },
            {
                "uuid": "v0000002-0000-0000-0000-000000000002",
                "etag": "3247e2c41a504c53d577da7247bdb813",
                "created": "2026-09-15T12:42:31.788Z",
                "deleteMarker": False, "aborted": False, "encrypted": False,
                "inline": False, "size": 300000,
                "headers": [["content-type", "text/markdown; charset=utf-8"]],
                "blocks": [
                    _block("5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b",
                           0, 1, 300000),
                ],
            },
        ],
    }


class GarageAdminMock(BaseHTTPRequestHandler):
    server_version = "GarageAdminMock/dev"

    def log_message(self, fmt, *args):  # une ligne par appel, sans bruit d'adresse
        sys.stderr.write("[mock] %s %s\n" % (self.command, self.path))

    # -- garde d'authentification : aucune route n'est servie sans jeton valide --
    def _authorized(self) -> bool:
        return self.headers.get("Authorization", "") == "Bearer " + MOCK_ADMIN_TOKEN

    def _send(self, status: int, payload) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _reject(self) -> None:
        self._send(401, {"error": "unauthorized", "message": "missing or invalid Bearer token"})

    def _query(self) -> dict:
        return parse_qs(urlparse(self.path).query)

    def do_POST(self):
        path = urlparse(self.path).path
        if not self._authorized():
            return self._reject()
        if path == "/v2/ListBuckets":
            return self._send(200, [
                {"id": b["id"], "created": b["created"],
                 "globalAliases": b["global_aliases"], "localAliases": []}
                for b in BUCKET_FIXTURE
            ])
        return self._send(404, {"error": "not found", "path": path})

    def do_GET(self):
        path = urlparse(self.path).path
        if not self._authorized():
            return self._reject()
        if path == "/v2/GetClusterHealth":
            return self._send(200, CLUSTER_HEALTH)
        if path == "/v2/GetClusterStatus":
            return self._send(200, CLUSTER_STATUS)
        if path == "/v2/GetClusterLayout":
            return self._send(200, CLUSTER_LAYOUT)
        if path == "/v2/GetClusterStatistics":
            return self._send(200, freeform(CLUSTER_STATISTICS))
        if path == "/v2/GetNodeStatistics":
            return self._send(200, freeform(NODE_STATISTICS))
        if path == "/v2/GetBucketInfo":
            bucket_id = self._query().get("id", [""])[0]
            for bucket in BUCKET_FIXTURE:
                if bucket["id"] == bucket_id:
                    return self._send(200, bucket_info(bucket))
            return self._send(404, {"error": "NoSuchBucket", "id": bucket_id})
        if path == "/v2/InspectObject":
            query = self._query()
            bucket_id = query.get("bucket_id", [""])[0]
            key = query.get("key", [""])[0]
            if not bucket_id or not key:
                return self._send(400, {"error": "bucket_id and key are required"})
            return self._send(200, inspect_object(bucket_id, key))
        return self._send(404, {"error": "not found", "path": path})


def main() -> int:
    parser = argparse.ArgumentParser(description="Mock dev de l'API admin Garage v2")
    parser.add_argument("--port", type=int, default=MOCK_PORT)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("0.0.0.0", args.port), GarageAdminMock)
    print("Garage admin MOCK listening on :%d (token=%s)" % (args.port, MOCK_ADMIN_TOKEN), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
