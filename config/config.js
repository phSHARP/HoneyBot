'use strict';

const cfg = require('./config.json');

const { Constants } = require('discord.js');

// Initializes some options as functions
function initFunctions() {
	const displayAvatarURL = cfg.client.displayAvatarURL;
	cfg.client.displayAvatarURL = () => displayAvatarURL;
}

// Switches string values of command types into int values according to Discord API
function initCommandTypes() {
	// Seems like asymptotic computational complexity here is O(N^3), but N is actually so small that it proceeds fast
	for (const cmdOptions of Object.values(cfg.manager.commands))
		if (cmdOptions.applicationCommands) {
			for (const app of Object.values(cmdOptions.applicationCommands)) {
				app.type = Constants.ApplicationCommandTypes[app.type];
				for (const option of Object.values(app.options))
					option.type = Constants.ApplicationCommandOptionTypes[option.type];
			}
		}
}

// Initialization block
initFunctions();
initCommandTypes();

module.exports = cfg;
