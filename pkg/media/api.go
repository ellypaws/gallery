package media

import (
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"gallery/pkg/config"
	"gallery/pkg/utils"

	"github.com/labstack/echo/v4"
)

type Handler struct {
	cfg     config.Config
	service *Service
}

func NewHandler(cfg config.Config, service *Service) *Handler {
	return &Handler{cfg: cfg, service: service}
}

func (h *Handler) GetGallery(c echo.Context) error {
	response, err := h.service.Gallery(c.Request().Context())
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
	idValue, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid photo id")
	}

	var input PhotoOverrideInput
	if err := c.Bind(&input); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	if err := h.service.UpdateOverride(c.Request().Context(), uint(idValue), input); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.NoContent(http.StatusNoContent)
}
