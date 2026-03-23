// Package filter provides glob-based include/exclude path filtering.
package filter

import (
	"fmt"
	"strings"

	"github.com/gobwas/glob"
)

// PathFilter compiles include and exclude glob patterns and tests paths against them.
type PathFilter struct {
	includes []glob.Glob
	excludes []glob.Glob
}

// NewPathFilter compiles the given include and exclude glob patterns.
// An empty include slice means "allow everything" (before applying excludes).
func NewPathFilter(include, exclude []string) (*PathFilter, error) {
	f := &PathFilter{}

	for _, pat := range include {
		if pat == "" {
			continue
		}
		g, err := glob.Compile(pat, '/')
		if err != nil {
			return nil, fmt.Errorf("compile include pattern %q: %w", pat, err)
		}
		f.includes = append(f.includes, g)
	}

	for _, pat := range exclude {
		if pat == "" {
			continue
		}
		g, err := glob.Compile(pat, '/')
		if err != nil {
			return nil, fmt.Errorf("compile exclude pattern %q: %w", pat, err)
		}
		f.excludes = append(f.excludes, g)
	}

	return f, nil
}

// Allows returns true if the given path passes the filter.
//
// Logic: (include is empty OR path matches at least one include pattern)
//
//	AND path does NOT match any exclude pattern.
func (f *PathFilter) Allows(relativePath string) bool {
	// Normalize separators so patterns work cross-platform.
	path := strings.ReplaceAll(relativePath, "\\", "/")

	if len(f.excludes) > 0 {
		for _, g := range f.excludes {
			if g.Match(path) {
				return false
			}
		}
	}

	if len(f.includes) == 0 {
		return true
	}

	for _, g := range f.includes {
		if g.Match(path) {
			return true
		}
	}
	return false
}

// DefaultExcludePatterns returns the standard set of paths to ignore.
func DefaultExcludePatterns() []string {
	return []string{
		".git/**",
		"target/**",
		"node_modules/**",
		"build/**",
		"dist/**",
		".next/**",
		"*.lock",
		"package-lock.json",
		"yarn.lock",
		"pnpm-lock.yaml",
		"Cargo.lock",
		"go.sum",
		"*.png",
		"*.jpg",
		"*.jpeg",
		"*.gif",
		"*.svg",
		"*.ico",
		"*.webp",
		"*.mp4",
		"*.mov",
		"*.avi",
		"*.zip",
		"*.tar",
		"*.gz",
		"*.bz2",
		"*.7z",
		"*.woff",
		"*.woff2",
		"*.ttf",
		"*.eot",
		"*.wasm",
	}
}
