package db

import (
	"fmt"
	"path/filepath"

	"gallery/pkg/config"
	"gallery/pkg/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	_ "modernc.org/sqlite"
)

func Open(cfg config.Config) (*gorm.DB, error) {
	dsn := fmt.Sprintf("file:%s?_pragma=foreign_keys(1)", filepath.ToSlash(cfg.DBPath))
	db, err := gorm.Open(sqlite.New(sqlite.Config{
		DriverName: "sqlite",
		DSN:        dsn,
	}), &gorm.Config{})
	if err != nil {
		return nil, err
	}

	if err := db.AutoMigrate(&models.Photo{}, &models.PhotoExif{}, &models.PhotoOverride{}, &models.Derivative{}); err != nil {
		return nil, err
	}

	return db, nil
}
