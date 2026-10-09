package s3

import (
	"context"
	"net/http"
)

// Fonctions à initialiser depuis main
var ValidateTokenFunc func(*http.Request) (uint, error)
var GetS3ConfigFunc func(uint, uint) (S3ConfigData, error)
var LogActionFunc func(uint, uint, string, string, string) error // projectID, userID, action, details, status

// InitHandlers initialise les fonctions nécessaires pour les handlers
func InitHandlers(validateFunc func(*http.Request) (uint, error), getConfigFunc func(uint, uint) (S3ConfigData, error), logFunc func(uint, uint, string, string, string) error) {
	ValidateTokenFunc = validateFunc
	GetS3ConfigFunc = getConfigFunc
	LogActionFunc = logFunc
}

type userIDContextKey struct{}

// WithUserID attache l'utilisateur authentifie a la requete, pour que les
// handlers *WithConfig puissent attribuer leurs entrees de journal.
func WithUserID(r *http.Request, userID uint) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), userIDContextKey{}, userID))
}

// UserIDFromRequest renvoie l'utilisateur attache par WithUserID, 0 (action
// systeme) s'il n'y en a pas.
func UserIDFromRequest(r *http.Request) uint {
	if userID, ok := r.Context().Value(userIDContextKey{}).(uint); ok {
		return userID
	}
	return 0
}
