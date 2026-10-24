import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import { GetActions, type ActionsSchema } from './actions.js'
import type { GuestCommands, GuestTarget, LocalCommands } from './api.js'
import { VdoNinjaClient, type ClientStatus } from './client.js'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { GetFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { GetPresets } from './presets.js'
import { UpgradeScripts } from './upgrades.js'
import { GetVariableDefinitions, GetVariableValues, type VariablesSchema } from './variables.js'

export type ModuleSchema = {
	config: ModuleConfig
	secrets: undefined
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	variables: VariablesSchema
}

export { UpgradeScripts }

const StatusMap: Record<ClientStatus, InstanceStatus> = {
	connecting: InstanceStatus.Connecting,
	ok: InstanceStatus.Ok,
	connection_failure: InstanceStatus.ConnectionFailure,
}

export default class VDONinjaInstance extends InstanceBase<ModuleSchema> {
	config!: ModuleConfig
	client: VdoNinjaClient | undefined

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config
		this.setActionDefinitions(GetActions(this))
		this.connect()
	}

	async destroy(): Promise<void> {
		this.client?.destroy()
		this.client = undefined
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		this.connect()
	}

	connect(): void {
		this.client?.destroy()
		this.client = undefined

		if (!this.config.apiID) {
			this.log('warn', `API ID required to connect to VDO.Ninja, please add one in the module settings`)
			this.updateStatus(InstanceStatus.BadConfig, 'Missing API ID')
			this.updateDefinitions()
			return
		}

		const server = this.config.wsCustom && this.config.wsServer ? this.config.wsServer : 'api.vdo.ninja'
		const client = new VdoNinjaClient({ url: `wss://${server}:443`, apiID: this.config.apiID, reconnectDelay: 1000 })
		this.client = client

		client.on('status', (status) => this.updateStatus(StatusMap[status]))
		client.on('log', (level, message) => this.log(level, message))
		client.on('streamsChanged', () => this.updateDefinitions())
		client.on('stateChanged', () => {
			this.setVariableValues(GetVariableValues(client.states))
			this.checkAllFeedbacks()
		})

		this.updateStatus(InstanceStatus.Connecting)
		this.updateDefinitions()
		client.connect()
	}

	/** Rebuild everything that is defined per stream */
	updateDefinitions(): void {
		const source = this.client ?? { states: {}, streams: [] }
		this.setFeedbackDefinitions(GetFeedbacks(source))
		this.setVariableDefinitions(GetVariableDefinitions(source.states))
		const { structure, presets } = GetPresets(source.states)
		this.setPresetDefinitions(structure, presets)
	}

	sendLocal<K extends keyof LocalCommands>(action: K, args: LocalCommands[K]): void {
		this.client?.sendLocal(action, args)
	}

	sendGuest<K extends keyof GuestCommands>(action: K, target: GuestTarget, args: GuestCommands[K]): void {
		this.client?.sendGuest(action, target, args)
	}
}
