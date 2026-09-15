package s3

import (
	"errors"
	"testing"

	"github.com/minio/minio-go/v7"
)

// listingObject construit une entree de listing minimale.
func listingObject(key string, size int64, class string) minio.ObjectInfo {
	return minio.ObjectInfo{Key: key, Size: size, StorageClass: class}
}

// fakeListing sert des pages predeterminees : les pages sont servies dans l'ordre
// pour le listing recursif, les prefixes pour l'appel a delimiter="/".
type fakeListing struct {
	pages          []minio.ListBucketV2Result
	prefixes       []minio.CommonPrefix
	err            error
	prefixErr      error
	calls          int
	seenMaxKeys    int
	seenDelimiters []string
}

func (f *fakeListing) source() objectPageSource {
	return func(prefix, token, delimiter string, maxKeys int) (minio.ListBucketV2Result, error) {
		f.calls++
		f.seenMaxKeys = maxKeys
		f.seenDelimiters = append(f.seenDelimiters, delimiter)

		if f.err != nil {
			return minio.ListBucketV2Result{}, f.err
		}
		if delimiter == "/" {
			if f.prefixErr != nil {
				return minio.ListBucketV2Result{}, f.prefixErr
			}
			return minio.ListBucketV2Result{CommonPrefixes: f.prefixes, Delimiter: delimiter}, nil
		}
		if len(f.pages) == 0 {
			return minio.ListBucketV2Result{}, nil
		}
		page := f.pages[0]
		f.pages = f.pages[1:]
		return page, nil
	}
}

func TestNormalizeUsageLimits(t *testing.T) {
	cases := []struct {
		name                   string
		req                    BucketUsageRequest
		wantObjects, wantBucke int
	}{
		{name: "requete muette", req: BucketUsageRequest{}, wantObjects: defaultMaxObjectsPerBucket, wantBucke: defaultMaxBuckets},
		{name: "demande explicite", req: BucketUsageRequest{MaxObjectsPerBucket: 2, MaxBuckets: 3}, wantObjects: 2, wantBucke: 3},
		{name: "valeurs negatives", req: BucketUsageRequest{MaxObjectsPerBucket: -1, MaxBuckets: -5}, wantObjects: defaultMaxObjectsPerBucket, wantBucke: defaultMaxBuckets},
		{name: "au dessus du plafond absolu", req: BucketUsageRequest{MaxObjectsPerBucket: 100000, MaxBuckets: 1000}, wantObjects: hardMaxObjectsPerBucket, wantBucke: hardMaxBuckets},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			maxObjects, maxBuckets := normalizeUsageLimits(tc.req)
			if maxObjects != tc.wantObjects || maxBuckets != tc.wantBucke {
				t.Fatalf("bornes = %d/%d, attendu %d/%d", maxObjects, maxBuckets, tc.wantObjects, tc.wantBucke)
			}
		})
	}
}

func TestBucketUsageOfPlafondAtteint(t *testing.T) {
	listing := &fakeListing{pages: []minio.ListBucketV2Result{{
		Contents: []minio.ObjectInfo{
			listingObject("a.bin", 100, "STANDARD"),
			listingObject("b.bin", 200, "STANDARD"),
			listingObject("c.bin", 300, ""),
			listingObject("d.bin", 400, ""),
		},
	}}}

	usage := bucketUsageOf("bot-creator", 2, listing.source())

	if usage.Objects != 2 || usage.Bytes != 300 {
		t.Errorf("compteurs = %d objets / %d octets, attendu 2 / 300 (somme partielle exacte)", usage.Objects, usage.Bytes)
	}
	if usage.Complete {
		t.Error("Complete = true, want false quand le plafond d'objets est atteint")
	}
	if usage.Error != nil {
		t.Errorf("Error = %q, un plafond atteint n'est pas une erreur S3", *usage.Error)
	}
	if got := usage.StorageClasses["STANDARD"]; got.Objects != 2 || got.Bytes != 300 {
		t.Errorf("storageClasses[STANDARD] = %+v, attendu 2 objets / 300 octets", got)
	}
	if listing.seenMaxKeys != usagePageSize {
		t.Errorf("maxKeys envoye = %d, attendu %d", listing.seenMaxKeys, usagePageSize)
	}
}

func TestBucketUsageOfComplet(t *testing.T) {
	listing := &fakeListing{pages: []minio.ListBucketV2Result{
		{
			Contents: []minio.ObjectInfo{
				listingObject("a.bin", 100, "STANDARD"),
				listingObject("b.bin", 200, "STANDARD"),
			},
			IsTruncated:           true,
			NextContinuationToken: "jeton-1",
		},
		{
			Contents: []minio.ObjectInfo{listingObject("c.bin", 300, "GLACIER")},
		},
	}}

	usage := bucketUsageOf("bot-creator", defaultMaxObjectsPerBucket, listing.source())

	if usage.Objects != 3 || usage.Bytes != 600 {
		t.Errorf("compteurs = %d objets / %d octets, attendu 3 / 600", usage.Objects, usage.Bytes)
	}
	if !usage.Complete {
		t.Error("Complete = false, want true quand le listing n'est plus tronque")
	}
	if got := usage.StorageClasses["STANDARD"]; got.Objects != 2 || got.Bytes != 300 {
		t.Errorf("storageClasses[STANDARD] = %+v, attendu 2 objets / 300 octets", got)
	}
	if got := usage.StorageClasses["GLACIER"]; got.Objects != 1 || got.Bytes != 300 {
		t.Errorf("storageClasses[GLACIER] = %+v, attendu 1 objet / 300 octets", got)
	}
}

func TestBucketUsageOfJetonManquant(t *testing.T) {
	listing := &fakeListing{pages: []minio.ListBucketV2Result{{
		Contents:    []minio.ObjectInfo{listingObject("a.bin", 100, "STANDARD")},
		IsTruncated: true,
	}}}

	usage := bucketUsageOf("bot-creator", defaultMaxObjectsPerBucket, listing.source())

	if usage.Error == nil {
		t.Fatal("Error = nil, attendu une erreur quand le listing tronque ne peut pas avancer")
	}
	if usage.Complete {
		t.Error("Complete = true, want false quand le listing ne peut pas avancer")
	}
	if usage.Objects != 1 {
		t.Errorf("objets = %d, attendu 1 (le partiel deja mesure est conserve)", usage.Objects)
	}
}

func TestBucketUsageOfErreurLocale(t *testing.T) {
	listing := &fakeListing{err: errors.New("AccessDenied")}

	usage := bucketUsageOf("bot-creator", defaultMaxObjectsPerBucket, listing.source())

	if usage.Error == nil || *usage.Error != "AccessDenied" {
		t.Fatalf("Error = %v, attendu le message du backend", usage.Error)
	}
	if usage.Complete || usage.Objects != 0 || usage.Prefixes != 0 {
		t.Errorf("releve = %+v, attendu vide et incomplet", usage)
	}
}

func TestBucketUsageOfCompteLesPrefixes(t *testing.T) {
	listing := &fakeListing{
		pages: []minio.ListBucketV2Result{{
			Contents: []minio.ObjectInfo{listingObject("readme.md", 300, ""), listingObject("index.html", 100, "")},
		}},
		prefixes: []minio.CommonPrefix{{Prefix: "audio/"}, {Prefix: "releases/"}, {Prefix: "tmp/"}},
	}

	usage := bucketUsageOf("bot-creator", defaultMaxObjectsPerBucket, listing.source())

	if usage.Prefixes != 3 {
		t.Errorf("prefixes = %d, attendu 3 (prefixes de premier niveau)", usage.Prefixes)
	}
	if usage.Objects != 2 || usage.Bytes != 400 {
		t.Errorf("compteurs = %d objets / %d octets, attendu 2 / 400", usage.Objects, usage.Bytes)
	}
	if !usage.Complete || usage.Error != nil {
		t.Errorf("releve = %+v, attendu complet et sans erreur", usage)
	}
	if len(usage.StorageClasses) != 0 {
		t.Errorf("storageClasses = %v, attendu vide quand le backend n'annonce aucune classe", usage.StorageClasses)
	}
	if len(listing.seenDelimiters) != 2 || listing.seenDelimiters[1] != "/" {
		t.Errorf("delimiter envoye = %v, attendu un appel a delimiter=\"/\" pour les prefixes", listing.seenDelimiters)
	}
}

func TestBucketUsageOfErreurDePrefixes(t *testing.T) {
	listing := &fakeListing{
		pages: []minio.ListBucketV2Result{{
			Contents: []minio.ObjectInfo{listingObject("readme.md", 300, "STANDARD")},
		}},
		prefixErr: errors.New("listing des prefixes impossible"),
	}

	usage := bucketUsageOf("bot-creator", defaultMaxObjectsPerBucket, listing.source())

	if usage.Error == nil {
		t.Fatal("Error = nil, attendu un message quand le listing des prefixes echoue")
	}
	if usage.Complete {
		t.Error("Complete = true, want false pour un bucket en erreur")
	}
	if usage.Objects != 1 || usage.Prefixes != 0 {
		t.Errorf("releve = %+v, attendu 1 objet mesure et 0 prefixe", usage)
	}
}

func TestAggregateBucketUsagePartiel(t *testing.T) {
	t.Run("un bucket en erreur", func(t *testing.T) {
		message := "AccessDenied"
		totals := aggregateBucketUsage([]BucketUsageBucket{
			{Name: "a", Objects: 5, Bytes: 13200000, Complete: true},
			{Name: "b", Objects: 2, Bytes: 600, Complete: true},
			{Name: "c", Objects: 7, Bytes: 700, Complete: false, Error: &message},
		})

		if totals.Buckets != 3 {
			t.Errorf("buckets = %d, attendu 3", totals.Buckets)
		}
		if totals.Objects != 14 || totals.Bytes != 13201300 {
			t.Errorf("sommes = %d objets / %d octets, attendu les totaux partiels 14 / 13201300", totals.Objects, totals.Bytes)
		}
		if totals.BucketsComplete {
			t.Error("bucketsComplete = true, want false quand un bucket est en erreur")
		}
		if totals.ObjectsComplete {
			t.Error("objectsComplete = true, want false quand un bucket est en erreur")
		}
	})

	t.Run("tous les buckets complets", func(t *testing.T) {
		totals := aggregateBucketUsage([]BucketUsageBucket{
			{Name: "a", Objects: 5, Bytes: 13200000, Complete: true},
			{Name: "b", Objects: 2, Bytes: 600, Complete: true},
		})

		if !totals.ObjectsComplete || !totals.BucketsComplete {
			t.Errorf("totaux = %+v, attendu complet sur tous les axes", totals)
		}
		if totals.Objects != 7 || totals.Bytes != 13200600 {
			t.Errorf("sommes = %d objets / %d octets, attendu 7 / 13200600", totals.Objects, totals.Bytes)
		}
	})

	t.Run("aucun bucket mesure", func(t *testing.T) {
		totals := aggregateBucketUsage(nil)
		if totals.Buckets != 0 || totals.Objects != 0 || totals.Bytes != 0 {
			t.Errorf("totaux = %+v, attendu des zeros", totals)
		}
		if !totals.ObjectsComplete || !totals.BucketsComplete {
			t.Error("aucun bucket mesure n'est pas un releve incomplet")
		}
	})
}
