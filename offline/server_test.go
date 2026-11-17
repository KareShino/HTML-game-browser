package main

import (
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func setup(t *testing.T) http.Handler {
	t.Helper()
	d := t.TempDir()
	must := func(err error) {
		if err != nil {
			t.Fatal(err)
		}
	}
	must(os.MkdirAll(filepath.Join(d, "games", "a"), 0o755))
	must(os.MkdirAll(filepath.Join(d, "games", "noindex"), 0o755))
	must(os.WriteFile(filepath.Join(d, "index.html"), []byte("root"), 0o644))
	must(os.WriteFile(filepath.Join(d, "games", "a", "index.html"), []byte("game-a"), 0o644))
	must(os.WriteFile(filepath.Join(d, "games", "a", "x.js"), []byte("1"), 0o644))
	must(os.WriteFile(filepath.Join(d, "games", "noindex", "f.txt"), []byte("f"), 0o644))
	must(os.WriteFile(filepath.Join(d, ".secret"), []byte("s"), 0o644))
	// dist の外にあるファイル
	must(os.WriteFile(filepath.Join(filepath.Dir(d), "outside.txt"), []byte("out"), 0o644))
	return newHandler(d)
}

func get(h http.Handler, method, path, host string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, nil)
	r.Host = host
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func TestServe(t *testing.T) {
	h := setup(t)
	cases := []struct {
		method, path, host string
		code               int
	}{
		{"GET", "/", "127.0.0.1:18080", 200},
		{"GET", "/games/a/", "localhost:18080", 200},
		{"GET", "/games/a/index.html", "127.0.0.1:1", 301}, // FileServer は /index.html を ./ にリダイレクト
		{"GET", "/games/a/x.js", "127.0.0.1:1", 200},
		{"GET", "/games/noindex/", "127.0.0.1:1", 404},
		{"GET", "/games/", "127.0.0.1:1", 404},
		{"GET", "/.secret", "127.0.0.1:1", 404},
		{"GET", "/../outside.txt", "127.0.0.1:1", 404},
		{"GET", "/games/../../outside.txt", "127.0.0.1:1", 404},
		{"GET", "/%2e%2e/outside.txt", "127.0.0.1:1", 404},
		{"GET", "/games/a/..%5c..%5coutside.txt", "127.0.0.1:1", 404},
		{"GET", "/", "evil.example.com", 403},
		{"GET", "/", "127.0.0.1.evil.com:80", 403},
		{"POST", "/", "127.0.0.1:1", 405},
	}
	for _, c := range cases {
		if got := get(h, c.method, c.path, c.host).Code; got != c.code {
			t.Errorf("%s %s (Host %s): got %d want %d", c.method, c.path, c.host, got, c.code)
		}
	}
	if ct := get(h, "GET", "/games/a/x.js", "127.0.0.1:1").Header().Get("Content-Type"); ct != "text/javascript; charset=utf-8" {
		t.Errorf("js content-type = %q", ct)
	}
}

func TestAlreadyRunning(t *testing.T) {
	srv := httptest.NewServer(setup(t))
	defer srv.Close()
	port := srv.Listener.Addr().(*net.TCPAddr).Port
	if !alreadyRunning(port) {
		t.Fatal("running launcher not detected")
	}
	// 無関係なサーバー（識別ヘッダなし）と、何も動いていないポートは false
	other := httptest.NewServer(http.NotFoundHandler())
	defer other.Close()
	if alreadyRunning(other.Listener.Addr().(*net.TCPAddr).Port) {
		t.Fatal("foreign server detected as launcher")
	}
	l, _ := net.Listen("tcp", "127.0.0.1:0")
	free := l.Addr().(*net.TCPAddr).Port
	l.Close()
	if alreadyRunning(free) {
		t.Fatal("closed port detected as launcher")
	}
}

func TestListenFallback(t *testing.T) {
	l1, err := listenPreferred(28080, 5)
	if err != nil {
		t.Fatal(err)
	}
	defer l1.Close()
	if p := l1.Addr().(*net.TCPAddr).Port; p != 28080 {
		t.Fatalf("free preferred port not used: %d", p)
	}
	l2, err := listenPreferred(28080, 5)
	if err != nil {
		t.Fatal(err)
	}
	defer l2.Close()
	if p := l2.Addr().(*net.TCPAddr).Port; p == 28080 || p != 28081 {
		t.Fatalf("expected fallback 28081, got %d", p)
	}
	if !l2.Addr().(*net.TCPAddr).IP.IsLoopback() {
		t.Fatal("not loopback")
	}
}
