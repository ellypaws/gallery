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
	pending := false

	trigger := func() {
		pending = true
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
			}

			trigger()
		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			s.logger.Warn("media watcher error", "err", err)
		case <-debounce.C:
			if !pending {
				continue
			}
			pending = false
			if err := s.SyncLibrary(context.Background()); err != nil {
				s.logger.Error("media watcher sync failed", "err", err)
			} else {
				s.logger.Debug("media watcher sync complete")
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
