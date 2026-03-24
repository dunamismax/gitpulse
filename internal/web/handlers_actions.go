package web

import (
	"strings"

	"github.com/dunamismax/gitpulse/internal/config"
)

func mergeAuthorEmails(existing []config.AuthorIdentity, emails []string) []config.AuthorIdentity {
	byEmail := make(map[string]config.AuthorIdentity, len(existing))
	for _, author := range existing {
		key := strings.ToLower(strings.TrimSpace(author.Email))
		if key == "" {
			continue
		}
		byEmail[key] = author
	}

	merged := make([]config.AuthorIdentity, 0, len(emails))
	seen := make(map[string]struct{}, len(emails))
	for _, email := range emails {
		key := strings.ToLower(strings.TrimSpace(email))
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}

		if author, ok := byEmail[key]; ok {
			author.Email = email
			merged = append(merged, author)
			continue
		}

		merged = append(merged, config.AuthorIdentity{Email: email})
	}

	return merged
}
