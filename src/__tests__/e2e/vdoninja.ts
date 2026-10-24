import { randomUUID } from 'node:crypto'
import { chromium, type Browser, type Page } from 'playwright'
import { vi } from 'vitest'
import { VdoNinjaClient } from '../../client.js'
import { TestRelay } from '../helpers/relay.js'

const VdoNinjaUrl = process.env.VDO_NINJA_URL ?? 'https://vdo.ninja/v30/'

/** A short random ID, valid as a VDO.Ninja stream ID or room name */
export function randomId(prefix: string): string {
	return `${prefix}${randomUUID().replaceAll('-', '').slice(0, 12)}`
}

/** Waits for VDO.Ninja, which can take a few seconds to pass state between pages */
export async function eventually(assertion: () => unknown): Promise<void> {
	await vi.waitFor(assertion, { timeout: 15_000, interval: 100 })
}

/** Waits for a condition during setup, where assertions are not allowed */
export async function until(condition: () => boolean): Promise<void> {
	await vi.waitUntil(condition, { timeout: 15_000, interval: 100 })
}

/**
 * A relay, a headless Chromium and the module's client, joined to one API ID.
 * Pages opened with `api: true` control and report to the client through the relay.
 */
export class VdoNinjaHarness {
	readonly apiID = randomId('e2e')
	readonly client: VdoNinjaClient

	private constructor(
		readonly relay: TestRelay,
		readonly browser: Browser,
	) {
		this.client = new VdoNinjaClient({
			url: relay.url,
			apiID: this.apiID,
			minReconnectDelay: 100,
			maxReconnectDelay: 1000,
			heartbeatInterval: 5000,
			detailsDelay: 50,
		})
	}

	static async start(): Promise<VdoNinjaHarness> {
		const relay = await TestRelay.start()
		const browser = await chromium.launch({
			args: [
				'--use-fake-device-for-media-stream',
				'--use-fake-ui-for-media-stream',
				// Lets the public vdo.ninja page open a websocket to the relay on localhost
				'--disable-features=LocalNetworkAccessChecks',
			],
		})
		return new VdoNinjaHarness(relay, browser)
	}

	/** Opens a VDO.Ninja page; with `api` it joins the relay and waits until it has connected */
	async open(params: Record<string, string>, api: boolean): Promise<Page> {
		const page = await this.browser.newPage()
		const url = new URL(VdoNinjaUrl)
		for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
		if (api) {
			url.searchParams.set('api', this.apiID)
			url.searchParams.set('apiserver', this.relay.url)
		}

		const members = this.relay.members(this.apiID)
		await page.goto(url.toString())
		if (api) await vi.waitUntil(() => this.relay.members(this.apiID) > members, { timeout: 30_000 })
		return page
	}

	async stop(): Promise<void> {
		this.client.destroy()
		await this.browser.close()
		await this.relay.stop()
	}
}

/** Reads fields of VDO.Ninja's global `session` object on a page */
export async function sessionState<K extends string>(page: Page, keys: K[]): Promise<Record<K, unknown>> {
	return page.evaluate((keys) => {
		const session = (globalThis as unknown as { session: Record<string, unknown> }).session
		return Object.fromEntries(keys.map((key) => [key, session[key]]))
	}, keys) as Promise<Record<K, unknown>>
}
