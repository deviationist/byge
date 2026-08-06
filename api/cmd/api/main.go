// Command api is byge's upstream proxy.
//
// It exists for three reasons, none of which can be solved in a browser:
//
//   - thredds.met.no sends no CORS headers on any of its service paths, so the
//     gridded radar product — the source data the whole disc model needs — is
//     unreachable from a web page.
//   - MET's terms require an identifying User-Agent, and `User-Agent` is a
//     forbidden header in the Fetch API. A browser physically cannot comply.
//   - MET ask that clients not hammer them. One cached fetch serving every
//     client is the behaviour they want, and it is only expressible server-side.
//
// It is stateless on purpose. No database, no sessions, no coordinates written
// anywhere — so "no account, no sync, everything stays on this device" remains
// literally true of byge, which is not something a notification backend could
// have preserved.
package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/deviationist/byge/api/internal/cache"
	"github.com/deviationist/byge/api/internal/config"
	"github.com/deviationist/byge/api/internal/handler"
	"github.com/deviationist/byge/api/internal/ratelimit"
	"github.com/deviationist/byge/api/internal/upstream"
	"github.com/deviationist/byge/api/internal/warm"
)

// healthcheck probes a running instance and exits non-zero if it is unwell.
// It lives in the binary because the runtime image is distroless — no shell,
// no curl — so the app is the only thing available to check the app.
func healthcheck(addr string) {
	if strings.HasPrefix(addr, "0.0.0.0:") {
		addr = "127.0.0.1:" + strings.TrimPrefix(addr, "0.0.0.0:")
	}
	c := &http.Client{Timeout: 5 * time.Second}
	res, err := c.Get("http://" + addr + "/health")
	if err != nil || res.StatusCode != http.StatusOK {
		os.Exit(1)
	}
	os.Exit(0)
}

func main() {
	probe := flag.Bool("healthcheck", false, "probe a running instance and exit")
	flag.Parse()

	log := slog.New(slog.NewTextHandler(os.Stdout, nil))

	cfg, err := config.Load()
	if err != nil {
		log.Error("configuration", "err", err)
		os.Exit(1)
	}

	if *probe {
		healthcheck(cfg.Addr)
	}

	c := cache.New(cfg.CacheTTLOK, cfg.CacheTTLMiss, cfg.CacheMaxBytes)
	up := upstream.New(&http.Client{Timeout: cfg.UpstreamTimeout}, cfg.UserAgent, cfg.MaxInflight)
	rl := ratelimit.New(cfg.RatePerMinute, cfg.RateBurst)
	h := handler.New(c, up, rl, handler.Options{
		AllowedOrigins:    cfg.AllowedOrigins,
		ClientKey:         cfg.ClientKey,
		MaxValues:         cfg.MaxValues,
		TrustProxyHeaders: cfg.TrustProxyHeaders,
		ExposeCacheHeader: cfg.Env == "development",
	}, log)

	// Keeps the frame store ahead of whoever is using the map, and stays quiet
	// when nobody is — see internal/warm for why that condition is not
	// optional. Cancelled with the server, so a shutdown does not leave a
	// goroutine pulling 14 MB frames into a store nothing will read.
	warmCtx, stopWarm := context.WithCancel(context.Background())
	defer stopWarm()
	go warm.New(h.Frames(), h.LatestAnalysis, warm.Defaults(), log).Run(warmCtx)

	// Idle rate-limit buckets carry no state worth keeping; sweeping them is
	// what stops the map growing for every IP that ever visited.
	go func() {
		t := time.NewTicker(10 * time.Minute)
		defer t.Stop()
		for range t.C {
			rl.Sweep(30 * time.Minute)
		}
	}()

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           h.Routes(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Info("listening", "addr", cfg.Addr, "cacheTTLOK", cfg.CacheTTLOK.String(), "cacheTTLMiss", cfg.CacheTTLMiss.String())
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("server", "err", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Error("shutdown", "err", err)
	}
	log.Info("stopped")
}
