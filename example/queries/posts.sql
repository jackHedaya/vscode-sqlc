-- name: GetPost :one
SELECT id, title, content, user_id, created_at FROM posts
WHERE id = $1 LIMIT 1;

-- name: ListPostsByUser :many
SELECT id, title, content, user_id, created_at FROM posts
WHERE user_id = $1
ORDER BY created_at DESC;

-- name: CreatePost :one
INSERT INTO posts (
  title, content, user_id
) VALUES (
  $1, $2, $3
)
RETURNING *;