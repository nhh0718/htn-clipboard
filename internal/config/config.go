package config

import (
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/google/uuid"
)

// Config holds application configuration.
type Config struct {
	Port          int    `json:"port"`
	AuthToken     string `json:"authToken"`
	RetentionDays int    `json:"retentionDays"`
	MaxItems      int    `json:"maxItems"`
	Hotkey        string `json:"hotkey"`
	DataDir       string `json:"dataDir"`
	AutoStart     bool   `json:"autoStart"` // launch on system boot (default: true)
}

func configDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".clipboard-pro")
}

func configPath() string {
	return filepath.Join(configDir(), "config.json")
}

func defaultDataDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".clipboard-pro", "data")
}

func defaults() *Config {
	return &Config{
		Port:          27843,
		AuthToken:     uuid.New().String(),
		RetentionDays: 30,
		MaxItems:      1000,
		Hotkey:        "ctrl+shift+v",
		DataDir:       defaultDataDir(),
		AutoStart:     true,
	}
}

// Load reads config from ~/.clipboard-pro/config.json.
// Creates file with defaults if missing.
func Load() (*Config, error) {
	if err := os.MkdirAll(configDir(), 0700); err != nil {
		return nil, err
	}

	data, err := os.ReadFile(configPath())
	if os.IsNotExist(err) {
		cfg := defaults()
		if saveErr := Save(cfg); saveErr != nil {
			return nil, saveErr
		}
		return cfg, nil
	}
	if err != nil {
		return nil, err
	}

	cfg := defaults() // start with defaults so new fields have fallback
	if err := json.Unmarshal(data, cfg); err != nil {
		return nil, err
	}
	return cfg, nil
}

// Save writes config to ~/.clipboard-pro/config.json with 0600 permissions.
func Save(cfg *Config) error {
	if err := os.MkdirAll(configDir(), 0700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(configPath(), data, 0600)
}
