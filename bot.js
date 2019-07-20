const Discord = require('discord.js');
const logger = require('winston');
const fs = require('fs');
const request = require('request');

const auth = require('./auth.json');
const cfg = require('./config.json');

const creatorID = cfg.creatorID;
const prefix = cfg.prefix;
const urlSite = cfg.urlSite;
const urlDynMapRequest = cfg.urlDynMapRequest;
const useTimestamp = cfg.useTimestamp;
const maxOnline = cfg.maxOnline;
const userAvatarsFullName = cfg.userAvatarsPath + cfg.userAvatarsFName;

var userAvatars = { _apply: false };

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

// Loads userAvatars from the file
function loadUserAvatars() {
	userAvatars = JSON.parse(fs.readFileSync(userAvatarsFullName, 'utf8'));
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
function sendOnlineList(message, onlineList = [], color = 7265400) {
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
			var content = JSON.parse(body);
			if (onlineList.length === 0)
				onlineList = content.players.map(player => player.name.replace(/([\*\|_~`])/g, '\\$1'));
			onlineList.filter(name => name !== '\\_apply');
			var onlineCount = onlineList.length;
			var onlineCountMax = Math.max(onlineCount, maxOnline);
			if (userAvatars._apply)
				onlineList = onlineList.map(name => userAvatars[name] !== undefined ? `${userAvatars[name]} ${name}` : name);
			var onlineListStr = onlineList.join('\n').trim().substring(0, 2000);
			message.channel.send({
				'embed': {
					'color': color,
					'author': {
						'name': 'Honeymoon',
						'url': urlSite,
						'icon_url': 'https://cdn.discordapp.com/icons/375333729897414656/a024824d98cbeaff25b66eba15b7b6ad.png'
					},
					'title': `Онлайн [${onlineCount}/${onlineCountMax}]`,
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
		case 'rea': cmd = 'reavatars';    break;
		case 'as':  cmd = 'avatarswitch'; break;
		case 'a':   cmd = 'avatar';       break;
		case 'h':   cmd = 'help';         break;
		case 'o':   cmd = 'online';       break;
		case 'ot':  cmd = 'onlinetest';   break;
	}
	switch (cmd) {
		// ?re
		case 're':
			// Shutdown bot in order to restart it via ./startup.sh script
			if (message.author.id == creatorID)
				process.kill(process.pid, 'SIGTERM');
		break;
		// ?reavatars
		case 'reavatars':
			// Reload avatars map (dictionary)
			if (message.author.id == creatorID) {
				loadUserAvatars();
				logger.info(`Reloaded avatars map at ${dateNow()}`);
			}
		break;
		// ?avatarswitch
		case 'avatarswitch':
			if (message.author.id == creatorID) {
				userAvatars._apply = !userAvatars._apply;
				fs.writeFileSync(userAvatarsFullName, JSON.stringify(userAvatars));
			}
		break;
		// ?avatar
		case 'avatar':
			// Setup emoji-avatar for the user
			if (message.author.id == creatorID) {
				if (args.length === 0)       // Clear all the user avatars
					userAvatars = { _apply: userAvatars._apply };
				else if (args.length === 1)  // Clear the user's avatar
					delete userAvatars[args[0]];
				else                         // Otherwise setup it
					userAvatars[args[0]] = args[1];
				fs.writeFileSync(userAvatarsFullName, JSON.stringify(userAvatars));
			}
		break;
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
		case 'onlinetest':
			if (message.author.id == creatorID)
				sendOnlineList(message, Object.keys(userAvatars));
		break;
	}
});

// Initialization block
loadUserAvatars()
bot.login(auth.token);