package media

import (
	"context"
	"os"
	"path/filepath"
	"time"

	"github.com/fsnotify/fsnotify"
)

func (s *Service) StartWatcher(ctx context.Context) error {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}

	if err := s.addWatchTree(watcher, s.cfg.MediaDir); err != nil {
		watcher.Close()
		return err
	}

	go s.runWatcher(ctx, watcher)
	return nil
}

func (s *Service) runWatcher(ctx context.Context, watcher *fsnotify.Watcher) {
	defer watcher.Close()

	debounce := time.NewTimer(time.Hour)
	if !debounce.Stop() {
		<-debounce.C
	}

	pendingFiles := make(map[string]struct{})

	trigger := func(path string) {
		// Convert absolute path to relative filename so UploadFiles can process it directly
		if rel, err := filepath.Rel(s.cfg.MediaDir, path); err == nil {
			pendingFiles[rel] = struct{}{}
		}
		debounce.Reset(450 * time.Millisecond)
	}

	for {
		select {
		case <-ctx.Done():
			return
		case event, ok := <-watcher.Events:
			if !ok {
				return
			}

			if event.Op&(fsnotify.Create|fsnotify.Write|fsnotify.Remove|fsnotify.Rename) == 0 {
				continue
			}

			if info, err := os.Stat(event.Name); err == nil && info.IsDir() {
				_ = s.addWatchTree(watcher, event.Name)
			} else {
				trigger(event.Name)
			}
		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			s.logger.Warn("media watcher error", "err", err)
		case <-debounce.C:
			if len(pendingFiles) == 0 {
				continue
			}

			filesToUpload := make([]string, 0, len(pendingFiles))
			for file := range pendingFiles {
				filesToUpload = append(filesToUpload, file)
			}
			pendingFiles = make(map[string]struct{})

			if err := s.UploadFiles(context.Background(), filesToUpload); err != nil {
				s.logger.Error("media watcher partial sync failed", "err", err)
			} else {
				s.logger.Debug("media watcher partial sync complete", "files", len(filesToUpload))
			}
		}
	}
}

func (s *Service) addWatchTree(watcher *fsnotify.Watcher, root string) error {
	return filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() {
			return nil
		}
		return watcher.Add(path)
	})
}
