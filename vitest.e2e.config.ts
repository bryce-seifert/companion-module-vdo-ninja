import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		include: ['src/**/*.e2e.ts'],
		testTimeout: 60_000,
		hookTimeout: 60_000,
		// One browser and relay are shared by every test in a file
		fileParallelism: false,
	},
})
