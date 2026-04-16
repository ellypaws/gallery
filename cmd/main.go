package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"time"

	"gallery/pkg/config"
	"gallery/pkg/db"
	"gallery/pkg/media"
	"gallery/pkg/server"
	"gallery/pkg/utils"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}

	logger := utils.NewLogger(cfg.AppEnv)

	gormDB, err := db.Open(cfg)
	if err != nil {
		logger.Fatal("database init failed", "err", err)
	}

	mediaService := media.NewService(cfg, gormDB, logger)
	if err := mediaService.SyncLibrary(context.Background()); err != nil {
		logger.Error("initial media sync failed", "err", err)
	}
	watchCtx, watchCancel := context.WithCancel(context.Background())
	defer watchCancel()
	if err := mediaService.StartWatcher(watchCtx); err != nil {
		logger.Error("media watcher failed to start", "err", err)
	}

	app := server.New(cfg, logger, mediaService)

	go func() {
		if err := app.Start(); err != nil {
			logger.Fatal("server exited with error", "err", err)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	watchCancel()

	if err := app.Shutdown(ctx); err != nil {
		logger.Error("shutdown failed", "err", err)
	}
}
