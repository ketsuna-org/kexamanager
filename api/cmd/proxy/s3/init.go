package s3

import "net/http"

// Fonctions à initialiser depuis main
var ValidateTokenFunc func(*http.Request) (uint, error)
var GetS3ConfigFunc func(uint, uint) (S3ConfigData, error)

// InitHandlers initialise les fonctions nécessaires pour les handlers
func InitHandlers(validateFunc func(*http.Request) (uint, error), getConfigFunc func(uint, uint) (S3ConfigData, error)) {
	ValidateTokenFunc = validateFunc
	GetS3ConfigFunc = getConfigFunc
}
