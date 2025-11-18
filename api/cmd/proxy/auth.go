package main

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var jwtSecret = []byte("your-secret-key") // À changer en production

// ErrorResponse représente une réponse d'erreur JSON
type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message"`
	Status  int    `json:"status"`
}

// jsonError envoie une réponse d'erreur au format JSON
func jsonError(w http.ResponseWriter, message string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(ErrorResponse{
		Error:   http.StatusText(status),
		Message: message,
		Status:  status,
	})
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

type CreateUserRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Role     string `json:"role"` // "admin" ou "user"
}

// HandleLogin gère l'authentification
func HandleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	var user User

	// Chercher l'utilisateur dans la BDD
	if err := db.Where("username = ?", req.Username).First(&user).Error; err != nil {
		jsonError(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		jsonError(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	// Générer JWT
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id":  user.ID,
		"username": user.Username,
		"role":     user.Role,
		"exp":      time.Now().Add(24 * time.Hour).Unix(),
	})

	tokenString, err := token.SignedString(jwtSecret)
	if err != nil {
		jsonError(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}

	response := LoginResponse{
		Token: tokenString,
		User:  user,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// HandleCreateUser permet de créer un nouvel utilisateur (nécessite admin)
func HandleCreateUser(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Vérifier le token
	userID, err := validateToken(r)
	if err != nil {
		jsonError(w, err.Error(), http.StatusUnauthorized)
		return
	}

	var currentUser User
	if err := db.First(&currentUser, userID).Error; err != nil || currentUser.Role != "admin" {
		jsonError(w, "Admin access required", http.StatusForbidden)
		return
	}

	var req CreateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Empêcher la création/modification de l'utilisateur root
	if req.Username == "root" {
		jsonError(w, "Cannot create user 'root', it is reserved", http.StatusForbidden)
		return
	}

	// Valider le rôle
	if req.Role != "admin" && req.Role != "user" {
		req.Role = "user" // Par défaut
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		jsonError(w, "Failed to hash password", http.StatusInternalServerError)
		return
	}

	// Vérifier si un utilisateur avec ce username existe déjà (même soft-deleted)
	var existingUser User
	err = db.Unscoped().Where("username = ?", req.Username).First(&existingUser).Error

	if err == nil {
		// L'utilisateur existe déjà
		if existingUser.DeletedAt.Valid {
			// L'utilisateur était supprimé, on le réactive
			existingUser.DeletedAt = gorm.DeletedAt{}
			existingUser.Password = string(hashedPassword)
			existingUser.Role = req.Role

			if err := db.Unscoped().Save(&existingUser).Error; err != nil {
				log.Printf("Failed to reactivate user '%s': %v", req.Username, err)
				jsonError(w, "Failed to reactivate user", http.StatusInternalServerError)
				return
			}

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(existingUser)
			return
		} else {
			// L'utilisateur existe et n'est pas supprimé
			jsonError(w, "Username already exists", http.StatusConflict)
			return
		}
	}

	// L'utilisateur n'existe pas, on le crée
	user := User{
		Username: req.Username,
		Password: string(hashedPassword),
		Role:     req.Role,
	}

	if err := db.Create(&user).Error; err != nil {
		// Log l'erreur pour déboguer
		log.Printf("Failed to create user '%s': %v", req.Username, err)
		jsonError(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

// HandleListUsers liste tous les utilisateurs (nécessite admin)
func HandleListUsers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Vérifier le token
	userID, err := validateToken(r)
	if err != nil {
		jsonError(w, err.Error(), http.StatusUnauthorized)
		return
	}

	var currentUser User
	if err := db.First(&currentUser, userID).Error; err != nil || currentUser.Role != "admin" {
		jsonError(w, "Admin access required", http.StatusForbidden)
		return
	}

	var users []User
	if err := db.Find(&users).Error; err != nil {
		jsonError(w, "Failed to list users", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}

// HandleUpdateUser met à jour un utilisateur (nécessite admin)
func HandleUpdateUser(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Vérifier le token
	userID, err := validateToken(r)
	if err != nil {
		jsonError(w, err.Error(), http.StatusUnauthorized)
		return
	}

	var currentUser User
	if err := db.First(&currentUser, userID).Error; err != nil || currentUser.Role != "admin" {
		jsonError(w, "Admin access required", http.StatusForbidden)
		return
	}

	// Extraire l'ID de l'utilisateur depuis l'URL
	// URL format: /api/auth/users/{id}
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 5 {
		jsonError(w, "Invalid path", http.StatusBadRequest)
		return
	}
	targetUserID := pathParts[4]

	var targetUser User
	if err := db.First(&targetUser, targetUserID).Error; err != nil {
		jsonError(w, "User not found", http.StatusNotFound)
		return
	}

	// Empêcher la modification de l'utilisateur root
	if targetUser.Username == "root" {
		jsonError(w, "Cannot modify root user", http.StatusForbidden)
		return
	}

	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
		Role     string `json:"role"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Mettre à jour les champs
	if req.Username != "" {
		targetUser.Username = req.Username
	}
	if req.Password != "" {
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			jsonError(w, "Failed to hash password", http.StatusInternalServerError)
			return
		}
		targetUser.Password = string(hashedPassword)
	}
	if req.Role != "" {
		if req.Role != "admin" && req.Role != "user" {
			jsonError(w, "Invalid role", http.StatusBadRequest)
			return
		}
		targetUser.Role = req.Role
	}

	if err := db.Save(&targetUser).Error; err != nil {
		jsonError(w, "Failed to update user", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(targetUser)
}

// HandleDeleteUser supprime un utilisateur (nécessite admin)
func HandleDeleteUser(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Vérifier le token
	userID, err := validateToken(r)
	if err != nil {
		jsonError(w, err.Error(), http.StatusUnauthorized)
		return
	}

	var currentUser User
	if err := db.First(&currentUser, userID).Error; err != nil || currentUser.Role != "admin" {
		jsonError(w, "Admin access required", http.StatusForbidden)
		return
	}

	// Extraire l'ID de l'utilisateur depuis l'URL
	// URL format: /api/auth/users/{id}
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 5 {
		jsonError(w, "Invalid path", http.StatusBadRequest)
		return
	}
	targetUserID := pathParts[4]

	var targetUser User
	if err := db.First(&targetUser, targetUserID).Error; err != nil {
		jsonError(w, "User not found", http.StatusNotFound)
		return
	}

	// Empêcher la suppression de l'utilisateur root
	if targetUser.Username == "root" {
		jsonError(w, "Cannot delete root user", http.StatusForbidden)
		return
	}

	// Utiliser Unscoped() pour vraiment supprimer l'utilisateur (hard delete)
	// Sans ça, GORM fait un soft delete et le username reste "pris"
	if err := db.Unscoped().Delete(&targetUser).Error; err != nil {
		jsonError(w, "Failed to delete user", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// validateToken valide le JWT et retourne l'user ID
func validateToken(r *http.Request) (uint, error) {
	tokenString := r.Header.Get("Authorization")
	if tokenString == "" {
		return 0, errors.New("authorization header missing")
	}

	// Supprimer "Bearer " si présent
	if len(tokenString) > 7 && tokenString[:7] == "Bearer " {
		tokenString = tokenString[7:]
	}

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		// Vérifier que la méthode de signature est correcte
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("invalid signing method")
		}
		return jwtSecret, nil
	})

	if err != nil {
		// Vérifier si c'est une erreur d'expiration
		if errors.Is(err, jwt.ErrTokenExpired) {
			return 0, errors.New("token expired")
		}
		return 0, errors.New("invalid token")
	}

	if !token.Valid {
		return 0, errors.New("invalid token")
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok {
		if userID, ok := claims["user_id"].(float64); ok {
			return uint(userID), nil
		}
	}

	return 0, errors.New("invalid token claims")
}
