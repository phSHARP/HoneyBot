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
const onlineRecordFName = cfg.onlineRecordFName;
const userAvatarsFullName = cfg.userAvatarsPath + cfg.userAvatarsFName;
const userInfoFullName = cfg.userInfoPath + cfg.userInfoFName;

var botLoaded = false;
var botMaintenance = false;
var onlineRecord = 0;
var userAvatars = { _apply: false };
var userInfo = { _global_lock: false, _default: 'загрузка...' };

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
	messageCacheMaxSize: 100,
	messageCacheLifetime: 60 * 60 + 1,
	messageSweepInterval: 60
});

bot.on('ready', (event) => {
	logger.info(`Connected at ${dateNow()}`);
	logger.info(`    Logged in as: ${bot.user.username} (id: ${bot.user.id})`);
	bot.user.setActivity('загрузку...');
	botLoaded = true;
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

// Online check for bot status
setInterval(() => {
	if (!bot.user)
		return;
	var errorMessage = 'онлайн [0/0]';
	var options = {
		url: getDynMapURL(),
		timeout: 3000
	}
	request(options, (error, response, body) => {
		if (error)
			bot.user.setActivity(errorMessage, { type: 'WATCHING' }).catch((e) => {});
		try {
			var content     = JSON.parse(body);
			var onlineCount = content.currentcount;
			if (onlineCount > onlineRecord) {
				onlineRecord = onlineCount;
				saveOnlineRecord();
			}
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

// Saves userAvatars to the file
function saveUserAvatars() {
	fs.writeFileSync(userAvatarsFullName, JSON.stringify(userAvatars));
}

// Loads userInfo from the file
function loadUserInfo() {
	userInfo = JSON.parse(fs.readFileSync(userInfoFullName, 'utf8'));
}

// Saves userInfo to the file
function saveUserInfo() {
	fs.writeFileSync(userInfoFullName, JSON.stringify(userInfo));
}

// Loads info about onlineRecord from the file
function loadOnlineRecord() {
	onlineRecord = parseInt(fs.readFileSync(onlineRecordFName, 'utf8'));
}

// Saves info about onlineRecord to the file
function saveOnlineRecord() {
	fs.writeFileSync(onlineRecordFName, onlineRecord);
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
				},
				{
					'name': `${prefix}info <name> | ${prefix}i <name>`,
					'value': 'Отобразить информацию о персонаже с именем <name>.',
					'inline': true
				},
				{
					'name': `${prefix}setinfo <name> <description...>`,
					'value': 'Добавить/изменить описание конкретного персонажа (выводимое по команде ?info).',
					'inline': true
				},
				{
					'name': `${prefix}setart <name> <link>`,
					'value': 'Добавить/изменить ссылку на арт данного персонажа (отображаемое по команде ?info).',
					'inline': true
				}
			]
		}
	};
}

// Returns info about user
function getUserInfo(username, color = 7265400) {
	return {
		'embed': {
			'color': color,
			'author': {
				'name': 'Honeymoon',
				'url': urlSite,
				'icon_url': 'https://cdn.discordapp.com/icons/375333729897414656/a024824d98cbeaff25b66eba15b7b6ad.png'
			},
			'title': `${username}: информация`,
			'thumbnail': {
				'url': userAvatars[username] !== undefined
					? `https://cdn.discordapp.com/emojis/${userAvatars[username].match(/<a?:[^ ]*:(\d*)>/)[1]}.${userAvatars[username].startsWith('<a') ? 'gif' : 'png'}`
					: `https://cdn.discordapp.com/embed/avatars/${randomInt(0, 5)}.png`
			},
			'description': `${userInfo[username] !== undefined ? userInfo[username].description : userInfo._default}`,
			'image': {
				'url': `${userInfo[username] !== undefined ? userInfo[username].art : ''}`
			}
		}
	};
}

// Sends user list of the Honeymoon server
function sendUserList(channel, messageType = 'online', userList = [], color = 7265400) {
	var errorMessage = 'Не могу получить доступ к динамической карте. <:OSsloth:338961408320339968>';
	var options = {
		url: getDynMapURL(),
		timeout: 3000
	}
	request(options, (error, response, body) => {
		if (error) {
			logger.info(`Can't reach ${options.url} due to this error:`);
			logger.info(`    ${error}`);
			channel.send(errorMessage).then(msg => { msg.react('379642791245905921'); });
			return;
		}
		try {
			var content = JSON.parse(body);
			if (userList.length === 0)
				userList = content.players.map(player => player.name.replace(/([\*\|_~`])/g, '\\$1'));
			userList = userList.filter(name => name !== '_apply').sort();
			var userCount = userList.length;
			var userCountMax = Math.max(userCount, maxOnline);
			if (userAvatars._apply)
				userList = userList.map(name => userAvatars[name] !== undefined ? `${userAvatars[name]} ${name}` : name);
			var userListPages = [];
			var usersPerPage = 15;
			for (var i = 0; i < userList.length / usersPerPage; i++)
				userListPages.push(userList.slice(i * usersPerPage, Math.min((i + 1) * usersPerPage, userList.length)).join('\n').trim().substring(0, 2000));
			if (userListPages.length === 0) userListPages = [''];
			var title = ''; var additionalDescription = '';
			switch (messageType) {
				case 'online':
					if (userCount > onlineRecord) {
						onlineRecord = userCount;
						saveOnlineRecord();
					}
					title = `Онлайн [${userCount}/${userCountMax}]`;
					additionalDescription = `\`Рекорд [${onlineRecord}/${userCountMax}]\``;
				break;
				case 'list':
					title = `Зарегистрировано: ${userCount}`
				break;
			}
			var contentList = [];
			for (var i = 0; i < userListPages.length; i++)
				contentList.push({
					'embed': {
						'color': color,
						'author': {
							'name': 'Honeymoon',
							'url': urlSite,
							'icon_url': 'https://cdn.discordapp.com/icons/375333729897414656/a024824d98cbeaff25b66eba15b7b6ad.png'
						},
						'title': title,
						'description': `${additionalDescription}\n${userListPages[i]}`,
						'footer': {
							'text': userListPages.length > 1 ? `Страница [${i + 1}/${userListPages.length}]` : ''
						}
					}
				});
			sendMessageList(channel, contentList);
		} catch (e) {
			logger.info(`Can't work with ${options.url} due to this error:`);
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
	const collector = message.createReactionCollector(filter, { time: 60 * 60 * 1000 });
	collector.on('collect', r => {
		if (message.deleted)
			return;
		var isRefresh = !(r.emoji.name === '◀' && page === 0 || r.emoji.name === '▶' && page === contentList.length - 1);
		if (r.emoji.name === '◀')
			page = Math.max(0, page - 1);
		if (r.emoji.name === '▶')
			page = Math.min(page + 1, contentList.length - 1);
		if (isRefresh) {
			collector.stop();
			message.clearReactions()
				.then(() => {
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
	// Ignore message if bot hasn't loaded yet
	if (!botLoaded)
		return;
	// Ignore bots and listen for messages that will start with prefix only
	if (message.author.bot
	|| message.content.substring(0, prefix.length) !== prefix || message.content.length <= prefix.length)
		return;
	// Ignore everyone if the bot has started in maintenance mode
	if (botMaintenance && message.author.id != creatorID) {
		message.channel.send('Ведутся тех. работы. 🍺');
		return;
	}
	
	// Get shielded content
	var content = message.content.substr(prefix.length)
		.replace(/\r\n|\s/g, ' ')
		.replace(/([\*\|_~`])/g, '\\$1')
		.replace(/(<a?:[^ ]*)\\([^ ]*:\d*>)/g, '$1$2');
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
		case 'reu': cmd = 'reusers';        break;
		case 'as':  cmd = 'avatarswitch';   break;
		case 'ils': cmd = 'infolockswitch'; break;
		case 'di':  cmd = 'deleteinfo';     break;
		case 'a':   cmd = 'avatar';         break;
		case 'h':   cmd = 'help';           break;
		case 'o':   cmd = 'online';         break;
		case 'l':   cmd = 'list';           break;
		case 'i':   cmd = 'info';           break;
	}
	switch (cmd) {
		// ?re
		case 're':
			// Shutdown bot in order to restart it via ./startup.sh script
			if (message.author.id == creatorID)
				process.kill(process.pid, 'SIGTERM');
		break;
		// ?reusers
		case 'reusers':
			// Reload userInfo and userAvatars maps
			if (message.author.id == creatorID) {
				loadUserAvatars();
				loadUserInfo();
				logger.info(`Reloaded userInfo and userAvatars maps at ${dateNow()}`);
			}
		break;
		// ?avatarswitch
		case 'avatarswitch':
			if (message.author.id == creatorID) {
				userAvatars._apply = !userAvatars._apply;
				saveUserAvatars();
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
				saveUserAvatars();
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
			sendUserList(message.channel);
		break;
		// ?list
		case 'list':
			sendUserList(message.channel, 'list', Object.keys(userAvatars));
		break;
		// ?info
		case 'info':
			if (args.length > 0)
				message.channel.send(getUserInfo(args[0]));
		break;
		// ?setinfo
		case 'setinfo':
			if (args.length > 1) {
				if ((userInfo._global_lock || userInfo[args[0]] !== undefined && userInfo[args[0]].locked) && message.author.id != creatorID) {
					message.channel.send('Изменение информации об этом персонаже недоступно. <:SlothGun:609715424317276160>');
					return;
				}
				let contentInfo = content.replace(/"[^"]*"|[^ "]+/, '').trim();
				if (userInfo[args[0]] === undefined)
					userInfo[args[0]] = {
						description: contentInfo,
						art: '',
						locked: false
					};
				else
					userInfo[args[0]].description = contentInfo;
				saveUserInfo();
			}
		break;
		// ?setart
		case 'setart':
			if (args.length > 1) {
				if ((userInfo._global_lock || userInfo[args[0]] !== undefined && userInfo[args[0]].locked) && message.author.id != creatorID) {
					message.channel.send('Изменение информации об этом персонаже недоступно. <:SlothGun:609715424317276160>');
					return;
				}
				if (userInfo[args[0]] === undefined)
					userInfo[args[0]] = {
						description: userInfo._default,
						art: args[1],
						locked: false
					};
				else
					userInfo[args[0]].art = args[1];
				saveUserInfo();
			}
		break;
		// ?infolockswitch
		case 'infolockswitch':
			if (message.author.id == creatorID) {
				if (args.length === 0)
					userInfo._global_lock = !userInfo._global_lock;
				else if (userInfo[args[0]] !== undefined)
					userInfo[args[0]].locked = !userInfo[args[0]].locked;
				saveUserInfo();
			}
		break;
		// ?deleteinfo
		case 'deleteinfo':
			if (message.author.id == creatorID) {
				if (args.length === 0)
					userInfo = { _global_lock: false, _default: userInfo._default }
				else
					delete userInfo[args[0]];
				saveUserInfo();
			}
		break;
	}
});

// Initialization block
loadOnlineRecord()
loadUserAvatars();
loadUserInfo();
bot.login(auth.token);