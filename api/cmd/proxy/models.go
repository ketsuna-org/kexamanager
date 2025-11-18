package main

import (
	"time"

	"gorm.io/gorm"
)

// User représente un utilisateur du système
type User struct {
	gorm.Model
	Username string `gorm:"uniqueIndex;not null" json:"username"`
	Password string `gorm:"not null" json:"-"`          // Ne pas exposer en JSON
	Role     string `gorm:"default:'user'" json:"role"` // "admin" ou "user"
}

// S3Config représente une configuration S3 pour un utilisateur
type S3Config struct {
	ID             uint `gorm:"primaryKey" json:"id"`
	CreatedAt      time.Time
	UpdatedAt      time.Time
	DeletedAt      gorm.DeletedAt `gorm:"index"`
	UserID         uint           `gorm:"not null" json:"user_id"`
	Name           string         `gorm:"not null" json:"name"` // Nom de la config (ex: "Mon Garage", "AWS S3")
	Type           string         `gorm:"not null" json:"type"` // "garage" ou "s3"
	S3URL          string         `json:"s3_url,omitempty"`     // URL S3 (pour les deux types)
	AdminURL       string         `json:"admin_url,omitempty"`  // URL Admin (seulement pour Garage)
	AdminToken     string         `gorm:"not null" json:"-"`    // Token API admin (seulement pour Garage) - Ne pas exposer en JSON
	ClientID       string         `gorm:"not null" json:"client_id"`
	ClientSecret   string         `gorm:"not null" json:"-"` // Ne pas exposer en JSON
	Region         string         `gorm:"default:'us-east-1'" json:"region"`
	ForcePathStyle bool           `gorm:"default:true" json:"force_path_style"`
}

// S3Credentials représente les credentials S3 (pour compatibilité)
type S3Credentials struct {
	Endpoint        string `json:"endpoint"`
	AccessKeyID     string `json:"accessKeyId"`
	SecretAccessKey string `json:"secretAccessKey"`
	Region          string `json:"region,omitempty"`
	ForcePathStyle  bool   `json:"forcePathStyle,omitempty"`
}
