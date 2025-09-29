-- name: GetUser :one
SELECT id, username, email, created_at FROM users
WHERE id = $1 LIMIT 1;

-- name: ListUsers :many
SELECT id, username, email, created_at FROM users
ORDER BY username;

-- name: CreateUser :one
INSERT INTO users (
  username, email
) VALUES (
  $1, $2
)
RETURNING *;

-- name: DeleteUser :exec
DELETE FROM users
WHERE id = $1;