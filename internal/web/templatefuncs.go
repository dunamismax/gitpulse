package web

import (
	"html/template"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// templateFuncs returns the function map available to all templates.
func templateFuncs() template.FuncMap {
	return template.FuncMap{
		"formatTime": func(t time.Time) string {
			return t.Local().Format("Jan 2, 2006 15:04")
		},
		"formatDate": func(t time.Time) string {
			return t.UTC().Format("2006-01-02")
		},
		"percentOf": func(current, target int) float64 {
			if target <= 0 {
				return 0
			}
			p := float64(current) / float64(target) * 100
			if p > 100 {
				return 100
			}
			return p
		},
		"sparklineBar": func(value, maxValue, height int) int {
			if maxValue <= 0 {
				return 0
			}
			return value * height / maxValue
		},
		"heatmapClass": func(score int) string {
			switch {
			case score <= 0:
				return "heat-none"
			case score < 50:
				return "heat-low"
			case score < 150:
				return "heat-med"
			default:
				return "heat-high"
			}
		},
		"add": func(a, b int) int { return a + b },
		"sub": func(a, b int) int { return a - b },
		"join": func(elems []string, sep string) string {
			return strings.Join(elems, sep)
		},
		"splitLines": func(s string) []string {
			return strings.Split(strings.TrimSpace(s), "\n")
		},
	}
}

// findTemplates walks a directory tree and returns all .html file paths.
func findTemplates(root string) ([]string, error) {
	var files []string
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil // skip unreadable entries
		}
		if !d.IsDir() && strings.HasSuffix(path, ".html") {
			files = append(files, path)
		}
		return nil
	})
	if os.IsNotExist(err) {
		return nil, nil
	}
	return files, err
}
