package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	AppEnv    string
	Port      string
	SiteTitle string
	MediaDir  string
	DataDir   string
	CacheDir  string
	DBPath    string
	AdminUser string
	AdminPass string
}

func Load() (Config, error) {
	_ = godotenv.Load()

	root, err := os.Getwd()
	if err != nil {
		return Config{}, fmt.Errorf("get cwd: %w", err)
	}

	dataDir := envOr("DATA_DIR", filepath.Join(root, "data"))
	cacheDir := envOr("CACHE_DIR", filepath.Join(dataDir, "cache"))
	cfg := Config{
		AppEnv:    envOr("APP_ENV", "development"),
		Port:      envOr("PORT", "8080"),
		SiteTitle: envOr("SITE_TITLE", "Elly"),
		MediaDir:  envOr("MEDIA_DIR", filepath.Join(root, "photos")),
		DataDir:   dataDir,
		CacheDir:  cacheDir,
		DBPath:    envOr("DB_PATH", filepath.Join(dataDir, "gallery.db")),
		AdminUser: envOr("ADMIN_USER", "gallery"),
		AdminPass: envOr("ADMIN_PASS", "gallery"),
	}

	for _, dir := range []string{cfg.MediaDir, cfg.DataDir, cfg.CacheDir} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return Config{}, fmt.Errorf("ensure dir %s: %w", dir, err)
		}
	}

	cfg.MediaDir = filepath.Clean(cfg.MediaDir)
	cfg.DataDir = filepath.Clean(cfg.DataDir)
	cfg.CacheDir = filepath.Clean(cfg.CacheDir)
	cfg.DBPath = filepath.Clean(cfg.DBPath)

	return cfg, nil
}

func (c Config) Addr() string {
	return ":" + c.Port
}

func (c Config) CacheURL(rel string) string {
	return "/media/cache/" + strings.TrimLeft(filepath.ToSlash(rel), "/")
}

func (c Config) OriginalURL(rel string) string {
	return "/media/originals/" + strings.TrimLeft(filepath.ToSlash(rel), "/")
}

func envOr(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}
