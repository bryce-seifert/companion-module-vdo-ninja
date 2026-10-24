import type { CompanionStaticUpgradeResult, CompanionStaticUpgradeScript } from '@companion-module/base'
import type { ModuleConfig } from './config.js'

const customWebsocketsConfig: CompanionStaticUpgradeScript<ModuleConfig> = (_context, props) => {
	const changed: CompanionStaticUpgradeResult<ModuleConfig, undefined> = {
		updatedConfig: null,
		updatedActions: [],
		updatedFeedbacks: [],
	}
	if (props.config !== null) {
		const config = props.config
		if (config.wsCustom == undefined || config.wsCustom == null) {
			config.wsCustom = false
			config.wsServer = 'api.vdo.ninja'
			changed.updatedConfig = config
		}
	}
	return changed
}

export const UpgradeScripts: CompanionStaticUpgradeScript<ModuleConfig>[] = [customWebsocketsConfig]
