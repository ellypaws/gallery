package auth

import (
	"gallery/pkg/config"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

func BasicAuth(cfg config.Config) echo.MiddlewareFunc {
	return middleware.BasicAuth(func(username, password string, _ echo.Context) (bool, error) {
		return username == cfg.AdminUser && password == cfg.AdminPass, nil
	})
}
