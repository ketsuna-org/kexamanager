package s3

import (
	"testing"
	"time"
)

func TestPresignExpiry(t *testing.T) {
	cases := []struct {
		seconds int64
		want    time.Duration
	}{
		{0, 15 * time.Minute},
		{-5, 15 * time.Minute},
		{10, time.Minute},
		{3600, time.Hour},
		{7 * 24 * 3600, 7 * 24 * time.Hour},
		{30 * 24 * 3600, 7 * 24 * time.Hour},
	}
	for _, c := range cases {
		if got := presignExpiry(c.seconds); got != c.want {
			t.Errorf("presignExpiry(%d) = %s, want %s", c.seconds, got, c.want)
		}
	}
}

func TestPresignParams(t *testing.T) {
	if presignParams(GetObjectRequest{Key: "a/b.txt"}) != nil {
		t.Fatal("no params expected without download")
	}
	got := presignParams(GetObjectRequest{Key: "a/b.txt", Download: true}).Get("response-content-disposition")
	if got != `attachment; filename="b.txt"` {
		t.Fatalf("unexpected disposition %q", got)
	}
}
