const Discord = require('discord.js');
const logger = require('winston');
const fs = require('fs');
const request = require('request');

const auth = require('./auth.json');
const cfg = require('./config.json');

const creatorID = cfg.creatorID;
const prefix = cfg.prefix;
const notificationMessageLifetime = cfg.notificationMessageLifetime;
const urlSite = cfg.urlSite;
const urlDynMapRequest = cfg.urlDynMapRequest;
const useTimestamp = cfg.useTimestamp;
const maxOnline = cfg.maxOnline;
const maxUsersToWait = cfg.maxUsersToWait;
const onlineRecordFullName = cfg.onlineRecordFName;
const userAvatarsFullName = cfg.userAvatarsPath + cfg.userAvatarsFName;
const userInfoFullName = cfg.userInfoPath + cfg.userInfoFName;
const willListFullName = cfg.willListPath + cfg.willListFName;

var botLoaded = false;
var botMaintenance = false;
var onlineRecord = 0;
var userAvatars = { _apply: false };
var userInfo = { _global_lock: false, _default: 'загрузка...' };
var willList = [];

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

// Loads willList from the file
function loadWillList() {
	willList = fs.readFileSync(willListFullName, 'utf8').split(/\r\n|\r|\n/).map(str => str.trim()).filter(str => str != '');
}

// Saves willList to the file
function saveWillList() {
	var willListStr = '';
	for (var i = 0; i < willList.length; i++)
		willListStr += willList[i] + '\n';
	fs.writeFileSync(userInfoFullName, willListStr.trim());
}

// Loads info about onlineRecord from the file
function loadOnlineRecord() {
	onlineRecord = parseInt(fs.readFileSync(onlineRecordFullName, 'utf8'));
}

// Saves info about onlineRecord to the file
function saveOnlineRecord() {
	fs.writeFileSync(onlineRecordFullName, onlineRecord);
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
					'value': `Добавить/изменить описание персонажа (выводимое по команде ${prefix}info).`,
					'inline': true
				},
				{
					'name': `${prefix}setart <name> <link>`,
					'value': `Добавить/изменить ссылку на арт персонажа (выводимое по команде ${prefix}info).`,
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
			'title': `📝 Информация: ${username}`,
			'thumbnail': {
				'url': userAvatars[username] !== undefined
					? `https://cdn.discordapp.com/emojis/${userAvatars[username].match(/<a?:[^ ]*:(\d*)>/)[1]}.${userAvatars[username].startsWith('<a') ? 'gif' : 'png'}`
					: `https://i.imgur.com/YEB3QPU.png` //`https://cdn.discordapp.com/embed/avatars/${randomInt(0, 5)}.png`
			},
			'description': `${userInfo[username] !== undefined ? userInfo[username].description : userInfo._default}`,
			'image': {
				'url': `${userInfo[username] !== undefined ? userInfo[username].art : ''}`
			}
		}
	};
}

// Sends user list of the Honeymoon server
function sendUserList(channel, title = '', additionalDescription = '', userList = [], usersPerPage = 15, color = 7265400) {
	userList = userList.filter(name => name !== '_apply').sort();
	if (userAvatars._apply)
		userList = userList.map(name => userAvatars[name] !== undefined ? `${userAvatars[name]} ${name}` : `<:unknown:650033177460604938> ${name}`);
	var userListPages = [];
	for (var i = 0; i < userList.length / usersPerPage; i++)
		userListPages.push(userList.slice(i * usersPerPage, Math.min((i + 1) * usersPerPage, userList.length)).join('\n').trim().substring(0, 1900));
	if (userListPages.length === 0) userListPages = [''];
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
				'description': (`${additionalDescription}\n\n${userListPages[i]}`).trim().substring(0, 1900),
				'footer': {
					'text': userListPages.length > 1 ? `Страница [${i + 1}/${userListPages.length}]` : ''
				}
			}
		});
	sendMessageList(channel, contentList);
}

// Sends user list of the Honeymoon server according to message (list) type
// messageType in ['online', 'list']
function sendUserListByType(channel, messageType = 'online', userList = [], usersPerPage = 15, color = 7265400) {
	var title = ''; var additionalDescription = '';
	var userCount = userList.filter(name => name !== '_apply').length;
	switch (messageType) {
		case 'online':
			var errorMessage = 'Не могу получить доступ к динамической карте. <:OSsloth:338961408320339968>';
			var options = {
				url: getDynMapURL(),
				timeout: 3000
			}
			request(options, (error, response, body) => {
				if (error) {
					logger.info(`Can't reach ${options.url} due to this error:`);
					logger.info(`    ${error}`);
					channel.send(errorMessage);
					return;
				}
				try {
					var content = JSON.parse(body);
					userList = content.players.map(player => player.name.replace(/([\*\|_~`])/g, '\\$1'));
					userCount = userList.length;
					if (userCount > onlineRecord) {
						onlineRecord = userCount;
						saveOnlineRecord();
					}
					var userCountMax = Math.max(userCount, maxOnline);
					title = `Онлайн [${userCount}/${userCountMax}]`;
					additionalDescription = `\`Рекорд: ${onlineRecord}\``;
					additionalDescription += `\n\`Погода: ${content.hasStorm ? 'Дождь' : 'Ясно'}${content.isThundering ? ' с грозой' : ''}\``;
					sendUserList(channel, title, additionalDescription, userList, usersPerPage, color);
				} catch (e) {
					logger.info(`Can't work with ${options.url} due to this error:`);
					logger.info(`    ${e}`);
					channel.send(errorMessage);
				}
			});
		break;
		case 'list':
			title = `Зарегистрировано: ${userCount}`;
			sendUserList(channel, title, additionalDescription, userList, usersPerPage, color);
		break;
		case 'will':
			title = 'Сегодня будут:';
			sendUserList(channel, title, additionalDescription, userList, usersPerPage, color);
		break;
	}
}

// Send the message list to the channel with < ⏹ > reactions (⏹ is optional)
function sendMessageList(channel, contentList = [], page = 0, hasStop = false) {
	if (contentList.length > 0)
		channel.send(contentList[page])
			.then((msg) => {
				if (contentList.length > 1)
					operateWithMessageList(msg, contentList, page, hasStop);
			});
}

// Sends message that will be deleted in "notificationMessageLifetime" milliseconds
function sendNotification(channel, content = '') {
	if (!content || content.trim() == '')
		return;
	channel.send(content)
		.then((msg) => msg.delete(notificationMessageLifetime));
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
		case 'w':   cmd = 'will';           break;
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
				sendNotification(message.channel, 'Файлы аватаров и информации о персонажах успешно перезагружены. <:OSsloth:338961408320339968>');
			}
		break;
		// ?avatarswitch
		case 'avatarswitch':
			if (message.author.id == creatorID) {
				userAvatars._apply = !userAvatars._apply;
				saveUserAvatars();
				sendNotification(message.channel, 'Флаг отображения аватаров персонажей успешно переключен. <:OSsloth:338961408320339968>');
			}
		break;
		// ?avatar
		case 'avatar':
			// Setup emoji-avatar for the user
			if (message.author.id == creatorID) {
				let avatarNotification = '';
				if (args.length === 0) {       // Clear all the user avatars
					userAvatars = { _apply: userAvatars._apply };
					avatarNotification = 'Все аватары персонажей успешно удалены.';
				}
				else if (args.length === 1) {  // Clear the user's avatar
					delete userAvatars[args[0]];
					avatarNotification = 'Аватар данного персонажа успешно удален.';
				}
				else {                         // Otherwise setup it
					userAvatars[args[0]] = args[1];
					avatarNotification = 'Аватар данного персонажа успешно изменен.';
				}
				saveUserAvatars();
				sendNotification(message.channel, `${avatarNotification} <:OSsloth:338961408320339968>`);
			}
		break;
		// ?ping
		case 'ping':
			message.channel.send(generatePing());
		break;
		// ?help
		case 'help':
			let color = randomInt(0, 16777216);
			message.author.send(getHelp(color))
				.catch((e) => {
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
			sendUserListByType(message.channel, 'online');
		break;
		// ?list
		case 'list':
			sendUserListByType(message.channel, 'list', Object.keys(userAvatars));
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
				sendNotification(message.channel, 'Информация о персонаже успешно изменена. <:OSsloth:338961408320339968>');
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
				sendNotification(message.channel, 'Изображение/арт персонажа успешно изменены. <:OSsloth:338961408320339968>');
			}
		break;
		// ?infolockswitch
		case 'infolockswitch':
			if (message.author.id == creatorID) {
				let infolockNotification = '';
				if (args.length === 0) {
					userInfo._global_lock = !userInfo._global_lock;
					infolockNotification = 'Флаг глобальной блокировки изменения информации о персонажах успешно переключен.';
				}
				else if (userInfo[args[0]] !== undefined) {
					userInfo[args[0]].locked = !userInfo[args[0]].locked;
					infolockNotification = 'Флаг блокировки изменения информации о данном персонаже успешно переключен.';
				}
				else
					infolockNotification = 'Не найдено информации о данном персонаже.';
				saveUserInfo();
				sendNotification(message.channel, `${infolockNotification} <:OSsloth:338961408320339968>`);
			}
		break;
		// ?deleteinfo
		case 'deleteinfo':
			if (message.author.id == creatorID) {
				let deleteinfoNotification = '';
				if (args.length === 0) {
					userInfo = { _global_lock: false, _default: userInfo._default }
					deleteinfoNotification = 'Информация обо всех персонажах успешно удалена.';
				}
				else {
					delete userInfo[args[0]];
					deleteinfoNotification = 'Информация о данном персонаже успешно удалена.';
				}
				saveUserInfo();
				sendNotification(message.channel, `${deleteinfoNotification} <:OSsloth:338961408320339968>`);
			}
		break;
		// ?will
		case 'will':
			if (args.length === 0) {
				fs.stat(willListFullName, (err, stats) => {
					let lastWillListModifyDay = Math.floor(stats.mtimeMs/(1000*60*60*24));
					let currentDay = Math.floor(Date.now()/(1000*60*60*24));
					if (!err && lastWillListModifyDay != currentDay) {
						willList = [];
						saveWillList();
					}
					sendUserListByType(message.channel, 'will', willList);
				});
			}
			else {
				let willNotification = '';
				if (args.length > 1 && args[args.length - 1] == 'remove') {
					let namesToDelete = args.slice(0, args.length - 1);
					willList = willList.filter(name => !namesToDelete.includes(name));
					saveWillList();
					willNotification = `Персонаж${namesToDelete.length === 1 ? '' : 'и'} успешно удален${namesToDelete.length === 1 ? '' : 'ы'} из списка \"**Сегодня будут**\".`;
				}
				else {
					let namesToAdd = args.slice();
					namesToAdd = namesToAdd.filter(name => !willList.includes(name));
					for (var i = 0; i < namesToAdd.length; i++)
						willList.push(namesToAdd[i]);
					saveWillList();
					willNotification = `Персонаж${args.length === 1 ? '' : 'и'} успешно добавлен${args.length === 1 ? '' : 'ы'} в список \"**Сегодня будут**\".`;
				}
				sendNotification(message.channel, `${willNotification} <:OSsloth:338961408320339968>`);
			}
		break;
		// ?wait
		case 'wait':
			let waitNames = [''];
			let expirationTime = 0;  // Never
			if (args.length > 0) {
				
			}
			//sendNotification(message.channel, `${deleteinfoNotification} <:OSsloth:338961408320339968>`);
		break;
	}
});

// Initialization block
loadOnlineRecord()
loadUserAvatars();
loadUserInfo();
loadWillList();
bot.login(auth.token);
