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
				},
				{
					'name': `${prefix}list | ${prefix}l`,
					'value': 'Вывести список пользователей с персональным аватаром.',
					'inline': true
				}
			]
		}
	};
}

// Sends online list of the Honeymoon server
function sendOnlineList(channel, onlineList = [], color = 7265400) {
	var errorMessage = 'Не могу получить доступ к динамической карте. <:OSsloth:338961408320339968>';
	var url = getDynMapURL();
	request(url, (error, response, body) => {
		if (error) {
			logger.info(`Can't reach ${url} due to this error:`);
			logger.info(`    ${error}`);
			channel.send(errorMessage);
			return;
		}
		try {
			var content = JSON.parse(body);
			if (onlineList.length === 0)
				onlineList = content.players.map(player => player.name.replace(/([\*\|_~`])/g, '\\$1'));
			onlineList = onlineList.filter(name => name !== '_apply').sort();
			var onlineCount = onlineList.length;
			var onlineCountMax = Math.max(onlineCount, maxOnline);
			if (userAvatars._apply)
				onlineList = onlineList.map(name => userAvatars[name] !== undefined ? `${userAvatars[name]} ${name}` : name);
			var onlineListPages = [];
			for (var i = 0; i < onlineList.length / 10; i++)
				onlineListPages.push(onlineList.slice(i * 10, Math.min((i + 1) * 10, onlineList.length)).join('\n').trim().substring(0, 2000));
			if (onlineListPages.length === 0) onlineListPages = [''];
			var contentList = [];
			for (var i = 0; i < onlineListPages.length; i++)
				contentList.push({
					'embed': {
						'color': color,
						'author': {
							'name': 'Honeymoon',
							'url': urlSite,
							'icon_url': 'https://cdn.discordapp.com/icons/375333729897414656/a024824d98cbeaff25b66eba15b7b6ad.png'
						},
						'title': `Онлайн [${onlineCount}/${onlineCountMax}]`,
						'description': onlineListPages[i],
						'footer': {
							'text': onlineListPages.length > 1 ? `Страница [${i + 1}/${onlineListPages.length}]` : ''
						}
					}
				});
			sendMessageList(channel, contentList);
		} catch (e) {
			logger.info(`Can't work with ${url} due to this error:`);
			logger.info(`    ${e}`);
			channel.send(errorMessage);
		}
	});
}

// Send the message list to the channel with < ⏹ > reactions (⏹ is optional)
function sendMessageList(channel, contentList = [], page = 0, hasStop = false) {
	if (contentList.length > 0)
		channel.send(contentList[page])
			.then(msg => {
				if (contentList.length > 1)
					operateWithMessageList(msg, contentList, page, hasStop);
			});
}

// Operate with message list reactions
async function operateWithMessageList(message, contentList = [], page = 0, hasStop = false) {
	await message.react('◀');
	if (hasStop) await message.react('⏹');
	await message.react('▶');
	const filter = (reaction, user) => (reaction.emoji.name === '◀' || (hasStop && reaction.emoji.name === '⏹') || reaction.emoji.name === '▶') && user.id != bot.user.id;
	const collector = message.createReactionCollector(filter, { time: 60000 });
	collector.on('collect', r => {
		var isRefresh = !(r.emoji.name === '◀' && page === 0 || r.emoji.name === '▶' && page === contentList.length - 1);
		if (r.emoji.name === '◀')
			page = Math.max(0, page - 1);
		if (r.emoji.name === '▶')
			page = Math.min(page + 1, contentList.length - 1);
		if (isRefresh) {
			message.clearReactions()
				.then(() => {
					collector.stop();
					if (r.emoji.name !== '⏹') {
						message.edit(contentList[page]);
						operateWithMessageList(message, contentList, page, hasStop);
					}
				}).catch(() => {
					message.delete();
					if (r.emoji.name !== '⏹')
						sendMessageList(message.channel, contentList, page, hasStop);
				})
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
		case 'l':   cmd = 'list';         break;
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
			sendOnlineList(message.channel);
		break;
		// ?list
		case 'list':
			sendOnlineList(message.channel, Object.keys(userAvatars));
		break;
	}
});

// Initialization block
loadUserAvatars()
bot.login(auth.token);