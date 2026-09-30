package main

import (
	"errors"
	"fmt"
	"mime"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

func init() {
	// Windowsではレジストリ次第で .js が text/plain になるため固定する
	for ext, typ := range map[string]string{
		".html": "text/html; charset=utf-8",
		".htm":  "text/html; charset=utf-8",
		".js":   "text/javascript; charset=utf-8",
		".mjs":  "text/javascript; charset=utf-8",
		".css":  "text/css; charset=utf-8",
		".json": "application/json; charset=utf-8",
		".wasm": "application/wasm",
		".svg":  "image/svg+xml",
		".png":  "image/png",
		".jpg":  "image/jpeg",
		".jpeg": "image/jpeg",
		".gif":  "image/gif",
		".webp": "image/webp",
		".mp3":  "audio/mpeg",
		".ogg":  "audio/ogg",
		".wav":  "audio/wav",
		".mp4":  "video/mp4",
		".webm": "video/webm",
	} {
		_ = mime.AddExtensionType(ext, typ)
	}
}

// safeFS は dist 配下のみを公開する。ドットで始まる名前と index.html のないディレクトリは見せない。
type safeFS struct{ root http.Dir }

func (s safeFS) Open(name string) (http.File, error) {
	for _, seg := range strings.Split(name, "/") {
		if strings.HasPrefix(seg, ".") {
			return nil, os.ErrNotExist
		}
	}
	f, err := s.root.Open(name)
	if err != nil {
		return nil, err
	}
	st, err := f.Stat()
	if err != nil {
		f.Close()
		return nil, err
	}
	if st.IsDir() {
		idx, err := s.root.Open(filepath.ToSlash(filepath.Join(name, "index.html")))
		if err != nil {
			f.Close()
			return nil, os.ErrNotExist
		}
		idx.Close()
	}
	return f, nil
}

func newHandler(distDir string) http.Handler {
	files := http.FileServer(safeFS{http.Dir(distDir)})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !hostAllowed(r.Host) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		h := w.Header()
		h.Set("Cache-Control", "no-cache")
		h.Set("X-Content-Type-Options", "nosniff")
		files.ServeHTTP(w, r)
	})
}

// hostAllowed は DNS rebinding 対策として Host を 127.0.0.1 / localhost に限定する。
func hostAllowed(hostport string) bool {
	host := hostport
	if h, _, err := net.SplitHostPort(hostport); err == nil {
		host = h
	}
	return host == "127.0.0.1" || strings.EqualFold(host, "localhost")
}

// listenPreferred は preferred を優先し、使用中の場合のみ後続の番号、最後にOS任せの空きポートを使う。
func listenPreferred(preferred, tries int) (net.Listener, error) {
	for p := preferred; p < preferred+tries && p <= 65535; p++ {
		if l, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", p)); err == nil {
			return l, nil
		}
	}
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, errors.New("空きポートが見つかりません: " + err.Error())
	}
	return l, nil
}
