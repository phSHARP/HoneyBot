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
const urlStatusOnline = cfg.urlStatusOnline;
const urlStatusAFK = cfg.urlStatusAFK;
const urlStatusOffline = cfg.urlStatusOffline;
const useTimestamp = cfg.useTimestamp;
const maxOnline = cfg.maxOnline;
const timeUntilAFK = cfg.timeUntilAFK;
const maxUsersToWait = cfg.maxUsersToWait;
const onlineRecordFullName = cfg.onlineRecordFName;
const userAvatarsFullName = cfg.userAvatarsPath + cfg.userAvatarsFName;
const userInfoFullName = cfg.userInfoPath + cfg.userInfoFName;
const willListFullName = cfg.willListPath + cfg.willListFName;
const waitListFullName = cfg.waitListPath + cfg.waitListFName;

var botLoaded = false;
var botMaintenance = false;
var onlineRecord = 0;
var onlineList = [];
var playersStatus = {};
var userAvatars = { _apply: false };
var userInfo = { _global_lock: false, _default: 'загрузка...' };
var willList = {};
var waitList = {};

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
		if (error) {
			updateOnline();
			bot.user.setActivity(errorMessage, { type: 'WATCHING' }).catch((e) => {});
			return;
		}
		try {
			var content = JSON.parse(body);
			for (var i = 0; i < content.players.length; i++)
				content.players[i].name = content.players[i].name.replace(/([\*\|_~`])/g, '\\$1');
			var newOnlineList = content.players.map(player => player.name);
			updateOnline(newOnlineList, content.players);
			bot.user.setActivity(`онлайн [${newOnlineList.length}/${maxOnline}]`, { type: 'WATCHING' }).catch((e) => {});
		} catch (e) {
			updateOnline();
			bot.user.setActivity(errorMessage, { type: 'WATCHING' }).catch((e) => {});
		}
	});
}, 2000).unref();

// Generates random int from min (included) to max (not included)
function randomInt(min, max) {
	return Math.floor(Math.random() * (max - min)) + min;
}

function russifyNumber(number, variants = ['', '', '']) {
	// If variants are:          ['дней', 'день', 'дня']
	// the result will be then:  0 дней, 1 день, 2 дня...
	return number < 10 || number > 20
				? number%10 == 1
					? variants[1]
				: number%10 > 1 && number%10 < 5
					? variants[2]
				: variants[0]
			: variants[0]
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
	//willList = fs.readFileSync(willListFullName, 'utf8').split(/\r\n|\r|\n/).map(str => str.trim()).filter(str => str != '');
	willList = JSON.parse(fs.readFileSync(willListFullName, 'utf8'));
}

// Saves willList to the file
function saveWillList() {
	/*var willListStr = '';
	for (var i = 0; i < willList.length; i++)
		willListStr += willList[i] + '\n';
	fs.writeFileSync(willListFullName, willListStr.trim());*/
	fs.writeFileSync(willListFullName, JSON.stringify(willList));
}

// Loads waitList from the file
function loadWaitList() {
	waitList = JSON.parse(fs.readFileSync(waitListFullName, 'utf8'));
}

// Saves waitList to the file
function saveWaitList() {
	fs.writeFileSync(waitListFullName, JSON.stringify(waitList));
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

// Gets localized user offline time or empty string if it doesn't exist
function getUserOfflineTime(username = '') {
	if (userInfo[username] === undefined || userInfo[username].lastSeenAt === undefined)
		return 'не в сети';
	var difference = new Date(Date.now() - userInfo[username].lastSeenAt);
	var days = Math.floor(difference.getTime()/(1000*60*60*24));
	if (days > 0)
		return `заходил(а) ${days} ${russifyNumber(days, ['дней', 'день', 'дня'])} назад`;
	var hours = difference.getUTCHours();
	if (hours > 0)
		return `заходил(а) ${hours} ${russifyNumber(hours, ['часов', 'час', 'часа'])} назад`;
	var minutes = difference.getUTCMinutes();
	if (minutes > 0)
		return `заходил(а) ${minutes} ${russifyNumber(minutes, ['минут', 'минуту', 'минуты'])} назад`;
	var seconds = difference.getUTCSeconds();
	if (seconds > 0)
		return `заходил(а) ${seconds} ${russifyNumber(seconds, ['секунд', 'секунду', 'секунды'])} назад`;
	return 'заходил(а) только что';
}

// Returns Discord emoji (text version of it) according to user online status
function getUserOnlineEmoji(username = '') {
	return playersStatus[username] !== undefined
				? playersStatus[username].afk
					? '<:afk:655050452391559170>'
					: '<:online:653584836237328384>'
				: '<:offline:653584850783305739>'
}

// Updates onlineList, onlineRecord, playersStatus, lastSeenAt parameter of every user from userInfo and waitList
function updateOnline(newOnlineList = [], players = []) {
	var whoHasGone = onlineList.filter(name => !newOnlineList.includes(name));
	var whoHasCome = newOnlineList.filter(name => playersStatus[name] === undefined);
	// onlineList update
	onlineList = newOnlineList.slice();
	// onlineRecord update
	var onlineCount = onlineList.length;
	if (onlineCount > onlineRecord) {
		onlineRecord = onlineCount;
		saveOnlineRecord();
	}
	// playersStatus update
	for (var i = 0; i < whoHasGone.length; i++)
		delete playersStatus[whoHasGone[i]];
	var eps = 0.0000000001;
	for (var i = 0; i < players.length; i++)
		if (playersStatus[players[i].name] === undefined)
			playersStatus[players[i].name] = {
				x: players[i].x,
				y: players[i].y,
				z: players[i].z,
				lastMovedAt: Date.now(),
				afk: false
			};
		else {
			if (Math.abs(playersStatus[players[i].name].x - players[i].x) > eps || Math.abs(playersStatus[players[i].name].y - players[i].y) > eps || Math.abs(playersStatus[players[i].name].z - players[i].z) > eps) {
				playersStatus[players[i].name].lastMovedAt = Date.now();
				playersStatus[players[i].name].afk = false;
			}
			else if (Date.now() - playersStatus[players[i].name].lastMovedAt > timeUntilAFK)
				playersStatus[players[i].name].afk = true;
			playersStatus[players[i].name].x = players[i].x;
			playersStatus[players[i].name].y = players[i].y;
			playersStatus[players[i].name].z = players[i].z;
		}
			
	// userInfo[name].lastSeenAt update
	var updateOnlineStatusList = [...whoHasGone, ...whoHasCome];
	for (var i = 0; i < updateOnlineStatusList.length; i++)
		if (userInfo[updateOnlineStatusList[i]] === undefined)
			userInfo[updateOnlineStatusList[i]] = {
				lastSeenAt: Date.now(),
				locked: false
			};
		else
			userInfo[updateOnlineStatusList[i]].lastSeenAt = Date.now();
	if (updateOnlineStatusList.length > 0)
		saveUserInfo();
	// waitList update
	var whoWaits = Object.keys(waitList);
	var isWaitListChanged = false;
	for (var i = 0; i < whoWaits.length; i++)
		for (var j = 0; j < whoHasCome.length; j++)
			if (waitList[whoWaits[i]] !== undefined && waitList[whoWaits[i]][whoHasCome[j]] !== undefined) {
				var waited = whoHasCome[j];
				delete waitList[whoWaits[i]][waited];
				if (Object.keys(waitList[whoWaits[i]]).length === 0)
					delete waitList[whoWaits[i]];
				waited = waited != '_apply' && userAvatars[waited] !== undefined ? `${userAvatars[waited]} ${waited}` : `<:unknown:650033177460604938> ${waited}`;
				bot.fetchUser(whoWaits[i])
					.then((user) => user.send(`Персонаж **${waited}** только что зашел на сервер. <:OSsloth:338961408320339968>`).catch(() => {})).catch(() => {});
				isWaitListChanged = true;
			}
	if (isWaitListChanged)
		saveWaitList();
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
				},
				{
					'name': `${prefix}will [...] | ${prefix}w [...]`,
					'value':
`${prefix}will \`->\` вывести список персонажей, собирающихся зайти на сервер сегодня;
${prefix}will <name> [<comment...>] \`->\` добавить в список персонажа с соответствующим комментарием (не обязательно);
${prefix}will <name> _remove_ \`->\` удалить персонажа из списка.`,
					'inline': false
				},
				{
					'name': `${prefix}wait [...] | ${prefix}wa [...]`,
					'value':
`Позволяет управлять вашим списком ожидания заданных персонажей. Бот отправит личное сообщение, как только персонаж из этого списка появится в сети (требуется включенное разрешение на прием сообщений от пользователей на одном сервере с вами);
${prefix}wait \`->\` вывести список персонажей, которых вы ждете;
${prefix}wait <name> \`->\` добавить персонажа в список ожидания;
${prefix}wait <name> _remove_ \`->\` удалить персонажа из списка.`,
					'inline': false
				},
				{
					'name': `${prefix}ping`,
					'value': 'Узнать задержку Discord API.',
					'inline': true
				}
			]
		}
	};
}

// Returns info about user
function getUserInfo(username, color = 7265400) {
	var userOnlineIcon = ''; var userOnlineStatus = '';
	if (playersStatus[username] !== undefined) {
		if (playersStatus[username].afk) {
			userOnlineIcon = urlStatusAFK;
			userOnlineStatus = 'отошел';
		}
		else {
			userOnlineIcon = urlStatusOnline;
			userOnlineStatus = 'в сети';
		}
	}
	else {
		userOnlineIcon = urlStatusOffline;
		userOnlineStatus = getUserOfflineTime(username);
	}
	return {
		'embed': {
			'color': color,
			'author': {
				'name': 'Honeymoon',
				'url': urlSite,
				'icon_url': 'https://cdn.discordapp.com/icons/375333729897414656/a024824d98cbeaff25b66eba15b7b6ad.png'
			},
			'title': `📝 Информация: ${username}`,
			'url': `https://my.honeymoon.rip/skins/${username}.png`,
			'thumbnail': {
				'url': userAvatars[username] !== undefined
					? `https://cdn.discordapp.com/emojis/${userAvatars[username].match(/<a?:[^ ]*:(\d*)>/)[1]}.${userAvatars[username].startsWith('<a') ? 'gif' : 'png'}`
					: `https://i.imgur.com/YEB3QPU.png` //`https://cdn.discordapp.com/embed/avatars/${randomInt(0, 5)}.png`
			},
			'description': `${userInfo[username] !== undefined && userInfo[username].description !== undefined ? userInfo[username].description : userInfo._default}`,
			'image': {
				'url': `${userInfo[username] !== undefined && userInfo[username].art !== undefined ? userInfo[username].art : ''}`
			},
			'footer': {
				'icon_url': userOnlineIcon,
				'text': userOnlineStatus
			}
		}
	};
}

// Sends user list of the Honeymoon server
function sendUserList(channel, userList = [], title = '', additionalDescription = '', preUserDescriptionList = [], postUserDescriptionList = [], usersPerPage = 15, color = 7265400) {
	for (var i = 0; i < userList.length; i++)
		userList[i] = userList[i].substring(0, 30);
	var userAndDescriptionList = userList.slice();
	for (var i = 0; i < userAndDescriptionList.length; i++) {
		if (userAndDescriptionList.length == postUserDescriptionList.length)
			userAndDescriptionList[i] = `${userAndDescriptionList[i]}${postUserDescriptionList[i].substring(0, 80)}`;
		if (userAvatars._apply)
			userAndDescriptionList[i] = userList[i] != '_apply' && userAvatars[userList[i]] !== undefined ? `${userAvatars[userList[i]]} ${userAndDescriptionList[i]}` : `<:unknown:650033177460604938> ${userAndDescriptionList[i]}`;
		if (userAndDescriptionList.length == preUserDescriptionList.length)
			userAndDescriptionList[i] = `${preUserDescriptionList[i].substring(0, 80)}${userAndDescriptionList[i]}`;
	}
	var userListPages = [];
	for (var i = 0; i < userAndDescriptionList.length / usersPerPage; i++)
		userListPages.push(userAndDescriptionList.slice(i * usersPerPage, Math.min((i + 1) * usersPerPage, userAndDescriptionList.length)).join('\n').trim().substring(0, 1900));
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
function sendUserListByType(channel, messageType = 'online', userList = [], meta = '', usersPerPage = 15, color = 7265400) {
	userList = userList.sort();
	var title = ''; var additionalDescription = ''; var preUserDescriptionList = []; var postUserDescriptionList = [];
	var userCount = userList.length;
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
					userList = content.players.map(player => player.name.replace(/([\*\|_~`])/g, '\\$1')).sort();
					userCount = userList.length;
					if (userCount > onlineRecord) {
						onlineRecord = userCount;
						saveOnlineRecord();
					}
					var userCountMax = Math.max(userCount, maxOnline);
					title = `Онлайн [${userCount}/${userCountMax}]`;
					additionalDescription = `🏆 \`Рекорд:\` ${onlineRecord}`;
					additionalDescription += `\n🌍 \`Погода:\` ${content.hasStorm ? 'Осадки' : 'Ясно ☀'}`;
					additionalDescription += content.isThundering ? ' с грозой ⛈' : ' 🌧';
					if (userCount === 0)
						additionalDescription += '\n\n_\\*звук сверчков\\*_';
					preUserDescriptionList = new Array(userCount);
					for (var i = 0; i < userList.length; i++)
						preUserDescriptionList[i] = getUserOnlineEmoji(userList[i]) + ' ';
					sendUserList(channel, userList, title, additionalDescription, preUserDescriptionList, postUserDescriptionList, usersPerPage, color);
				} catch (e) {
					logger.info(`Can't work with ${options.url} due to this error:`);
					logger.info(`    ${e}`);
					channel.send(errorMessage);
				}
			});
		break;
		case 'list':
			title = `Зарегистрировано: ${userCount}`;
			sendUserList(channel, userList, title, additionalDescription, preUserDescriptionList, postUserDescriptionList, usersPerPage, color);
		break;
		case 'will':
			title = 'Сегодня будут:';
			if (userList.length === 0)
				additionalDescription = '_\\*звук сверчков\\*_';
			for (var i = 0; i < userList.length; i++) {
				preUserDescriptionList.push(getUserOnlineEmoji(userList[i]) + ' ');
				let postStr = '';
				if (playersStatus[userList[i]] === undefined && userInfo[userList[i]] !== undefined && userInfo[userList[i]].lastSeenAt !== undefined) {
					let onlineDiffHours = Math.floor((userInfo[userList[i]].lastSeenAt - Math.floor(Date.now()/(1000*60*60*24)) * (1000*60*60*24)) / (1000*60*60));
					if (0 <= onlineDiffHours && onlineDiffHours < 24)
						postStr = ` ▪ \`${getUserOfflineTime(userList[i])}\``;
				}
				if (willList[userList[i]] !== undefined && willList[userList[i]] != '')
					postStr += `\n<:space:655013932754403329> 📎 _${willList[userList[i]]}_`;
				postUserDescriptionList.push(postStr);
			}
			sendUserList(channel, userList, title, additionalDescription, preUserDescriptionList, postUserDescriptionList, usersPerPage, color);
		break;
		case 'wait':
			let authorUsername = meta;
			title = `Список ожидания ${authorUsername}:`;
			if (userList.length === 0)
				additionalDescription = '_\\*звук сверчков\\*_';
			sendUserList(channel, userList, title, additionalDescription, preUserDescriptionList, postUserDescriptionList, usersPerPage, color);
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
		case 'wa':  cmd = 'wait';           break;
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
					userAvatars[args[0]] = args[0] != '_apply' ? args[1] : userAvatars[args[0]];
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
			sendUserListByType(message.channel, 'list', Object.keys(userAvatars).filter(name => name != '_apply'));
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
				let contentInfo = content.replace(/^"[^"]*"|^[^ "]+/, '').trim().substring(0, 1500);
				if (userInfo[args[0]] === undefined)
					userInfo[args[0]] = {
						description: contentInfo,
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
						willList = {};
						saveWillList();
					}
					sendUserListByType(message.channel, 'will', Object.keys(willList));
				});
			}
			else {
				let willNotification = '';
				if (args.length > 1 && args[1] == 'remove') {
					delete willList[args[0]];
					saveWillList();
					willNotification = 'Персонаж успешно удален из списка \"**Сегодня будут**\".';
				}
				else {
					let willCommentary = content.replace(/^"[^"]*"|^[^ "]+/, '').trim().substring(0, 70);
					willList[args[0].substring(0, 30)] = willCommentary;
					saveWillList();
					willNotification = 'Персонаж успешно добавлен в список \"**Сегодня будут**\".';
				}
				sendNotification(message.channel, `${willNotification} <:OSsloth:338961408320339968>`);
			}
		break;
		// ?wait
		case 'wait':
			/*let expirationTime = -1;  // Never*/
			if (args.length === 0) {
				let authorWaitList = waitList[message.author.id] !== undefined ? Object.keys(waitList[message.author.id]) : [];
				let authorName = message.channel.type == 'text' && message.member.nickname ? message.member.nickname : message.author.username;
				sendUserListByType(message.channel, 'wait', authorWaitList, authorName);
			}
			else {
				let waitNotification = '';
				if (args.length > 1 && args[1] == 'remove') {
					if (waitList[message.author.id] !== undefined)
						delete waitList[message.author.id][args[0]];
					if (Object.keys(waitList[message.author.id]).length === 0)
						delete waitList[message.author.id];
					saveWaitList();
					waitNotification = 'Персонаж успешно удален из вашего списка ожидания.';
				}
				else {
					if (waitList[message.author.id] === undefined)
						waitList[message.author.id] = {};
					if (Object.keys(waitList[message.author.id]).length < maxUsersToWait) {
						waitList[message.author.id][args[0].substring(0, 30)] = {};
						saveWaitList();
						waitNotification = 'Персонаж успешно добавлен в ваш список ожидания.';
					}
					else
						waitNotification = 'Превышен лимит количества персонажей для ожидания.';
				}
				sendNotification(message.channel, `${waitNotification} <:OSsloth:338961408320339968>`);
			}
		break;
	}
});

// Initialization block
loadOnlineRecord();
loadUserAvatars();
loadUserInfo();
loadWillList();
loadWaitList();
bot.login(auth.token);
