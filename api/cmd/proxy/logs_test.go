package main

import (
	"net/http"
	"testing"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestAdminActionName(t *testing.T) {
	cases := map[string]string{
		"CreateBucket":       "create_bucket",
		"AllowBucketKey":     "allow_bucket_key",
		"ApplyClusterLayout": "apply_cluster_layout",
	}
	for in, want := range cases {
		if got := adminActionName(in); got != want {
			t.Errorf("adminActionName(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestIsAdminMutation(t *testing.T) {
	if isAdminMutation(http.MethodGet, "CreateBucket") {
		t.Error("GET is never a mutation")
	}
	if isAdminMutation(http.MethodPost, "ListWorkers") || isAdminMutation(http.MethodPost, "GetBlockInfo") {
		t.Error("read-only POST endpoints are not mutations")
	}
	if !isAdminMutation(http.MethodPost, "DeleteKey") {
		t.Error("DeleteKey is a mutation")
	}
}

func TestAdminLogDetailsSkipsSecrets(t *testing.T) {
	body := []byte(`{"name":"backup","secretAccessKey":"s3cr3t","accessKeyId":"GK1","blockHashes":["a","b"]}`)
	got := adminLogDetails(map[string][]string{"id": {"abc"}}, body)
	want := "id=abc, name=backup, accessKeyId=GK1, blockHashes=2 item(s)"
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestParseLogSince(t *testing.T) {
	now := time.Date(2026, 10, 9, 12, 0, 0, 0, time.UTC)
	if got, ok := parseLogSince("7d", now); !ok || !got.Equal(now.Add(-7*24*time.Hour)) {
		t.Errorf("7d parsed to %v %v", got, ok)
	}
	if got, ok := parseLogSince("24h", now); !ok || !got.Equal(now.Add(-24*time.Hour)) {
		t.Errorf("24h parsed to %v %v", got, ok)
	}
	if _, ok := parseLogSince("bogus", now); ok {
		t.Error("bogus must not parse")
	}
}

func TestFilteredLogsJoinsUsernames(t *testing.T) {
	testDB, err := gorm.Open(sqlite.Open("file::memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := testDB.AutoMigrate(&User{}, &ProjectLog{}); err != nil {
		t.Fatal(err)
	}
	previous := db
	db = testDB
	defer func() { db = previous }()

	alice := User{Username: "alice", Password: "x"}
	testDB.Create(&alice)
	LogActivity(testDB, 1, alice.ID, "create_bucket", "name=photos", "success")
	LogActivity(testDB, 1, 0, "delete_key", "id=GK1", "error")
	LogActivity(testDB, 2, alice.ID, "create_bucket", "name=other", "success")

	var all []LogEntry
	if err := filteredLogs(1, map[string][]string{}, time.Now()).Order("project_logs.id").Scan(&all).Error; err != nil {
		t.Fatal(err)
	}
	if len(all) != 2 || all[0].Username != "alice" || all[1].Username != "" {
		t.Fatalf("unexpected entries %+v", all)
	}

	var errorsOnly []LogEntry
	filteredLogs(1, map[string][]string{"status": {"error"}}, time.Now()).Scan(&errorsOnly)
	if len(errorsOnly) != 1 || errorsOnly[0].Action != "delete_key" {
		t.Fatalf("status filter: %+v", errorsOnly)
	}

	var search []LogEntry
	filteredLogs(1, map[string][]string{"q": {"PHOTOS"}, "user": {"1"}}, time.Now()).Scan(&search)
	if len(search) != 1 || search[0].Details != "name=photos" {
		t.Fatalf("search filter: %+v", search)
	}
}
