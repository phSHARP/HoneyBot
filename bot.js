const Discord = require('discord.js');
const logger = require('winston');
const request = require('request');

const auth = require('./auth.json');
const cfg = require('./config.json');

const creatorID = cfg.creatorID;
const prefix = cfg.prefix;
const userReactionsFullName = cfg.userReactionsPath + cfg.userReactionsFName;
const urlSite = cfg.urlSite;
const urlDynMapRequest = cfg.urlDynMapRequest;
const useTimestamp = cfg.useTimestamp;
const maxOnline = cfg.maxOnline;

var userReactions = {};

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

bot.on('ready', (event) => {
	logger.info(`Connected at ${dateNow()}`);
	logger.info(`    Logged in as: ${bot.user.username} (id: ${bot.user.id})`);
	bot.user.setActivity('загрузку...');
});

// Listen for Bot's errors
bot.on('error', (e) => {
	console.log(`Oops, HoneyBot's error!\n    ${e}`);
});

// Triggers when the Bot joins a guild
bot.on('guildCreate', (guild) => {
	logger.info(`New guild joined: ${guild.name} (id: ${guild.id}) at ${dateNow()}`);
	logger.info(`    This guild has ${guild.memberCount} members!`);
});

// Triggers when the bot is removed from a guild
bot.on('guildDelete', (guild) => {
	logger.info(`I've been removed from: ${guild.name} (id: ${guild.id}) at ${dateNow()}`);
});

setInterval(() => {
	if (!bot.user)
		return;
	var errorMessage = 'онлайн [0/0]';
	var url = getDynMapURL();
	request(url, (error, response, body) => {
		if (error)
			bot.user.setActivity(errorMessage, { type: 'WATCHING' }).catch((e) => {});
		try {
			var content     = JSON.parse(body);
			var onlineCount = content.currentcount;
			bot.user.setActivity(`онлайн [${onlineCount}/${maxOnline}]`, { type: 'WATCHING' }).catch((e) => {});
		} catch (e) {
			bot.user.setActivity(errorMessage, { type: 'WATCHING' }).catch((e) => {});
		}
	});
}, 1000).unref();

// Generates random int from min (included) to max (not included)
function randomInt(min, max) {
	return Math.floor(Math.random() * (max - min)) + min;
}

// Returns request url to DynMap
function getDynMapURL() {
	return useTimestamp ? urlDynMapRequest + randomInt(0, Number.MAX_SAFE_INTEGER) : urlDynMapRequest;
}

// Returns Date.now() in string format
function dateNow() {
	var now = new Date(Date.now());
	return now.toString();
}

// Loads userReactions from the file
function loadUserReactions() {
	userReactions = JSON.parse(fs.readFileSync(userReactionsFullName, 'utf8'));
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
	var url = getDynMapURL();
	request(url, (error, response, body) => {
		if (error) {
			logger.info(`Can't reach ${url} due to this error:`);
			logger.info(`    ${error}`);
			message.channel.send(errorMessage);
			return;
		}
		try {
			var content       = JSON.parse(body);
			var onlineCount   = content.currentcount;
			var onlineListStr = content.players.map(player => player.name.replace(/([\*\|_~`])/g, '\\$1'))
				.join('\n').trim().substring(0, 2000);
			message.channel.send({
				'embed': {
					'color': color,
					'author': {
						'name': 'Honeymoon',
						'url': urlSite,
						'icon_url': 'https://cdn.discordapp.com/icons/375333729897414656/a024824d98cbeaff25b66eba15b7b6ad.png'
					},
					'title': `Онлайн [${onlineCount}/${maxOnline}]`,
					'description': onlineListStr
				}
			});
		} catch (e) {
			logger.info(`Can't work with ${url} due to this error:`);
			logger.info(`    ${e}`);
			message.channel.send(errorMessage);
		}
	});
}

bot.on('message', (message) => {
	// React to user's message
	if (userReactions[message.author.id] !== undefined)
		for (var i = 0; i < userReactions[message.author.id].length; i++)
			message.react(userReactions[message.author.id][i]).catch((e) => {});
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
	var cmd = !cmdM || !cmdM.length ? '' : cmdM[1].toLowerCase();
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
		// ?oof
		case 'oof':
			// Make the bot react to every message of this user ID with this emoji
			if (message.author.id == creatorID) {
				if (args.length === 0)  // Clear all the user reactions
					userReactions = {};
				else if (args.length === 1)  // Clear all the reactions of the user
					delete userReactions[args[0]];
				else if (userReactions[args[0]] === undefined)
					userReactions[args[0]] = [args[1]];
				else if (!userReactions[args[0]].includes(args[1]))
					userReactions[args[0]].push(args[1]);
				fs.writeFileSync(userReactionsFullName, JSON.stringify(userReactions));
			}
		break;
	}
});

// Initialization block
loadUserReactions();
bot.login(auth.token);