package main

import (
	"fmt"
	"log"
	"time"

	"gorm.io/gorm"
)

// SchemaVersion suit la version du schéma de base de données
type SchemaVersion struct {
	ID      uint   `gorm:"primaryKey"`
	Version int    `gorm:"not null;uniqueIndex"`
	Applied string `gorm:"not null"` // Timestamp d'application
}

// RunMigrations exécute toutes les migrations nécessaires
func RunMigrations(db *gorm.DB) error {
	// Créer la table de versions si elle n'existe pas
	if err := db.AutoMigrate(&SchemaVersion{}); err != nil {
		return fmt.Errorf("failed to create schema_versions table: %w", err)
	}

	// AutoMigrate des modèles principaux (ajoute nouvelles colonnes/tables)
	if err := db.AutoMigrate(&User{}, &S3Config{}); err != nil {
		return fmt.Errorf("failed to auto-migrate models: %w", err)
	}

	// Récupérer la version actuelle
	var currentVersion int
	var sv SchemaVersion
	if err := db.Order("version DESC").First(&sv).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			currentVersion = 0
		} else {
			return fmt.Errorf("failed to get current schema version: %w", err)
		}
	} else {
		currentVersion = sv.Version
	}

	log.Printf("Current schema version: %d", currentVersion)

	// Appliquer les migrations dans l'ordre
	migrations := []Migration{
		{Version: 1, Name: "initial_schema", Up: migration1_InitialSchema},
		// Ajouter ici les futures migrations
		// {Version: 2, Name: "add_user_email", Up: migration2_AddUserEmail},
	}

	for _, migration := range migrations {
		if migration.Version <= currentVersion {
			continue // Déjà appliquée
		}

		log.Printf("Applying migration %d: %s", migration.Version, migration.Name)

		// Exécuter la migration dans une transaction
		if err := db.Transaction(func(tx *gorm.DB) error {
			if err := migration.Up(tx); err != nil {
				return fmt.Errorf("migration %d failed: %w", migration.Version, err)
			}

			// Enregistrer la version
			return tx.Create(&SchemaVersion{
				Version: migration.Version,
				Applied: time.Now().Format(time.RFC3339),
			}).Error
		}); err != nil {
			return err
		}

		log.Printf("Migration %d applied successfully", migration.Version)
	}

	return nil
}

// Migration représente une migration de schéma
type Migration struct {
	Version int
	Name    string
	Up      func(*gorm.DB) error
}

// migration1_InitialSchema : Migration initiale (pas de changement nécessaire si déjà créé par AutoMigrate)
func migration1_InitialSchema(db *gorm.DB) error {
	// AutoMigrate a déjà créé les tables, cette migration sert juste de marqueur
	log.Println("Initial schema already created by AutoMigrate")
	return nil
}

// Exemples de futures migrations :

/*
// migration2_AddUserEmail : Ajoute une colonne email aux utilisateurs
func migration2_AddUserEmail(db *gorm.DB) error {
	return db.Exec("ALTER TABLE users ADD COLUMN email VARCHAR(255)").Error
}

// migration3_RemoveOldColumn : Supprime une ancienne colonne
func migration3_RemoveOldColumn(db *gorm.DB) error {
	return db.Exec("ALTER TABLE s3_configs DROP COLUMN old_field").Error
}

// migration4_ChangeColumnType : Modifie le type d'une colonne
func migration4_ChangeColumnType(db *gorm.DB) error {
	// SQLite ne supporte pas ALTER COLUMN, il faut recréer la table
	return db.Transaction(func(tx *gorm.DB) error {
		// 1. Créer une table temporaire avec le nouveau schéma
		if err := tx.Exec(`
			CREATE TABLE users_new (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				created_at DATETIME,
				updated_at DATETIME,
				deleted_at DATETIME,
				username VARCHAR(255) NOT NULL UNIQUE,
				password VARCHAR(255) NOT NULL,
				role VARCHAR(50) DEFAULT 'user',
				email VARCHAR(255) -- Nouveau type/colonne
			)
		`).Error; err != nil {
			return err
		}

		// 2. Copier les données
		if err := tx.Exec(`
			INSERT INTO users_new (id, created_at, updated_at, deleted_at, username, password, role)
			SELECT id, created_at, updated_at, deleted_at, username, password, role FROM users
		`).Error; err != nil {
			return err
		}

		// 3. Supprimer l'ancienne table
		if err := tx.Exec("DROP TABLE users").Error; err != nil {
			return err
		}

		// 4. Renommer la nouvelle table
		if err := tx.Exec("ALTER TABLE users_new RENAME TO users").Error; err != nil {
			return err
		}

		// 5. Recréer les index
		return tx.Exec("CREATE UNIQUE INDEX idx_users_username ON users(username)").Error
	})
}
*/
