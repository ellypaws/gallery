package media

import (
	"context"
	"errors"
	"fmt"
	"mime"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"gallery/pkg/config"
	"gallery/pkg/images"
	"gallery/pkg/models"
	"gallery/pkg/utils"

	"github.com/charmbracelet/log"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Service struct {
	cfg    config.Config
	db     *gorm.DB
	logger *log.Logger
	syncMu sync.Mutex
	dbMu   sync.RWMutex
}

type GalleryResponse struct {
	Title  string        `json:"title"`
	Photos []GalleryItem `json:"photos"`
}

type GalleryItem struct {
	ID              uint       `json:"id"`
	Title           string     `json:"title"`
	Alt             string     `json:"alt"`
	Description     string     `json:"description"`
	Width           int        `json:"width"`
	Height          int        `json:"height"`
	Src             string     `json:"src"`
	OriginalSrc     string     `json:"originalSrc"`
	Placeholder     string     `json:"placeholder"`
	SrcSet          string     `json:"srcSet"`
	Sizes           string     `json:"sizes"`
	Camera          string     `json:"camera"`
	Lens            string     `json:"lens"`
	Aperture        string     `json:"aperture"`
	Shutter         string     `json:"shutter"`
	ISO             string     `json:"iso"`
	FocalLength     string     `json:"focalLength"`
	CapturedAt      *time.Time `json:"capturedAt"`
	CapturedAtLocal string     `json:"capturedAtLocal"`
	UpdatedAt       time.Time  `json:"updatedAt"`
	UpdatedAtLocal  string     `json:"updatedAtLocal"`
	TimelineGroup   string     `json:"timelineGroup"`
	SortOrder       int        `json:"sortOrder"`
	Hidden          bool       `json:"hidden"`
	RelativePath    string     `json:"relativePath"`
	ViewCount       int64      `json:"viewCount"`
	ClickCount      int64      `json:"clickCount"`
	StarCount       int64      `json:"starCount"`
	Starred         bool       `json:"starred"`
}

type GalleryInteraction struct {
	PhotoID    uint  `json:"photoId"`
	ViewCount  int64 `json:"viewCount"`
	ClickCount int64 `json:"clickCount"`
	StarCount  int64 `json:"starCount"`
	Starred    bool  `json:"starred"`
}

type interactionStats struct {
	viewCounts  map[uint]int64
	clickCounts map[uint]int64
	starCounts  map[uint]int64
	viewerStars map[uint]bool
}

type PhotoOverrideInput struct {
	Title           *string `json:"title"`
	Alt             *string `json:"alt"`
	Description     *string `json:"description"`
	SortOrder       *int    `json:"sort_order"`
	Hidden          *bool   `json:"hidden"`
	CapturedAt      *string `json:"captured_at"`
	UpdatedAt       *string `json:"updated_at"`
	CapturedAtLocal *string `json:"captured_at_local"`
	UpdatedAtLocal  *string `json:"updated_at_local"`
}

func NewService(cfg config.Config, db *gorm.DB, logger *log.Logger) *Service {
	return &Service{cfg: cfg, db: db, logger: logger}
}

func (s *Service) SyncLibrary(ctx context.Context) error {
	s.syncMu.Lock()
	defer s.syncMu.Unlock()

	s.logger.Info("starting full library sync", "dir", s.cfg.MediaDir)

	files := make([]string, 0, 64)
	err := filepath.WalkDir(s.cfg.MediaDir, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() {
			return nil
		}
		if utils.IsSupportedImage(path) {
			files = append(files, path)
		}
		return nil
	})
	if err != nil {
		return err
	}

	s.logger.Info("discovered compatible files", "count", len(files))

	sort.Strings(files)
	seen := make([]uint, 0, len(files))

	type SyncResult struct {
		path string
		id   uint
		err  error
	}

	pool := utils.NewWorkerPool(runtime.NumCPU(), func(path string) SyncResult {
		select {
		case <-ctx.Done():
			return SyncResult{path: path, err: ctx.Err()}
		default:
		}
		id, err := s.syncFile(path)
		return SyncResult{path: path, id: id, err: err}
	})

	go pool.AddAndClose(files...)

	for res := range pool.Work() {
		if res.err != nil {
			if !errors.Is(res.err, context.Canceled) {
				s.logger.Error("photo sync failed", "path", res.path, "err", res.err)
			}
			continue
		}
		seen = append(seen, res.id)
	}

	missingPhotos, err := s.listMissingPhotos(seen)
	if err != nil {
		return err
	}
	for _, photo := range missingPhotos {
		if err := s.deletePhoto(photo); err != nil {
			return err
		}
	}

	s.logger.Info("library sync completed successfully", "processed_count", len(seen))
	return nil
}

func (s *Service) syncFile(absPath string) (uint, error) {
	relPath, err := filepath.Rel(s.cfg.MediaDir, absPath)
	if err != nil {
		return 0, err
	}
	relPath = filepath.ToSlash(relPath)

	stat, err := os.Stat(absPath)
	if err != nil {
		return 0, err
	}

	hash, err := utils.Sha256File(absPath)
	if err != nil {
		return 0, err
	}

	var photo models.Photo
	s.dbMu.RLock()
	err = s.db.Preload("Override").Preload("Exif").Preload("Derivatives").
		Where("relative_path = ?", relPath).
		First(&photo).Error
	s.dbMu.RUnlock()

	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, err
	}

	if photo.ID != 0 && photo.Hash == hash && len(photo.Derivatives) > 0 {
		s.logger.Debug("file already synced, skipping", "path", relPath, "hash", hash)
		return photo.ID, nil
	}

	modified := photo.ID != 0 && photo.Hash != "" && photo.Hash != hash
	previousPhoto := photo
	if modified {
		s.logger.Info("processing modified image", "path", relPath, "old_hash", photo.Hash, "hash", hash)
	} else {
		s.logger.Info("processing new image", "path", relPath, "hash", hash)
	}

	exifMeta, err := images.ExtractExif(absPath)
	if err != nil {
		s.logger.Warn("exif extraction failed", "path", absPath, "err", err)
	}

	processed, err := images.ProcessImage(absPath, s.cfg.CacheDir, hash, s.logger)
	if err != nil {
		s.logger.Error("failed to process image derivatives", "path", absPath, "err", err)
		return 0, err
	}

	scrubbedSubdir := filepath.Join(s.cfg.CacheDir, "originals", hash[:2], hash[2:4])
	_ = os.MkdirAll(scrubbedSubdir, 0o755)
	scrubbedOriginal := filepath.Join(scrubbedSubdir, hash+".jpg")

	if err := images.SaveOriginalJpeg(absPath, scrubbedOriginal, exifMeta, s.logger); err != nil {
		s.logger.Warn("failed to create scrubbed original", "path", absPath, "err", err)
	}

	normalizedExif := exifMeta
	normalizedExif.Orientation = 1

	for _, derivative := range processed.Derivatives {
		dPath := filepath.Join(s.cfg.CacheDir, derivative.RelativePath)
		_ = images.ScrubAndSaveJpeg(dPath, dPath, normalizedExif, s.logger)
	}
	if processed.Placeholder != "" {
		pPath := filepath.Join(s.cfg.CacheDir, processed.Placeholder)
		_ = images.ScrubAndSaveJpeg(pPath, pPath, normalizedExif, s.logger)
	}

	photo.RelativePath = relPath
	photo.Hash = hash
	photo.Width = processed.Width
	photo.Height = processed.Height
	photo.ByteSize = stat.Size()
	photo.MimeType = mime.TypeByExtension(strings.ToLower(filepath.Ext(absPath)))
	if photo.MimeType == "" {
		photo.MimeType = processed.MimeType
	}
	if exifMeta.CapturedAt != nil {
		photo.TakenAt = exifMeta.CapturedAt
	}

	s.logger.Debug("saving photo metadata to database", "photo", relPath)

	s.dbMu.Lock()
	err = s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(&photo).Error; err != nil {
			return err
		}

		override := photo.Override
		override.PhotoID = photo.ID
		if override.Title == "" {
			override.Title = utils.HumanizeFilename(relPath)
		}
		if override.Alt == "" {
			override.Alt = override.Title
		}
		if err := tx.Save(&override).Error; err != nil {
			return err
		}

		exifRow := photo.Exif
		exifRow.PhotoID = photo.ID
		exifRow.CameraMake = exifMeta.CameraMake
		exifRow.CameraModel = exifMeta.CameraModel
		exifRow.LensModel = exifMeta.LensModel
		exifRow.Aperture = exifMeta.Aperture
		exifRow.Shutter = exifMeta.Shutter
		exifRow.ISO = exifMeta.ISO
		exifRow.FocalLength = exifMeta.FocalLength
		exifRow.CapturedAt = exifMeta.CapturedAt
		if err := tx.Save(&exifRow).Error; err != nil {
			return err
		}

		if err := tx.Where("photo_id = ?", photo.ID).Delete(&models.Derivative{}).Error; err != nil {
			return err
		}
		for _, derivative := range processed.Derivatives {
			row := models.Derivative{
				PhotoID:      photo.ID,
				Variant:      derivative.Variant,
				RelativePath: derivative.RelativePath,
				Width:        derivative.Width,
				Height:       derivative.Height,
				ByteSize:     derivative.ByteSize,
				MimeType:     derivative.MimeType,
			}
			if err := tx.Create(&row).Error; err != nil {
				return err
			}
		}

		return nil
	})
	s.dbMu.Unlock()

	if err != nil {
		return 0, err
	}

	if modified {
		s.removeCachedPhotoAssets(previousPhoto)
	}

	return photo.ID, nil
}

func (s *Service) Gallery(ctx context.Context, viewerHash string) (GalleryResponse, error) {
	return s.gallery(ctx, false, viewerHash)
}

func (s *Service) AdminGallery(ctx context.Context, viewerHash string) (GalleryResponse, error) {
	return s.gallery(ctx, true, viewerHash)
}

func (s *Service) gallery(ctx context.Context, includeHidden bool, viewerHash string) (GalleryResponse, error) {
	var photos []models.Photo

	s.dbMu.RLock()
	err := s.db.WithContext(ctx).
		Preload("Exif").
		Preload("Override").
		Preload("Derivatives").
		Order("id asc").
		Find(&photos).Error
	s.dbMu.RUnlock()

	if err != nil {
		return GalleryResponse{}, err
	}

	items := make([]GalleryItem, 0, len(photos))
	photoIDs := make([]uint, 0, len(photos))
	for _, photo := range photos {
		item := s.toGalleryItem(photo)
		if item.Hidden && !includeHidden {
			continue
		}
		items = append(items, item)
		photoIDs = append(photoIDs, item.ID)
	}

	stats, err := s.interactionStats(ctx, photoIDs, viewerHash)
	if err != nil {
		return GalleryResponse{}, err
	}
	for index := range items {
		photoID := items[index].ID
		items[index].ViewCount = stats.viewCounts[photoID]
		items[index].ClickCount = stats.clickCounts[photoID]
		items[index].StarCount = stats.starCounts[photoID]
		items[index].Starred = stats.viewerStars[photoID]
	}

	sort.SliceStable(items, func(i, j int) bool {
		if items[i].SortOrder != items[j].SortOrder {
			return items[i].SortOrder < items[j].SortOrder
		}

		timeI := items[i].UpdatedAt
		if items[i].CapturedAt != nil {
			timeI = *items[i].CapturedAt
		}

		timeJ := items[j].UpdatedAt
		if items[j].CapturedAt != nil {
			timeJ = *items[j].CapturedAt
		}

		if !timeI.Equal(timeJ) {
			return timeI.After(timeJ)
		}
		return items[i].ID > items[j].ID
	})

	return GalleryResponse{
		Title:  s.cfg.SiteTitle,
		Photos: items,
	}, nil
}

func (s *Service) TrackView(ctx context.Context, photoID uint, viewerHash string) (GalleryInteraction, error) {
	interactions, err := s.TrackViews(ctx, []uint{photoID}, viewerHash)
	if err != nil {
		return GalleryInteraction{}, err
	}
	if len(interactions) == 0 {
		return GalleryInteraction{}, errors.New("missing interaction")
	}
	return interactions[0], nil
}

func (s *Service) TrackViews(ctx context.Context, photoIDs []uint, viewerHash string) ([]GalleryInteraction, error) {
	if viewerHash == "" {
		return nil, errors.New("missing viewer")
	}

	photoIDs = uniquePhotoIDs(photoIDs)
	if len(photoIDs) == 0 {
		return []GalleryInteraction{}, nil
	}

	rows := make([]models.PhotoView, 0, len(photoIDs))
	for _, photoID := range photoIDs {
		rows = append(rows, models.PhotoView{
			PhotoID:    photoID,
			ViewerHash: viewerHash,
		})
	}

	s.dbMu.Lock()
	err := s.db.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&rows).Error
	s.dbMu.Unlock()
	if err != nil {
		return nil, err
	}

	return s.photoInteractions(ctx, photoIDs, viewerHash)
}

func (s *Service) TrackClick(ctx context.Context, photoID uint, viewerHash string) (GalleryInteraction, error) {
	if viewerHash == "" {
		return GalleryInteraction{}, errors.New("missing viewer")
	}

	s.dbMu.Lock()
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&models.PhotoView{
			PhotoID:    photoID,
			ViewerHash: viewerHash,
		}).Error; err != nil {
			return err
		}
		return tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&models.PhotoClick{
			PhotoID:    photoID,
			ViewerHash: viewerHash,
		}).Error
	})
	s.dbMu.Unlock()
	if err != nil {
		return GalleryInteraction{}, err
	}

	return s.photoInteraction(ctx, photoID, viewerHash)
}

func (s *Service) ToggleStar(ctx context.Context, photoID uint, viewerHash string) (GalleryInteraction, error) {
	if viewerHash == "" {
		return GalleryInteraction{}, errors.New("missing viewer")
	}

	starred := false
	s.dbMu.Lock()
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var star models.PhotoStar
		err := tx.Where("photo_id = ? AND viewer_hash = ?", photoID, viewerHash).First(&star).Error
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			if err := tx.Create(&models.PhotoStar{PhotoID: photoID, ViewerHash: viewerHash}).Error; err != nil {
				return err
			}
			starred = true
			return nil
		case err != nil:
			return err
		default:
			if err := tx.Delete(&star).Error; err != nil {
				return err
			}
			starred = false
			return nil
		}
	})
	s.dbMu.Unlock()
	if err != nil {
		return GalleryInteraction{}, err
	}

	interaction, err := s.photoInteraction(ctx, photoID, viewerHash)
	if err != nil {
		return GalleryInteraction{}, err
	}
	interaction.Starred = starred
	return interaction, nil
}

func (s *Service) photoInteraction(ctx context.Context, photoID uint, viewerHash string) (GalleryInteraction, error) {
	interactions, err := s.photoInteractions(ctx, []uint{photoID}, viewerHash)
	if err != nil {
		return GalleryInteraction{}, err
	}
	if len(interactions) == 0 {
		return GalleryInteraction{}, errors.New("missing interaction")
	}
	return interactions[0], nil
}

func (s *Service) photoInteractions(ctx context.Context, photoIDs []uint, viewerHash string) ([]GalleryInteraction, error) {
	photoIDs = uniquePhotoIDs(photoIDs)
	stats, err := s.interactionStats(ctx, photoIDs, viewerHash)
	if err != nil {
		return nil, err
	}

	interactions := make([]GalleryInteraction, 0, len(photoIDs))
	for _, photoID := range photoIDs {
		interactions = append(interactions, GalleryInteraction{
			PhotoID:    photoID,
			ViewCount:  stats.viewCounts[photoID],
			ClickCount: stats.clickCounts[photoID],
			StarCount:  stats.starCounts[photoID],
			Starred:    stats.viewerStars[photoID],
		})
	}
	return interactions, nil
}

func (s *Service) interactionStats(ctx context.Context, photoIDs []uint, viewerHash string) (interactionStats, error) {
	stats := interactionStats{
		viewCounts:  map[uint]int64{},
		clickCounts: map[uint]int64{},
		starCounts:  map[uint]int64{},
		viewerStars: map[uint]bool{},
	}
	if len(photoIDs) == 0 {
		return stats, nil
	}

	type countRow struct {
		PhotoID uint
		Count   int64
	}
	var viewRows []countRow
	var clickRows []countRow
	var starRows []countRow
	var viewerStars []models.PhotoStar

	s.dbMu.RLock()
	err := s.db.WithContext(ctx).
		Model(&models.PhotoView{}).
		Select("photo_id, count(*) as count").
		Where("photo_id IN ?", photoIDs).
		Group("photo_id").
		Scan(&viewRows).Error
	if err == nil {
		err = s.db.WithContext(ctx).
			Model(&models.PhotoClick{}).
			Select("photo_id, count(*) as count").
			Where("photo_id IN ?", photoIDs).
			Group("photo_id").
			Scan(&clickRows).Error
	}
	if err == nil {
		err = s.db.WithContext(ctx).
			Model(&models.PhotoStar{}).
			Select("photo_id, count(*) as count").
			Where("photo_id IN ?", photoIDs).
			Group("photo_id").
			Scan(&starRows).Error
	}
	if err == nil && viewerHash != "" {
		err = s.db.WithContext(ctx).
			Where("photo_id IN ? AND viewer_hash = ?", photoIDs, viewerHash).
			Find(&viewerStars).Error
	}
	s.dbMu.RUnlock()
	if err != nil {
		return interactionStats{}, err
	}

	for _, row := range viewRows {
		stats.viewCounts[row.PhotoID] = row.Count
	}
	for _, row := range clickRows {
		stats.clickCounts[row.PhotoID] = row.Count
	}
	for _, row := range starRows {
		stats.starCounts[row.PhotoID] = row.Count
	}
	for _, row := range viewerStars {
		stats.viewerStars[row.PhotoID] = true
	}

	return stats, nil
}

func (s *Service) UploadFiles(ctx context.Context, filenames []string) error {
	s.syncMu.Lock()
	defer s.syncMu.Unlock()

	pool := utils.NewWorkerPool(runtime.NumCPU(), func(name string) error {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		relPath := normalizeRelativePath(name)
		absPath := filepath.Join(s.cfg.MediaDir, filepath.FromSlash(relPath))
		if _, err := os.Stat(absPath); err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return s.deleteMissingPath(relPath)
			}
			return err
		}

		_, err := s.syncFile(absPath)
		return err
	})
	go pool.AddAndClose(filenames...)

	var firstErr error
	for err := range pool.Work() {
		if err != nil && firstErr == nil {
			firstErr = err
		}
	}
	s.logger.Info("upload complete", "count", len(filenames))
	return nil
}

func (s *Service) UpdateOverride(ctx context.Context, photoID uint, input PhotoOverrideInput) error {
	s.dbMu.Lock()
	defer s.dbMu.Unlock()

	var photo models.Photo
	if err := s.db.WithContext(ctx).Preload("Override").Preload("Exif").First(&photo, photoID).Error; err != nil {
		return err
	}

	capturedAt, err := parseOptionalTimestamp(input.CapturedAt)
	if err != nil {
		return err
	}
	updatedAt, err := parseRequiredTimestamp(input.UpdatedAt)
	if err != nil {
		return err
	}
	if input.CapturedAtLocal != nil {
		capturedAt, err = parseOptionalLocalTimestamp(input.CapturedAtLocal)
		if err != nil {
			return err
		}
	}
	if input.UpdatedAtLocal != nil {
		updatedAt, err = parseRequiredLocalTimestamp(input.UpdatedAtLocal)
		if err != nil {
			return err
		}
	}

	override := photo.Override
	override.PhotoID = photo.ID
	if input.Title != nil {
		override.Title = strings.TrimSpace(*input.Title)
	}
	if input.Alt != nil {
		override.Alt = strings.TrimSpace(*input.Alt)
	}
	if input.Description != nil {
		override.Description = strings.TrimSpace(*input.Description)
	}
	if input.SortOrder != nil {
		override.SortOrder = *input.SortOrder
	}
	if input.Hidden != nil {
		override.Hidden = *input.Hidden
	}

	exifRow := photo.Exif
	exifRow.PhotoID = photo.ID
	if input.CapturedAt != nil || input.CapturedAtLocal != nil {
		exifRow.CapturedAt = capturedAt
	}

	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(&override).Error; err != nil {
			return err
		}

		updates := buildPhotoTimestampUpdates(input, capturedAt, updatedAt)
		if len(updates) > 0 {
			if err := tx.Model(&models.Photo{}).Where("id = ?", photo.ID).UpdateColumns(updates).Error; err != nil {
				return err
			}
		}

		if input.CapturedAt != nil || input.CapturedAtLocal != nil {
			if err := tx.Save(&exifRow).Error; err != nil {
				return err
			}
		}

		return nil
	})
}

func (s *Service) toGalleryItem(photo models.Photo) GalleryItem {
	largest := pickLargestDerivative(photo.Derivatives)
	placeholder := pickVariant(photo.Derivatives, "placeholder")
	title := strings.TrimSpace(photo.Override.Title)
	if title == "" {
		title = utils.HumanizeFilename(photo.RelativePath)
	}
	alt := strings.TrimSpace(photo.Override.Alt)
	if alt == "" {
		alt = title
	}

	lensModel := strings.TrimSpace(photo.Exif.LensModel)
	if strings.Trim(lensModel, "-_ \x00\t\n\r") == "" {
		lensModel = "Unknown"
	}

	return GalleryItem{
		ID:              photo.ID,
		Title:           title,
		Alt:             alt,
		Description:     photo.Override.Description,
		Width:           photo.Width,
		Height:          photo.Height,
		Src:             s.cfg.CacheURL(largest.RelativePath),
		OriginalSrc:     s.cfg.CacheURL(filepath.ToSlash(filepath.Join("originals", photo.Hash[:2], photo.Hash[2:4], photo.Hash+".jpg"))),
		Placeholder:     s.cfg.CacheURL(placeholder.RelativePath),
		SrcSet:          buildSrcSet(s.cfg, photo.Derivatives),
		Sizes:           "(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw",
		Camera:          strings.TrimSpace(strings.TrimSpace(photo.Exif.CameraMake + " " + photo.Exif.CameraModel)),
		Lens:            lensModel,
		Aperture:        photo.Exif.Aperture,
		Shutter:         photo.Exif.Shutter,
		ISO:             photo.Exif.ISO,
		FocalLength:     photo.Exif.FocalLength,
		CapturedAt:      photo.TakenAt,
		CapturedAtLocal: formatLocalDateTime(photo.TakenAt),
		UpdatedAt:       photo.UpdatedAt,
		UpdatedAtLocal:  formatLocalDateTime(&photo.UpdatedAt),
		TimelineGroup:   timelineGroup(photo.TakenAt, photo.UpdatedAt),
		SortOrder:       photo.Override.SortOrder,
		Hidden:          photo.Override.Hidden,
		RelativePath:    photo.RelativePath,
	}
}

func buildSrcSet(cfg config.Config, rows []models.Derivative) string {
	parts := make([]string, 0, len(rows))
	for _, row := range rows {
		if row.Variant != "responsive" {
			continue
		}
		parts = append(parts, fmt.Sprintf("%s %dw", cfg.CacheURL(row.RelativePath), row.Width))
	}
	sort.Strings(parts)
	return strings.Join(parts, ", ")
}

func pickLargestDerivative(rows []models.Derivative) models.Derivative {
	best := models.Derivative{}
	for _, row := range rows {
		if row.Variant != "responsive" {
			continue
		}
		if row.Width > best.Width {
			best = row
		}
	}
	return best
}

func pickVariant(rows []models.Derivative, variant string) models.Derivative {
	for _, row := range rows {
		if row.Variant == variant {
			return row
		}
	}
	return pickLargestDerivative(rows)
}

func (s *Service) listMissingPhotos(seen []uint) ([]models.Photo, error) {
	var photos []models.Photo

	s.dbMu.RLock()
	query := s.db.Preload("Derivatives")
	if len(seen) > 0 {
		query = query.Where("id NOT IN ?", seen)
	}
	err := query.Find(&photos).Error
	s.dbMu.RUnlock()
	if err != nil {
		return nil, err
	}
	return photos, nil
}

func (s *Service) deleteMissingPath(relPath string) error {
	relPath = normalizeRelativePath(relPath)
	if relPath == "" {
		return nil
	}

	var photos []models.Photo
	likePrefix := escapeLike(relPath) + "/%"

	s.dbMu.RLock()
	err := s.db.Preload("Derivatives").
		Where("relative_path = ? OR relative_path LIKE ? ESCAPE '\\'", relPath, likePrefix).
		Find(&photos).Error
	s.dbMu.RUnlock()
	if err != nil {
		return err
	}

	for _, photo := range photos {
		if err := s.deletePhoto(photo); err != nil {
			return err
		}
	}

	return nil
}

func (s *Service) deletePhoto(photo models.Photo) error {
	s.dbMu.Lock()
	err := s.db.Transaction(func(tx *gorm.DB) error {
		return tx.Delete(&photo).Error
	})
	s.dbMu.Unlock()
	if err != nil {
		return err
	}

	s.removeCachedPhotoAssets(photo)

	s.logger.Info("removed missing image", "path", photo.RelativePath, "hash", photo.Hash)
	return nil
}

func (s *Service) removeCachedPhotoAssets(photo models.Photo) {
	cachePaths := make([]string, 0, len(photo.Derivatives)+1)
	for _, derivative := range photo.Derivatives {
		cachePaths = append(cachePaths, filepath.Join(s.cfg.CacheDir, filepath.FromSlash(derivative.RelativePath)))
	}
	if len(photo.Hash) >= 4 {
		cachePaths = append(cachePaths, filepath.Join(s.cfg.CacheDir, "originals", photo.Hash[:2], photo.Hash[2:4], photo.Hash+".jpg"))
	}

	for _, cachePath := range cachePaths {
		if err := os.Remove(cachePath); err != nil && !errors.Is(err, os.ErrNotExist) {
			s.logger.Warn("failed to remove cached derivative", "path", cachePath, "err", err)
		}
	}
}

func normalizeRelativePath(path string) string {
	clean := filepath.ToSlash(filepath.Clean(path))
	clean = strings.TrimPrefix(clean, "./")
	return strings.TrimPrefix(clean, "/")
}

func uniquePhotoIDs(photoIDs []uint) []uint {
	seen := map[uint]struct{}{}
	result := make([]uint, 0, len(photoIDs))
	for _, photoID := range photoIDs {
		if photoID == 0 {
			continue
		}
		if _, ok := seen[photoID]; ok {
			continue
		}
		seen[photoID] = struct{}{}
		result = append(result, photoID)
	}
	return result
}

func escapeLike(value string) string {
	replacer := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return replacer.Replace(value)
}

func parseOptionalTimestamp(value *string) (*time.Time, error) {
	if value == nil {
		return nil, nil
	}

	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil, nil
	}

	parsed, err := time.Parse(time.RFC3339, trimmed)
	if err != nil {
		return nil, fmt.Errorf("invalid captured_at: %w", err)
	}
	return &parsed, nil
}

func parseRequiredTimestamp(value *string) (*time.Time, error) {
	if value == nil {
		return nil, nil
	}

	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil, errors.New("updated_at cannot be empty")
	}

	parsed, err := time.Parse(time.RFC3339, trimmed)
	if err != nil {
		return nil, fmt.Errorf("invalid updated_at: %w", err)
	}
	return &parsed, nil
}

func parseOptionalLocalTimestamp(value *string) (*time.Time, error) {
	if value == nil {
		return nil, nil
	}

	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil, nil
	}

	parsed, err := time.ParseInLocation("2006-01-02T15:04", trimmed, time.Local)
	if err != nil {
		return nil, fmt.Errorf("invalid captured_at_local: %w", err)
	}
	return &parsed, nil
}

func parseRequiredLocalTimestamp(value *string) (*time.Time, error) {
	if value == nil {
		return nil, nil
	}

	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil, errors.New("updated_at_local cannot be empty")
	}

	parsed, err := time.ParseInLocation("2006-01-02T15:04", trimmed, time.Local)
	if err != nil {
		return nil, fmt.Errorf("invalid updated_at_local: %w", err)
	}
	return &parsed, nil
}

func formatLocalDateTime(value *time.Time) string {
	if value == nil {
		return ""
	}
	return value.In(time.Local).Format("2006-01-02T15:04")
}

func timelineGroup(capturedAt *time.Time, updatedAt time.Time) string {
	target := updatedAt
	if capturedAt != nil {
		target = *capturedAt
	}

	target = target.In(time.Local)
	now := time.Now().In(time.Local)

	today := localDayNumber(now)
	day := localDayNumber(target)
	diffDays := today - day

	switch {
	case diffDays < 0:
		return "Future"
	case diffDays == 0:
		return "Today"
	case diffDays == 1:
		return "Yesterday"
	case diffDays <= 14:
		return fmt.Sprintf("%d days ago", diffDays)
	}

	diffWeeks := diffDays / 7
	if diffWeeks <= 4 {
		return fmt.Sprintf("%d weeks ago", diffWeeks)
	}

	diffMonths := (now.Year()-target.Year())*12 + int(now.Month()) - int(target.Month())
	switch {
	case diffMonths == 1:
		return "1 month ago"
	case diffMonths > 1 && diffMonths <= 11:
		return fmt.Sprintf("%d months ago", diffMonths)
	}

	diffYears := now.Year() - target.Year()
	switch diffYears {
	case 1:
		return "1 year ago"
	case 2:
		return "2 years ago"
	default:
		return "Long time ago"
	}
}

func localDayNumber(value time.Time) int {
	year, month, day := value.Date()
	return int(time.Date(year, month, day, 0, 0, 0, 0, time.Local).Unix() / 86400)
}

func buildPhotoTimestampUpdates(input PhotoOverrideInput, capturedAt *time.Time, updatedAt *time.Time) map[string]any {
	updates := map[string]any{}
	if input.CapturedAt != nil || input.CapturedAtLocal != nil {
		updates["taken_at"] = capturedAt
	}
	if (input.UpdatedAt != nil || input.UpdatedAtLocal != nil) && updatedAt != nil {
		updates["updated_at"] = *updatedAt
	}
	return updates
}
