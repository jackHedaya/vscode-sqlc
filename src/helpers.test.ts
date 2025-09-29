import * as assert from 'assert';
import { resolveRelativeGlob, matchQueryDefinition } from './helpers';

describe("Helper functions", () => {
	it("resolveRelativeGlob", () => {
		const basePath = "/path/to/config.yaml";
		
		assert.strictEqual(resolveRelativeGlob(basePath, "."), "/path/to/*");
		assert.strictEqual(resolveRelativeGlob(basePath, "*.sql"), "/path/to/*.sql");
		assert.strictEqual(resolveRelativeGlob(basePath, "queries/**/*.sql"), "/path/to/queries/**/*.sql");
	});

	it("matchQueryDefinition", () => {
		const testCases: { line: string; expected: { name: string; command: string; } | null; }[] = [
			{ line: "-- name: GetUser :one", expected: { name: "GetUser", command: ":one" } },
			{ line: "   -- name: ListUsers :many", expected: { name: "ListUsers", command: ":many" } },
			{ line: "--name:NoSpace :exec", expected: null },
			{ line: "-- name: Invalid-Name :one", expected: null },
			{ line: "-- some other comment", expected: null },
			{ line: "SELECT * FROM users;", expected: null },
		];

		for (const { line, expected } of testCases) {
			const result = matchQueryDefinition(line);
			if (expected === null) {
				assert.strictEqual(result, null, `Expected null for line: "${line}"`);
			} else {
				assert.deepStrictEqual(result, expected, `Mismatch for line: "${line}"`);
			}
		}
	});
});
