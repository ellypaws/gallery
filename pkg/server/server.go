package server

import (
	"context"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"gallery/pkg/auth"
	"gallery/pkg/config"
	"gallery/pkg/media"

	"github.com/charmbracelet/log"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

type App struct {
	cfg    config.Config
	echo   *echo.Echo
	logger *log.Logger
}

func New(cfg config.Config, logger *log.Logger, mediaService *media.Service) *App {
	e := echo.New()
	e.HideBanner = true
	e.Use(middleware.Recover())
	e.Use(middleware.Gzip())

	handler := media.NewHandler(cfg, mediaService)
	e.GET("/healthz", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	})
	e.GET("/api/gallery", handler.GetGallery)

	adminAuth := auth.BasicAuth(cfg)
	adminAPI := e.Group("/api/admin", adminAuth)
	adminAPI.POST("/upload", handler.Upload)
	adminAPI.POST("/rescan", handler.Rescan)
	adminAPI.PATCH("/photos/:id", handler.PatchPhoto)

	e.GET("/admin", serveSPA(cfg), adminAuth)
	e.GET("/admin/*", serveSPA(cfg), adminAuth)
	e.Static("/media/originals", cfg.MediaDir)
	e.Static("/media/cache", cfg.CacheDir)
	e.GET("/*", serveSPA(cfg))

	return &App{cfg: cfg, echo: e, logger: logger}
}

func (a *App) Start() error {
	a.logger.Info("starting gallery", "addr", a.cfg.Addr(), "media_dir", a.cfg.MediaDir)
	if err := a.echo.Start(a.cfg.Addr()); err != nil && err != http.ErrServerClosed {
		return err
	}
	return nil
}

func (a *App) Shutdown(ctx context.Context) error {
	return a.echo.Shutdown(ctx)
}

func serveSPA(cfg config.Config) echo.HandlerFunc {
	indexPath := filepath.Join(cfg.FrontendDistDir, "index.html")
	return func(c echo.Context) error {
		requested := strings.TrimPrefix(c.Request().URL.Path, "/")
		if requested != "" {
			candidate := filepath.Join(cfg.FrontendDistDir, filepath.FromSlash(requested))
			if stat, err := os.Stat(candidate); err == nil && !stat.IsDir() {
				return c.File(candidate)
			}
		}

		if _, err := os.Stat(indexPath); err != nil {
			return c.String(http.StatusServiceUnavailable, "frontend build missing; run bun run build in app/")
		}

		return c.File(indexPath)
	}
}
