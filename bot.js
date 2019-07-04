const Discord = require('discord.js');
const logger = require('winston');
const Nightmare = require('nightmare');

const auth = require('./auth.json');
const cfg = require('./config.json');

const prefix = cfg.prefix;
const urlMap = cfg.urlMap;

// Listen for 'SIGTERM' signal
process.on('SIGTERM', () => {
	logger.info(`Shutted down at ${dateNow()}`);
	bot.destroy();
	process.exit();
});

// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(new logger.transports.Console, {
	colorize: true
});
logger.level = 'debug';

// Initialize Discord Bot
var bot = new Discord.Client({
	messageCacheMaxSize: 5,
	messageCacheLifetime: 120,
	messageSweepInterval: 60
});

// Initialize DynMap page listener
var dynmap = Nightmare().goto(urlMap).wait('div.dynmap');

bot.on('ready', (event) => {
	logger.info(`Connected at ${dateNow()}`);
	logger.info(`    Logged in as: ${bot.user.username} (id: ${bot.user.id})`);
	bot.user.setActivity('загрузку...');
});

// Listen for Bot's errors
bot.on('error', (e) => {
	console.log(`Oops, HoneyBot's error!\n    ${e}`);
});

// Triggers when the bot joins a guild
bot.on('guildCreate', (guild) => {
	logger.info(`New guild joined: ${guild.name} (id: ${guild.id}) at ${dateNow()}`);
	logger.info(`    This guild has ${guild.memberCount} members!`);
});

// Triggers when the bot is removed from a guild
bot.on('guildDelete', (guild) => {
	logger.info(`I've been removed from: ${guild.name} (id: ${guild.id}) at ${dateNow()}`);
});

setInterval(() => {
	var errorMessage = 'онлайн [0/0]';
	dynmap
		.evaluate(() => document.querySelector('div.panel').innerHTML)
		.then(response => {
			try {
				var players       = response.match(/<legend[^]*?>[^]*?\[([^]*?)\][^]*?<\/legend>/)[1];
				bot.user.setActivity(`онлайн [${players}]`, { type: 'WATCHING' }).catch((e) => {});
			} catch (e) {
				bot.user.setActivity(errorMessage, { type: 'WATCHING' }).catch((e) => {});
			}
		}).catch(err => {
			bot.user.setActivity(errorMessage, { type: 'WATCHING' }).catch((e) => {});
		});
}, 1000).unref();

// Generates random int from min (included) to max (not included)
function randomInt(min, max) {
	return Math.floor(Math.random() * (max - min)) + min;
}

// Returns Date.now() in string format
function dateNow() {
	var now = new Date(Date.now());
	return now.toString();
}

// Generates ping message
function generatePing() {
	return `Понг! \`${Math.round(bot.ping)}мс\` <:OSsloth:338961408320339968>`;
}

// Returns help message
function getHelp(color = 0) {
	return {
		'embed': {
			'color': color,
			'title': 'Помощь',
			'fields': [
				{
					'name': `${prefix}help | ${prefix}h`,
					'value': 'Показать это сообщение.',
					'inline': true
				},
				{
					'name': `${prefix}ping`,
					'value': 'Узнать задержку Discord API.',
					'inline': true
				},
				{
					'name': `${prefix}online | ${prefix}o`,
					'value': 'Вывести список онлайна на сервере.',
					'inline': true
				}
			]
		}
	};
}

// Sends online list of the Honeymoon server
function sendOnlineList(message, color = 7265400) {
	var errorMessage = 'Не могу получить доступ к динамической карте. <:OSsloth:338961408320339968>';
	dynmap
		.evaluate(() => document.querySelector('div.panel').innerHTML)
		.then(response => {
			try {
				var players       = response.match(/<legend[^]*?>[^]*?\[([^]*?)\][^]*?<\/legend>/)[1];
				var onlineList    = response.match(/<a href[^]*?>[^]*?<\/a>/g);
				var onlineListStr = !onlineList || !onlineList.length ? '-'
					: onlineList
						.map(str => str
							.replace(/<a href[^]*?>([^]*?)<\/a>/, '$1')
							.replace(/([\*\|_~`])/g, '\\$1'))
						.join('\n').trim().substring(0, 2000);
				message.channel.send({
					'embed': {
						'color': color,
						'author': {
							'name': 'Honeymoon',
							'url': 'https://honeymoon.rip',
							'icon_url': 'https://cdn.discordapp.com/icons/375333729897414656/a024824d98cbeaff25b66eba15b7b6ad.png'
						},
						'title': `Онлайн [${players}]`,
						'description': onlineListStr
					}
				});
			} catch (e) {
				logger.info(`Can't work with ${urlMap} due to this error:`);
				logger.info(`    ${e}`);
				message.channel.send(errorMessage);
			}
		}).catch(err => {
			logger.info(`Can't reach ${urlMap} due to this error:`);
			logger.info(`    ${err}`);
			message.channel.send(errorMessage);
		});
}

bot.on('message', (message) => {
	// Ignore bots and listen for messages that will start with prefix only
	if (message.author.bot
	|| message.content.substring(0, prefix.length) !== prefix || message.content.length <= prefix.length)
		return;
	
	// Get shielded content
	var content = message.content.substr(prefix.length)
		.replace(/\r\n|\s/g, ' ')
		.replace(/([\*\|_~`])/g, '\\$1');
	// Get arguments
	var args = content.trim() == '' ? ['']
		: content.match(/"[^"]*"|[^ "]+/g)
		.filter(arg => arg.search(/" *"/) == -1)
		.map(arg => arg.replace(/"(.*)"/, '$1'));
	args.shift();
	for (var i = 0; i < args.length; i++)
		args[i] = args[i].substring(0, 100);
	// Get command
	var cmdM = content.match(/^([^ ]+)/);
	var cmd = !cmdM || !cmdM.length ? '' : cmdM[1];
	// Delete command from content
	content = content.replace(/^[^ ]+/, '').trim();
	
	switch (cmd) {
		case 'h': cmd = 'help'; break;
		case 'o': cmd = 'online'; break;
	}
	switch (cmd) {
		// ?ping
		case 'ping':
			message.channel.send(generatePing());
		break;
		// ?help
		case 'help':
			let color = randomInt(0, 16777216);
			message.author.send(getHelp(color)).catch((e) => {
				if (e !== undefined) {
					message.channel.send(
`Сорре, не хватает прав, чтобы отправить сообщение тебе в ЛС. <:OSsloth:338961408320339968>
Выкладываю текст справки в данный канал:`);
					message.channel.send(getHelp(color));
				}
			});
		break;
		// ?online
		case 'online':
			sendOnlineList(message);
		break;
	}
});

// Initialization block
bot.login(auth.token);