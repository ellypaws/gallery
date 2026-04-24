package media

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"gallery/pkg/config"
	"gallery/pkg/utils"

	"github.com/labstack/echo/v4"
)

type Handler struct {
	cfg     config.Config
	service *Service
}

type trackViewsInput struct {
	PhotoIDs []uint `json:"photo_ids"`
}

func NewHandler(cfg config.Config, service *Service) *Handler {
	return &Handler{cfg: cfg, service: service}
}

func (h *Handler) GetGallery(c echo.Context) error {
	response, err := h.service.Gallery(c.Request().Context(), viewerHash(c))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, response)
}

func (h *Handler) GetAdminGallery(c echo.Context) error {
	response, err := h.service.AdminGallery(c.Request().Context(), viewerHash(c))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, response)
}

func (h *Handler) Upload(c echo.Context) error {
	form, err := c.MultipartForm()
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid multipart form")
	}

	files := form.File["files"]
	if len(files) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "no files provided")
	}

	saved := make([]string, 0, len(files))
	for _, fileHeader := range files {
		if !utils.IsSupportedImage(fileHeader.Filename) {
			continue
		}

		src, err := fileHeader.Open()
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}

		filename := utils.UniqueFilename(h.cfg.MediaDir, filepath.Base(fileHeader.Filename))
		dstPath := filepath.Join(h.cfg.MediaDir, filename)
		dst, err := os.Create(dstPath)
		if err != nil {
			src.Close()
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}

		if _, err := io.Copy(dst, src); err != nil {
			dst.Close()
			src.Close()
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}

		dst.Close()
		src.Close()
		saved = append(saved, filename)
	}

	if err := h.service.UploadFiles(c.Request().Context(), saved); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, map[string]any{"saved": saved})
}

func (h *Handler) Rescan(c echo.Context) error {
	if err := h.service.SyncLibrary(c.Request().Context()); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "rescanned"})
}

func (h *Handler) PatchPhoto(c echo.Context) error {
	photoID, err := parsePhotoID(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid photo id")
	}

	var input PhotoOverrideInput
	if err := c.Bind(&input); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	if err := h.service.UpdateOverride(c.Request().Context(), photoID, input); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.NoContent(http.StatusNoContent)
}

func (h *Handler) TrackView(c echo.Context) error {
	photoID, err := parsePhotoID(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid photo id")
	}

	interaction, err := h.service.TrackView(c.Request().Context(), photoID, viewerHash(c))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, interaction)
}

func (h *Handler) TrackViews(c echo.Context) error {
	var input trackViewsInput
	if err := c.Bind(&input); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	interactions, err := h.service.TrackViews(c.Request().Context(), input.PhotoIDs, viewerHash(c))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, map[string]any{"interactions": interactions})
}

func (h *Handler) TrackClick(c echo.Context) error {
	photoID, err := parsePhotoID(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid photo id")
	}

	interaction, err := h.service.TrackClick(c.Request().Context(), photoID, viewerHash(c))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, interaction)
}

func (h *Handler) ToggleStar(c echo.Context) error {
	photoID, err := parsePhotoID(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid photo id")
	}

	interaction, err := h.service.ToggleStar(c.Request().Context(), photoID, viewerHash(c))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, interaction)
}

func parsePhotoID(c echo.Context) (uint, error) {
	idValue, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		return 0, err
	}
	return uint(idValue), nil
}

func viewerHash(c echo.Context) string {
	ip := strings.TrimSpace(c.RealIP())
	if ip == "" {
		ip = strings.TrimSpace(c.Request().RemoteAddr)
	}
	sum := sha256.Sum256([]byte(ip))
	return hex.EncodeToString(sum[:])
}
