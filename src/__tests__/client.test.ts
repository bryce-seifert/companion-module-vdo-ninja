import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'
import { VdoNinjaClient } from '../client.js'
import getDetailsPush from './fixtures/getDetails-push.json' with { type: 'json' }
import { TestRelay } from './helpers/relay.js'
import { director, guest, local, statesOf } from './helpers/streams.js'

const json = (value: unknown) => JSON.stringify(value)

function makeClient(url = 'ws://127.0.0.1:1') {
	return new VdoNinjaClient({ url, apiID: 'test-api', reconnectDelay: 50 })
}

function withStreams(client: VdoNinjaClient, ...streams: Parameters<typeof statesOf>) {
	client.handleMessage(json({ callback: { action: 'getDetails', result: statesOf(...streams) } }))
}

describe('VdoNinjaClient state', () => {
	it('loads streams from a getDetails reply', () => {
		const client = makeClient()
		const streamsChanged = vi.fn()
		client.on('streamsChanged', streamsChanged)

		client.handleMessage(json(getDetailsPush))

		expect(Object.keys(client.states)).toEqual(['fixturestream'])
		expect(client.streams).toEqual([{ id: 'fixturestream', label: 'Fixture (Local)' }])
		expect(streamsChanged).toHaveBeenCalled()
	})

	it('labels the director, guests and local stream', () => {
		const client = makeClient()
		withStreams(client, director, guest, local)
		expect(client.streams).toEqual([
			{ id: 'directorStream', label: 'Director' },
			{ id: 'guestStream', label: 'Guest 2 (Alice)' },
			{ id: 'localStream', label: 'localStream (Local)' },
		])
	})

	it('replaces a stream it already knows rather than adding it again', () => {
		const client = makeClient()
		withStreams(client, guest)
		withStreams(client, { ...guest, label: 'Bob' })
		expect(client.streams).toEqual([{ id: 'guestStream', label: 'Guest 2 (Bob)' }])
	})

	it.each([
		['muted', 'muted'],
		['mic', 'muted'],
		['remoteMuted', 'muted'],
		['videoMuted', 'videoMuted'],
		['camera', 'videoMuted'],
		['remoteVideoMuted', 'videoMuted'],
		['speakerMuted', 'speakerMuted'],
		['speaker', 'speakerMuted'],
	] as const)('applies a %s update to %s', (action, field) => {
		const client = makeClient()
		withStreams(client, local)
		const stateChanged = vi.fn()
		client.on('stateChanged', stateChanged)

		client.handleMessage(json({ update: { streamID: 'localStream', action, value: true } }))

		expect(client.states.localStream[field]).toBe(true)
		expect(stateChanged).toHaveBeenCalledOnce()
	})

	it('records director mute and hide as the director controls do', () => {
		const client = makeClient()
		withStreams(client, guest)
		client.handleMessage(json({ update: { streamID: 'guestStream', action: 'directorMuted', value: true } }))
		client.handleMessage(json({ update: { streamID: 'guestStream', action: 'directorVideoHide', value: true } }))
		expect(client.states.guestStream.others).toEqual({ 'mute-guest': '1', 'hide-guest': '1' })
	})

	it('removes a stream that hangs up', () => {
		const client = makeClient()
		withStreams(client, director, guest)
		client.handleMessage(json({ update: { streamID: 'guestStream', action: 'hangup', value: true } }))
		expect(Object.keys(client.states)).toEqual(['directorStream'])
		expect(client.streams.map((s) => s.id)).toEqual(['directorStream'])
	})

	it('removes the stream named by endViewConnection', () => {
		const client = makeClient()
		withStreams(client, director, guest)
		client.handleMessage(
			json({ update: { streamID: 'directorStream', action: 'endViewConnection', value: 'guestStream' } }),
		)
		expect(client.streams.map((s) => s.id)).toEqual(['directorStream'])
	})

	it('leaves the other streams alone when an unknown stream ends', () => {
		const client = makeClient()
		withStreams(client, director, guest)
		client.handleMessage(json({ update: { streamID: 'directorStream', action: 'endViewConnection', value: 'nobody' } }))
		expect(client.streams.map((s) => s.id)).toEqual(['directorStream', 'guestStream'])
	})

	it('ignores updates for streams it does not know', () => {
		const client = makeClient()
		withStreams(client, local)
		const stateChanged = vi.fn()
		client.on('stateChanged', stateChanged)
		client.handleMessage(json({ update: { streamID: 'stranger', action: 'muted', value: true } }))
		expect(stateChanged).not.toHaveBeenCalled()
	})

	it('applies the result of a local mute command to the local stream', () => {
		const client = makeClient()
		withStreams(client, local, guest)
		client.handleMessage(json({ callback: { action: 'mic', value: false, local: true, result: true } }))
		expect(client.states.localStream.muted).toBe(true)
		expect(client.states.guestStream.muted).toBe(false)
	})

	it('applies the result of a local speaker command to the local stream', () => {
		const client = makeClient()
		withStreams(client, local)
		client.handleMessage(json({ callback: { action: 'speaker', value: false, local: true, result: true } }))
		expect(client.states.localStream.speakerMuted).toBe(true)
	})

	it('waits for the update after a local toggle rather than using its result', () => {
		const client = makeClient()
		withStreams(client, local)
		client.handleMessage(json({ callback: { action: 'mic', value: 'toggle', local: true, result: true } }))
		expect(client.states.localStream.muted).toBe(false)
	})

	it('logs messages it ignores', () => {
		const client = makeClient()
		const log = vi.fn()
		client.on('log', log)
		client.handleMessage('{nope')
		expect(log).toHaveBeenCalledWith('debug', 'Ignored VDO.Ninja message: invalid JSON')
	})
})

describe('VdoNinjaClient connection', () => {
	let relay: TestRelay
	let page: WebSocket
	const fromClient: unknown[] = []

	beforeEach(async () => {
		relay = await TestRelay.start()
		fromClient.length = 0
		// Plays the part of the VDO.Ninja page, joined to the same API ID
		page = new WebSocket(relay.url)
		await new Promise((resolve) => page.once('open', resolve))
		page.send(json({ join: 'test-api' }))
		page.on('message', (data: Buffer) => fromClient.push(JSON.parse(data.toString())))
	})

	afterEach(async () => {
		page.close()
		await relay.stop()
	})

	it('joins the API ID and asks for details once connected', async () => {
		const client = makeClient(relay.url)
		const status = vi.fn()
		client.on('status', status)
		client.connect()

		await vi.waitFor(() => expect(fromClient).toContainEqual(expect.objectContaining({ action: 'getDetails' })))
		expect(status).toHaveBeenCalledWith('ok')
		client.destroy()
	})

	it('loads the streams the page reports', async () => {
		const client = makeClient(relay.url)
		client.connect()
		await vi.waitFor(() => expect(fromClient).toHaveLength(1))

		page.send(json(getDetailsPush))

		await vi.waitFor(() => expect(client.streams).toEqual([{ id: 'fixturestream', label: 'Fixture (Local)' }]))
		client.destroy()
	})

	it('reconnects after the relay drops it', async () => {
		const client = makeClient(relay.url)
		client.connect()
		await vi.waitFor(() => expect(relay.members('test-api')).toBe(2))

		relay.disconnectAll()
		page = new WebSocket(relay.url)
		await new Promise((resolve) => page.once('open', resolve))
		page.send(json({ join: 'test-api' }))

		await vi.waitFor(() => expect(relay.members('test-api')).toBe(2))
		client.destroy()
	})

	it('stays disconnected after destroy', async () => {
		const client = makeClient(relay.url)
		client.connect()
		await vi.waitFor(() => expect(relay.members('test-api')).toBe(2))

		client.destroy()
		await vi.waitFor(() => expect(relay.members('test-api')).toBe(1))
		await new Promise((resolve) => setTimeout(resolve, 200))
		expect(relay.members('test-api')).toBe(1)
	})

	it('does not send while disconnected', () => {
		const client = makeClient(relay.url)
		expect(() => client.sendLocal('reload', {})).not.toThrow()
	})
})
