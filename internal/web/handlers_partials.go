package web

import (
	"log/slog"
	"net/http"
)

func (s *Server) handlePartialDashboardSummary(w http.ResponseWriter, r *http.Request) {
	view, err := s.rt.DashboardView(r.Context())
	if err != nil {
		slog.Error("partial dashboard summary", "err", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	s.renderPartial(w, "dashboard_summary.html", map[string]any{
		"Summary": view.Summary,
	})
}

func (s *Server) handlePartialActivityFeed(w http.ResponseWriter, r *http.Request) {
	view, err := s.rt.DashboardView(r.Context())
	if err != nil {
		slog.Error("partial activity feed", "err", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	s.renderPartial(w, "activity_feed.html", map[string]any{
		"Feed": view.ActivityFeed,
	})
}

func (s *Server) handlePartialRepoCards(w http.ResponseWriter, r *http.Request) {
	cards, err := s.rt.RepositoryCards(r.Context())
	if err != nil {
		slog.Error("partial repo cards", "err", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	s.renderPartial(w, "repo_cards.html", map[string]any{
		"Cards": cards,
	})
}
