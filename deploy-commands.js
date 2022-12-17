/*
	Register slash commands against the Discord API
*/

'use strict';

const debug = require('./config/debug.json');

const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

const auth = require('./config/auth.json');
const { client, guildTestId, manager } = require('./config/config');

const CLIENT_ID = debug ? client.testId : client.id;
const GUILD_ID = guildTestId;

const rest = new REST({ version: '9' }).setToken(auth.token);
const commandOptions = Object.values(manager.commands)
	.filter(commandOption => commandOption.applicationCommands);
const applicationCommands = [];

for (const option of commandOptions)
	for (const applicationCommand of option.applicationCommands)
		applicationCommands.push(applicationCommand);

(async () => {
	try {
		console.log('Started refreshing application commands.\n');
		
		if (debug) {
			console.log('[🔄] Refreshing for test guild...');
			await rest.put(
				Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
				{ body: applicationCommands }
			);
			console.log('[✅] DONE.\n');
		} else {
			console.log('[🔄] Deleting from test guild...');
			await rest.put(
				Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
				{ body: [] }
			);
			console.log('[✅] DONE.\n');
			console.log('[🔄] Refreshing globally...');
			await rest.put(
				Routes.applicationCommands(CLIENT_ID),
				{ body: applicationCommands }
			);
			console.log('[✅] DONE.\n');
		}
		
		console.log('Successfully reloaded application commands.');
	} catch (error) {
		console.error(error);
	}
})();
