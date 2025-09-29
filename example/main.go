package main

import (
	"context"
	"database/sql"
	"log"

	"sqlc-test/db"

	_ "github.com/lib/pq"
)

func main() {
	ctx := context.Background()

	// Connect to database
	conn, err := sql.Open("postgres", "postgresql://localhost/testdb?sslmode=disable")
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close()

	queries := db.New(conn)

	// Example usage
	user, err := queries.CreateUser(ctx, db.CreateUserParams{
		Username: "testuser",
		Email:    "test@example.com",
	})
	if err != nil {
		log.Fatal(err)
	}

	log.Printf("Created user: %+v", user)
}