package server

import (
	"context"
	"io/fs"
	"mime"
	"net/http"
	"path"
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

	e.GET("/admin", serveSPA(), adminAuth)
	e.GET("/admin/*", serveSPA(), adminAuth)
	e.GET("/media/originals/*", serveMedia(cfg.MediaDir))
	e.GET("/media/cache/*", serveMedia(cfg.CacheDir))
	e.GET("/*", serveSPA())

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

func serveSPA() echo.HandlerFunc {
	frontendFS, err := fs.Sub(embeddedDist, "dist")
	if err != nil {
		panic(err)
	}

	return func(c echo.Context) error {
		requested := path.Clean(strings.TrimPrefix(c.Request().URL.Path, "/"))
		if requested == "." {
			requested = ""
		}

		if requested != "" && !strings.HasPrefix(requested, "admin") {
			if stat, err := fs.Stat(frontendFS, requested); err == nil && !stat.IsDir() {
				return serveEmbeddedFile(c, frontendFS, requested)
			}
		}

		return serveEmbeddedFile(c, frontendFS, "index.html")
	}
}

func serveEmbeddedFile(c echo.Context, filesystem fs.FS, name string) error {
	data, err := fs.ReadFile(filesystem, name)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "asset not found")
	}

	contentType := mime.TypeByExtension(filepath.Ext(name))
	if contentType == "" {
		contentType = http.DetectContentType(data)
	}

	return c.Blob(http.StatusOK, contentType, data)
}

func serveMedia(baseDir string) echo.HandlerFunc {
	return func(c echo.Context) error {
		p := c.Param("*")
		if p == "" {
			return c.NoContent(http.StatusNotFound)
		}

		cleanPath := filepath.Clean("/" + p)
		filePath := filepath.Join(baseDir, cleanPath)

		c.Response().Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		return c.File(filePath)
	}
}
