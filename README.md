# SQLC for VS Code

A VS Code extension that provides enhanced Go-to-Definition support for [sqlc](https://github.com/sqlc-dev/sqlc) generated Go code.

## Features

- **Go-to-Definition**: Jump from sqlc-generated Go methods directly to their corresponding SQL queries
- **Automatic Indexing**: Automatically discovers and indexes sqlc configurations and SQL query files
- **Real-time Updates**: Watches for changes to sqlc configuration files and SQL queries, keeping the index up-to-date
- **Multi-workspace Support**: Works with multiple sqlc configurations in the same workspace

## How it Works

The extension scans your workspace for `sqlc.yaml` and `sqlc.yml` configuration files, then indexes all SQL query files specified in the `queries` field. When you use Go-to-Definition (F12) on a sqlc-generated method name in Go code, it will take you directly to the corresponding SQL query definition.

For example, if you have a SQL query like:
```sql
-- name: GetUser :one
SELECT * FROM users WHERE id = $1;
```

And sqlc generates a Go method `GetUser()`, you can press F12 on the method name to jump to the SQL query.

## Requirements

- VS Code 1.104.1 or higher
- A project using [sqlc](https://github.com/sqlc-dev/sqlc)
- Valid `sqlc.yaml` or `sqlc.yml` configuration files in your workspace

## Development

### Reloading

- `yarn watch`
- Start debugger in VSCode

### Testing

```bash
yarn test
```

### Packaging

```bash
yarn package
```

## License

This project is licensed under the MIT License.
