import type { SomeCompanionConfigField } from '@companion-module/base'

export type ModuleConfig = {
	apiID: string
	wsCustom: boolean
	wsServer: string
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'textinput',
			id: 'apiID',
			label: 'API ID',
			width: 6,
		},
		{
			type: 'checkbox',
			id: 'wsCustom',
			label: 'Custom Websockets Server (Advanced)',
			default: false,
			width: 6,
		},
		{
			type: 'textinput',
			id: 'wsServer',
			label: 'Custom Websockets Server Domain',
			default: 'api.vdo.ninja',
			tooltip:
				'Only use this if you are self-hosting your own websockets server. Only include the domain, not "wss://" or port',
			width: 6,
			isVisibleExpression: '$(options:wsCustom)',
		},
	]
}
