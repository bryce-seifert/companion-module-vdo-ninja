/**
 * Drives a real VDO.Ninja page in headless Chromium through a local relay, and checks that the
 * module's actions change the page and that the module's state follows.
 *
 * Needs internet access (the page loads from vdo.ninja) and Chromium (`yarn test:e2e:install`).
 * Set VDO_NINJA_URL to test another VDO.Ninja release.
 */
import { randomUUID } from 'node:crypto'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ActionsSchema } from '../../actions.js'
import { VdoNinjaClient } from '../../client.js'
import { GetVariableValues } from '../../variables.js'
import { checkFeedback, runAction } from '../helpers/definitions.js'
import { TestRelay } from '../helpers/relay.js'

const VdoNinjaUrl = process.env.VDO_NINJA_URL ?? 'https://vdo.ninja/v30/'

type PageState = { muted: boolean; videoMuted: boolean; speakerMuted: boolean }

describe('local commands against VDO.Ninja', () => {
	const apiID = `e2e-${randomUUID()}`
	const streamID = `e2e${randomUUID().replaceAll('-', '').slice(0, 12)}`

	let relay: TestRelay
	let browser: Browser
	let page: Page
	let client: VdoNinjaClient

	async function run<K extends keyof ActionsSchema>(id: K, options: ActionsSchema[K]['options']): Promise<void> {
		await runAction(client, id, options)
	}

	async function pageState(): Promise<PageState> {
		return page.evaluate(() => {
			// `session` is VDO.Ninja's global state object
			const session = (globalThis as unknown as { session: PageState }).session
			return { muted: session.muted, videoMuted: session.videoMuted, speakerMuted: session.speakerMuted }
		})
	}

	function feedback(id: 'mic' | 'camera' | 'speaker', state: boolean): unknown {
		return checkFeedback(client, id, { stream: streamID, state })
	}

	beforeAll(async () => {
		relay = await TestRelay.start()
		browser = await chromium.launch({
			args: [
				'--use-fake-device-for-media-stream',
				'--use-fake-ui-for-media-stream',
				// Lets the public vdo.ninja page open a websocket to the relay on localhost
				'--disable-features=LocalNetworkAccessChecks',
			],
		})
		page = await browser.newPage()

		const url = new URL(VdoNinjaUrl)
		url.searchParams.set('push', streamID)
		url.searchParams.set('api', apiID)
		url.searchParams.set('apiserver', relay.url)
		url.searchParams.set('autostart', '')
		url.searchParams.set('webcam', '')
		await page.goto(url.toString())
		await vi.waitUntil(() => relay.members(apiID) === 1, { timeout: 30_000 })

		client = new VdoNinjaClient({ url: relay.url, apiID, reconnectDelay: 100 })
		client.connect()
		await vi.waitUntil(() => client.states[streamID] !== undefined, { timeout: 10_000 })
	})

	afterAll(async () => {
		client?.destroy()
		await browser?.close()
		await relay?.stop()
	})

	it('loads the local stream from the page', () => {
		expect(client.streams).toEqual([{ id: streamID, label: `${streamID} (Local)` }])
		expect(GetVariableValues(client.states)).toMatchObject({
			[`${streamID}_mic`]: 'Unmuted',
			[`${streamID}_camera`]: 'Unmuted',
		})
	})

	it.each([
		['mic', 'muted', 'false', true],
		['mic', 'muted', 'true', false],
		['camera', 'videoMuted', 'false', true],
		['camera', 'videoMuted', 'true', false],
		['speaker', 'speakerMuted', 'false', true],
		['speaker', 'speakerMuted', 'true', false],
	] as const)('%s sets %s from value %s on the page and in the module', async (id, field, value, muted) => {
		await run(id, { value })

		await vi.waitFor(async () => expect((await pageState())[field]).toBe(muted))
		await vi.waitFor(() => expect(client.states[streamID][field]).toBe(muted))
		expect(feedback(id, true)).toBe(muted)
	})

	it.each([
		['mic', 'muted'],
		['camera', 'videoMuted'],
		['speaker', 'speakerMuted'],
	] as const)('%s toggle flips %s and the module follows', async (id, field) => {
		const before = (await pageState())[field]

		await run(id, { value: 'toggle' })

		await vi.waitFor(async () => expect((await pageState())[field]).toBe(!before))
		await vi.waitFor(() => expect(client.states[streamID][field]).toBe(!before))
	})

	it('reports the mic in the variables', async () => {
		await run('mic', { value: 'false' })
		await vi.waitFor(() => expect(GetVariableValues(client.states)[`${streamID}_mic`]).toBe('Muted'))
		await run('mic', { value: 'true' })
		await vi.waitFor(() => expect(GetVariableValues(client.states)[`${streamID}_mic`]).toBe('Unmuted'))
	})
})
