// html-game-launcher: dist を 127.0.0.1 のみで配信し、既定ブラウザで開く。
package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"syscall"
	"time"
)

const defaultPort = 18080

func openBrowser(url string) error {
	switch runtime.GOOS {
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		return exec.Command("open", url).Start()
	default:
		return exec.Command("xdg-open", url).Start()
	}
}

func setupLog(dir string) {
	f, err := os.Create(filepath.Join(dir, "launcher.log"))
	if err != nil {
		f, err = os.Create(filepath.Join(os.TempDir(), "html-game-launcher.log"))
	}
	if err == nil {
		// Windows(windowsgui)では stderr が無効なため、ファイルを先に書く
		log.SetOutput(io.MultiWriter(f, os.Stderr))
	}
}

func main() {
	exe, _ := os.Executable()
	exeDir := filepath.Dir(exe)
	distFlag := flag.String("dist", "", "配信するdistフォルダ（既定: 実行ファイルと同じ場所の dist）")
	port := flag.Int("port", defaultPort, "優先ポート（使用中の場合のみ別番号）")
	noBrowser := flag.Bool("no-browser", false, "ブラウザを自動で開かない")
	flag.Parse()

	setupLog(exeDir)

	dist := *distFlag
	if dist == "" {
		dist = filepath.Join(exeDir, "dist")
		if _, err := os.Stat(dist); err != nil {
			dist = "dist"
		}
	}
	if _, err := os.Stat(filepath.Join(dist, "index.html")); err != nil {
		log.Fatalf("dist が見つかりません（index.html がありません）: %s", dist)
	}

	ln, err := listenPreferred(*port, 20)
	if err != nil {
		log.Fatal(err)
	}
	actual := ln.Addr().(*net.TCPAddr).Port
	url := fmt.Sprintf("http://127.0.0.1:%d/", actual)
	log.Printf("dist: %s", dist)
	log.Printf("起動: %s", url)
	if actual != *port {
		log.Printf("ポート %d は使用中のため %d を使用", *port, actual)
	}

	srv := &http.Server{Handler: newHandler(dist), ReadHeaderTimeout: 10 * time.Second}
	go func() {
		if !*noBrowser {
			if err := openBrowser(url); err != nil {
				log.Printf("ブラウザを開けませんでした。手動で開いてください: %s (%v)", url, err)
			}
		}
	}()

	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
		<-sig
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		srv.Shutdown(ctx)
	}()

	if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
