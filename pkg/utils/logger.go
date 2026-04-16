package utils

import (
	"os"

	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/log"
)

func NewLogger(env string) *log.Logger {
	logger := log.NewWithOptions(os.Stdout, log.Options{
		Prefix: "gallery",
	})

	logger.SetStyles(&log.Styles{
		Prefix: lipgloss.NewStyle().Foreground(lipgloss.Color("#ECA72C")).Bold(true),
		Levels: map[log.Level]lipgloss.Style{
			log.DebugLevel: lipgloss.NewStyle().Foreground(lipgloss.Color("#7A93AC")),
			log.InfoLevel:  lipgloss.NewStyle().Foreground(lipgloss.Color("#56B6C2")),
			log.WarnLevel:  lipgloss.NewStyle().Foreground(lipgloss.Color("#E5C07B")),
			log.ErrorLevel: lipgloss.NewStyle().Foreground(lipgloss.Color("#E06C75")).Bold(true),
			log.FatalLevel: lipgloss.NewStyle().Foreground(lipgloss.Color("#FF6B6B")).Bold(true),
		},
	})

	logger.SetLevel(log.InfoLevel)
	if env == "development" {
		logger.SetLevel(log.DebugLevel)
	}

	return logger
}
