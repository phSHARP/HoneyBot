'use strict';

const { Client, Options, Sweepers, Permissions } = require('discord.js');
const logger = require('winston');
const fs = require('fs');
const request = require('request');

const auth = require('./config/auth.json');
const cfg = require('./config/config');

const DEFAULT_WRAPPER = content => wrapContent(content);
const DEFAULT_EDITOR = (content, context) => context.edit(content);

const userAvatarsFullPath = `${cfg.userAvatarsPath}${cfg.userAvatarsFName}`;
const userInfoFullPath = `${cfg.userInfoPath}${cfg.userInfoFName}`;
const willListFullPath = `${cfg.willListPath}${cfg.willListFName}`;
const waitListFullPath = `${cfg.waitListPath}${cfg.waitListFName}`;

let clientLoaded = false;
let clientMaintenance = false;
let onlineRecord = 0;
let onlineList = [];
let playersStatus = {};
let userAvatars = { _apply: false };
let userInfo = { _global_lock: false, _default: 'загрузка...' };
let willList = {};
let waitList = {};

// Listen for 'SIGTERM' signal
process.on('SIGTERM', () => {
	logger.info(`Shutted down at ${dateNow()}`);
	client.destroy();
	process.exit();
});

// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(new logger.transports.Console, {
	colorize: true
});
logger.level = 'info';

// Initialize Discord client
const client = new Client({
	makeCache: Options.cacheWithLimits({
		...Options.defaultMakeCacheSettings,
		MessageManager: {
			...cfg.client.MessageManager,
			sweepFilter: Sweepers.filterByLifetime(cfg.client.MessageManager.sweepFilter)
		}
	}),
	intents: cfg.client.intents,
	partials: cfg.client.partials
});

client.on('ready', event => {
	logger.info(`Connected at ${dateNow()}`);
	logger.info(`    Logged in as: ${client.user.username} (id: ${client.user.id})`);
	client.user.setActivity('загрузку...');
	clientLoaded = true;
});

// Listen for client errors
client.on('error', err => {
	console.error(`Client has thrown an error!\n    ${err}`);
});

// Triggers when the client joins a guild
client.on('guildCreate', guild => {
	logger.info(`New guild joined: ${guild.name} (id: ${guild.id}) at ${dateNow()}`);
	logger.info(`    This guild has ${guild.memberCount} members!`);
});

// Triggers when the client is removed from a guild
client.on('guildDelete', guild => {
	logger.info(`I've been removed from: ${guild.name} (id: ${guild.id}) at ${dateNow()}`);
});

// Updates client activity status according to the server online information
setInterval(() => {
	if (!client.user) {
		return;
	}
	const emptyActivity = 'онлайн [0/0]';
	const options = {
		url: getDynMapURL(),
		timeout: 3000
	};
	
	request(options, (err, response, body) => {
		if (err) {
			updateOnline();
			client.user.setActivity(emptyActivity, { type: 'WATCHING' });
			return;
		}
		try {
			const content = JSON.parse(body);
			for (let i = 0; i < content.players.length; i++)
				content.players[i].name = shieldSpecialSymbols(content.players[i].name);
			const newOnlineList = content.players.map(player => player.name);
			updateOnline(newOnlineList, content.players);
			client.user.setActivity(`онлайн [${newOnlineList.length}/${cfg.maxOnline}]`, { type: 'WATCHING' });
		} catch (err) {
			updateOnline();
			client.user.setActivity(emptyActivity, { type: 'WATCHING' });
		}
	});
}, 2000).unref();

// Generates random int from min (included) to max (not included)
function randomInt(min, max) {
	return Math.floor(Math.random() * (max - min)) + min;
}

// Returns RGB (values in [0..255]) from HSV (values in [0..1])
function HSVtoRGB(h, s, v) {
	if (arguments.length == 1) {
		s = h.s, v = h.v, h = h.h;
	}
	const i = Math.floor((h * 6));
	const f = h * 6 - i;
	const p = v * (1 - s);
	const q = v * (1 - f * s);
	const t = v * (1 - (1 - f) * s);
	let r, g, b;
	switch (i % 6) {
		case 0: r = v, g = t, b = p; break;
		case 1: r = q, g = v, b = p; break;
		case 2: r = p, g = v, b = t; break;
		case 3: r = p, g = q, b = v; break;
		case 4: r = t, g = p, b = v; break;
		case 5: r = v, g = p, b = q; break;
	}
	return {
		r: Math.round(r * 255),
		g: Math.round(g * 255),
		b: Math.round(b * 255)
	};
}

// Generates random color as ColorResolvable
function randomColor() {
	const color = HSVtoRGB(Math.random(), 0.6, 0.95);
	return [color.r, color.g, color.b];
}

// Turns combination of space symbols into one
function shrinkSpaces(str) {
	return str?.replace(/\s+/g, ' ') ?? '';
}

// Shields special symbols in the string
function shieldSpecialSymbols(str) {
	return str?.replace(/([\*\|_~`])/g, '\\$1') ?? '';
}

// Returns array of data options
function splitContentsIntoData(content, cleanContent) {
	if (!content) {
		return [];
	}
	if (!cleanContent) {
		cleanContent = content;
	}
	const valueMaxLength = 100;
	const splitIntoArgs = str => str.match(/"[^"]*"|[^ "]+|"/g)?.filter(arg => arg.search(/" *"/) == -1) ?? [];
	const argToValue = arg => arg.replace(/"(.*)"/, '$1').substring(0, valueMaxLength).trim();
	
	const [args, cleanArgs] = [splitIntoArgs(content), splitIntoArgs(cleanContent)];
	const dataLength = Math.max(content.length, cleanContent.length);
	const data = [];
	for (let i = 0; i < dataLength; i++)
		data.push({
			'value': i < args.length ? argToValue(args[i]) : '',
			'cleanValue': i < cleanArgs.length ? argToValue(cleanArgs[i]) : ''
		});
	return data;
}

// If variants are:          ['дней', 'день', 'дня']
// the result will be then:  0 дней, 1 день, 2 дня...
function russifyNumber(number, variants = ['', '', '']) {
	return number < 10 || number > 20
			? number % 10 == 1
				? variants[1]
				: number % 10 > 1 && number % 10 < 5
					? variants[2]
					: variants[0]
			: variants[0];
}

// Returns request url to DynMap
function getDynMapURL() {
	return cfg.useTimestamp ? `${cfg.urlDynMapRequest}${Date.now()}` : cfg.urlDynMapRequest;
}

// Returns Date.now() in string format
function dateNow() {
	const now = new Date(Date.now());
	return now.toString();
}

// Checks whether or not the channel has DM or group DM type
function isChannelDMorGroup(channel) {
	return channel && (channel.type === 'DM' || channel.type === 'GROUP_DM');
}

// Loads userAvatars from the file
function loadUserAvatars() {
	userAvatars = JSON.parse(fs.readFileSync(userAvatarsFullPath, 'utf8'));
}

// Saves userAvatars to the file
function saveUserAvatars() {
	fs.writeFileSync(userAvatarsFullPath, JSON.stringify(userAvatars));
}

// Loads userInfo from the file
function loadUserInfo() {
	userInfo = JSON.parse(fs.readFileSync(userInfoFullPath, 'utf8'));
}

// Saves userInfo to the file
function saveUserInfo() {
	fs.writeFileSync(userInfoFullPath, JSON.stringify(userInfo));
}

// Loads willList from the file
function loadWillList() {
	willList = JSON.parse(fs.readFileSync(willListFullPath, 'utf8'));
}

// Saves willList to the file
function saveWillList() {
	fs.writeFileSync(willListFullPath, JSON.stringify(willList));
}

// Loads waitList from the file
function loadWaitList() {
	waitList = JSON.parse(fs.readFileSync(waitListFullPath, 'utf8'));
}

// Saves waitList to the file
function saveWaitList() {
	fs.writeFileSync(waitListFullPath, JSON.stringify(waitList));
}

// Loads info about onlineRecord from the file
function loadOnlineRecord() {
	onlineRecord = parseInt(fs.readFileSync(cfg.onlineRecordFName, 'utf8'));
}

// Saves info about onlineRecord to the file
function saveOnlineRecord() {
	fs.writeFileSync(cfg.onlineRecordFName, onlineRecord.toString());
}

// Gets localized user offline time or empty string if it doesn't exist
function getUserOfflineTime(username = '') {
	if (userInfo[username] === undefined || userInfo[username].lastSeenAt === undefined) {
		return 'не в сети';
	}

	const difference = new Date(Date.now() - userInfo[username].lastSeenAt);

	const days = Math.floor(difference.getTime() / 86400000);  // 24 * 60 * 60 * 1000
	if (days > 0) {
		return `заходил(а) ${days} ${russifyNumber(days, ['дней', 'день', 'дня'])} назад`;
	}
	const hours = difference.getUTCHours();
	if (hours > 0) {
		return `заходил(а) ${hours} ${russifyNumber(hours, ['часов', 'час', 'часа'])} назад`;
	}
	const minutes = difference.getUTCMinutes();
	if (minutes > 0) {
		return `заходил(а) ${minutes} ${russifyNumber(minutes, ['минут', 'минуту', 'минуты'])} назад`;
	}
	const seconds = difference.getUTCSeconds();
	if (seconds > 0) {
		return `заходил(а) ${seconds} ${russifyNumber(seconds, ['секунд', 'секунду', 'секунды'])} назад`;
	}
	return 'заходил(а) только что';
}

// Returns Discord emoji (text version of it) according to user online status
function getUserOnlineEmoji(username = '') {
	return playersStatus[username] !== undefined
				? playersStatus[username].afk
					? cfg.emojiStatusAFK
					: cfg.emojiStatusOnline
				: cfg.emojiStatusOffline;
}

// Updates onlineList, onlineRecord, playersStatus, lastSeenAt parameter of every user from userInfo and waitList
function updateOnline(newOnlineList = [], players = []) {
	const whoHasGone = onlineList.filter(name => !newOnlineList.includes(name));
	const whoHasCome = newOnlineList.filter(name => playersStatus[name] === undefined);

	// onlineList update
	onlineList = newOnlineList.slice();

	// onlineRecord update
	const onlineCount = onlineList.length;
	if (onlineCount > onlineRecord) {
		onlineRecord = onlineCount;
		saveOnlineRecord();
	}
	
	// playersStatus update
	for (let i = 0; i < whoHasGone.length; i++)
		delete playersStatus[whoHasGone[i]];
	const eps = 1e-10;
	for (let i = 0; i < players.length; i++)
		if (playersStatus[players[i].name] === undefined) {
			playersStatus[players[i].name] = {
				x: players[i].x,
				y: players[i].y,
				z: players[i].z,
				lastMovedAt: Date.now(),
				afk: false
			};
		} else {
			if (Math.abs(playersStatus[players[i].name].x - players[i].x) > eps || Math.abs(playersStatus[players[i].name].y - players[i].y) > eps || Math.abs(playersStatus[players[i].name].z - players[i].z) > eps) {
				playersStatus[players[i].name].lastMovedAt = Date.now();
				playersStatus[players[i].name].afk = false;
			} else if (Date.now() - playersStatus[players[i].name].lastMovedAt > cfg.timeUntilAFK) {
				playersStatus[players[i].name].afk = true;
			}
			playersStatus[players[i].name].x = players[i].x;
			playersStatus[players[i].name].y = players[i].y;
			playersStatus[players[i].name].z = players[i].z;
		}

	// userInfo[name].lastSeenAt update
	const updateOnlineStatusList = [...whoHasGone, ...whoHasCome];
	for (let i = 0; i < updateOnlineStatusList.length; i++)
		if (userInfo[updateOnlineStatusList[i]] === undefined) {
			userInfo[updateOnlineStatusList[i]] = {
				lastSeenAt: Date.now(),
				locked: false
			};
		} else {
			userInfo[updateOnlineStatusList[i]].lastSeenAt = Date.now();
		}
	if (updateOnlineStatusList.length > 0) {
		saveUserInfo();
	}
	
	// waitList update
	const whoWaits = Object.keys(waitList);
	let isWaitListChanged = false;
	for (let i = 0; i < whoWaits.length; i++)
		for (let j = 0; j < whoHasCome.length; j++)
			if (waitList[whoWaits[i]] !== undefined && waitList[whoWaits[i]][whoHasCome[j]] !== undefined) {
				let waited = whoHasCome[j];
				delete waitList[whoWaits[i]][waited];
				if (Object.keys(waitList[whoWaits[i]]).length === 0) {
					delete waitList[whoWaits[i]];
				}
				waited = waited != '_apply' && userAvatars[waited] !== undefined ? `${userAvatars[waited]} ${waited}` : `<:unknown:650033177460604938> ${waited}`;
				client.users.fetch(whoWaits[i])
					.then(user => user.send(`Персонаж **${waited}** только что зашел на сервер. <:OSsloth:338961408320339968>`))
					.catch(() => {});
				isWaitListChanged = true;
			}
	if (isWaitListChanged) {
		saveWaitList();
	}
}

// Returns help message
async function getHelp(color = randomColor(), useExternalEmojis = false) {
	const commandMentions = new Map();
	const commands = await client.application.commands.fetch();
	for (const command of commands.values())
		commandMentions.set(command.name, `</${command.name}:${command.id}>`);
	
	//const legend = 'Значения в _[квадратных скобках]_ являются необязательными.\n' +
	//			   'Значения в _<угловых скобках>_ предоставляются пользователем.\n' +
	//			   'Значения в _"двойных кавычках"_ расцениваются как единый аргумент.\n' +
	//			   'Знак | эквивалентен логическому ИЛИ.';
	const invites = [
		//{
		//	'name': 'Поддержка',
		//	'value': `[Сервер Discord](${cfg.supportGuildLink})`,
		//	'inline': true
		//},
		{
			'name': 'Приглашение',
			'value': `[Добавить ${cfg.client.displayName} на свой Сервер](${cfg.inviteLink})`,
			'inline': true
		}
	];
		
	return {
		'embeds': [{
			'color': color,
			'title': 'Помощь',
			'description':
				`${useExternalEmojis ? '<:online:655127019889229848>' : '🟢'} ${commandMentions.get('online')} — отобразить онлайн на сервере.\n` +
				`${useExternalEmojis ? '<:Discord:601094741173731338>' : '🦄'} ${commandMentions.get('list')} — вывести список пользователей с персональным аватаром.\n` +
				//`🪪 ${commandMentions.get('info')} **<name>** — отобразить информацию о персонаже.\n` +
				//`🪪 ${commandMentions.get('setinfo')} **<name> <description>** — добавить/изменить описание персонажа.\n` +
				//`🪪 ${commandMentions.get('setart')} **<name> <link>** — добавить/изменить ссылку на арт персонажа.\n` +
				//`📯 ${commandMentions.get('will')} **** — .\n` +
				//	`${prefix}will \`->\` вывести список персонажей, собирающихся зайти на сервер сегодня;
				//	${prefix}will <name> [<comment...>] \`->\` добавить в список персонажа с соответствующим комментарием (не обязательно);
				//	${prefix}will <name> _remove_ \`->\` удалить персонажа из списка.`,
				//`⏰ ${commandMentions.get('wait')} **** — .\n` +
				//	`Позволяет управлять вашим списком ожидания заданных персонажей. Бот отправит личное сообщение, как только персонаж из этого списка появится в сети (требуется включенное разрешение на прием сообщений от пользователей на одном сервере с вами);
				//	${prefix}wait \`->\` вывести список персонажей, которых вы ждете;
				//	${prefix}wait <name> \`->\` добавить персонажа в список ожидания;
				//	${prefix}wait <name> _remove_ \`->\` удалить персонажа из списка.`,
				`📢 ${commandMentions.get('ping')} — узнать задержку Discord API.\n` +
				`❔ ${commandMentions.get('help')} — показать данное сообщение.\n` +
				`${useExternalEmojis ? '<:space:835529413029265458>' : ''}`,
				//legend + `\n${useExternalEmojis ? '<:space:835529413029265458>' : ''}`,
				'fields': invites
		}]
	};
}

// Returns info about user
//function getUserInfo(username, color = 7265400) {
//	let userOnlineIcon = ''; let userOnlineStatus = '';
//	if (playersStatus[username] !== undefined) {
//		if (playersStatus[username].afk) {
//			userOnlineIcon = cfg.urlStatusAFK;
//			userOnlineStatus = 'AFK';
//		} else {
//			userOnlineIcon = cfg.urlStatusOnline;
//			userOnlineStatus = 'в сети';
//		}
//	} else {
//		userOnlineIcon = cfg.urlStatusOffline;
//		userOnlineStatus = getUserOfflineTime(username);
//	}

//	return {
//		'embeds': [{
//			'color': color,
//			'author': {
//				'name': 'Honeymoon',
//				'url': cfg.urlSite,
//				'icon_url': 'https://cdn.discordapp.com/icons/375333729897414656/a024824d98cbeaff25b66eba15b7b6ad.png'
//			},
//			'title': `📝 Информация: ${username}`,
//			//'url': `https://dreamwalker.su/${encodeURIComponent(username)}`,
//			'url': `https://my.honeymoon.rip/skins/${encodeURIComponent(username)}.png`,
//			'thumbnail': {
//				'url': userAvatars[username] !== undefined
//					? `https://cdn.discordapp.com/emojis/${userAvatars[username].match(/<a?:[^ ]*:(\d*)>/)[1]}.${userAvatars[username].startsWith('<a') ? 'gif' : 'png'}`
//					: cfg.urlAvatarUnknown //`https://cdn.discordapp.com/embed/avatars/${randomInt(0, 5)}.png`
//			},
//			'description': `${userInfo[username] !== undefined && userInfo[username].description !== undefined ? userInfo[username].description : userInfo._default}`,
//			'image': {
//				'url': `${userInfo[username] !== undefined && userInfo[username].art !== undefined ? userInfo[username].art : ''}`
//			},
//			'footer': {
//				'icon_url': cfg.userOnlineIcon,
//				'text': cfg.userOnlineStatus
//			}
//		}]
//	};
//}

// Sends user list of the Honeymoon server
async function sendUserList(reply, { wrap = DEFAULT_WRAPPER, userList = [], title = '', additionalDescription = '', preUserDescriptionList = [], postUserDescriptionList = [], usersPerPage = 15, color = 7265400 } = {}) {
	for (let i = 0; i < userList.length; i++)
		userList[i] = userList[i].substring(0, 30);
	const userAndDescriptionList = userList.slice();
	for (let i = 0; i < userAndDescriptionList.length; i++) {
		if (userAndDescriptionList.length == postUserDescriptionList.length) {
			userAndDescriptionList[i] = `${userAndDescriptionList[i]}${postUserDescriptionList[i]}`;
		}
		if (userAvatars._apply) {
			userAndDescriptionList[i] = userList[i] != '_apply' && userAvatars[userList[i]] !== undefined ? `${userAvatars[userList[i]]} ${userAndDescriptionList[i]}` : `<:unknown:650033177460604938> ${userAndDescriptionList[i]}`;
		}
		if (userAndDescriptionList.length == preUserDescriptionList.length) {
			userAndDescriptionList[i] = `${preUserDescriptionList[i]}${userAndDescriptionList[i]}`;
		}
	}
	let userListPages = [];
	for (let i = 0; i < userAndDescriptionList.length / usersPerPage; i++)
		userListPages.push(userAndDescriptionList.slice(i * usersPerPage, Math.min((i + 1) * usersPerPage, userAndDescriptionList.length)).join('\n').trim());
	if (userListPages.length === 0) userListPages = [''];
	const contentList = [];
	for (let i = 0; i < userListPages.length; i++)
		contentList.push({
			'embeds': [{
				'color': color,
				'author': {
					'name': 'Honeymoon',
					'url': cfg.urlSite,
					'icon_url': 'https://cdn.discordapp.com/icons/375333729897414656/a024824d98cbeaff25b66eba15b7b6ad.png'
				},
				'title': title,
				'description': (`${additionalDescription}\n\n${userListPages[i]}`).trim().substring(0, 1900),
				'footer': {
					'text': userListPages.length > 1 ? `Страница [${i + 1}/${userListPages.length}]` : ''
				}
			}]
		});
	sendMessageList(reply, { wrap: wrap, contentList: contentList });
}

// Sends user list of the Honeymoon server according to message (list) type
// messageType in ['online', 'list']
async function sendUserListByType(reply, { wrap = DEFAULT_WRAPPER, messageType = 'online', userList = [], meta = '', usersPerPage = 15, color = 7265400 } = {}) {
	userList = userList.sort();
	let title = ''; let additionalDescription = ''; let preUserDescriptionList = []; const postUserDescriptionList = [];
	let userCount = userList.length;
	switch (messageType) {
		case 'online':
			const errorMessage = 'Не могу получить доступ к динамической карте. <:OSsloth:338961408320339968>';
			const options = {
				url: getDynMapURL(),
				timeout: 3000
			}
			request(options, (err, response, body) => {
				if (err) {
					logger.info(`Can't reach ${options.url} due to this error:`);
					logger.info(`    ${err}`);
					reply(wrap(errorMessage)).catch(console.error);
					return;
				}
				try {
					const content = JSON.parse(body);
					userList = content.players.map(player => shieldSpecialSymbols(player.name)).sort();
					userCount = userList.length;
					if (userCount > onlineRecord) {
						onlineRecord = userCount;
						saveOnlineRecord();
					}
					const userCountMax = Math.max(userCount, cfg.maxOnline);
					title = `Онлайн [${userCount}/${userCountMax}]`;
					additionalDescription = `🏆 \`Рекорд:\` ${onlineRecord}`;
					additionalDescription += `\n🌍 \`Погода:\` ${content.hasStorm ? 'Осадки' : 'Ясно ☀'}`;
					additionalDescription += content.hasStorm ? content.isThundering ? ' с грозой ⛈' : ' 🌧' : '';
					if (userCount === 0) {
						additionalDescription += '\n\n_\\*звук сверчков\\*_';
					}
					preUserDescriptionList = new Array(userCount);
					for (let i = 0; i < userList.length; i++)
						preUserDescriptionList[i] = getUserOnlineEmoji(userList[i]) + ' ';
					sendUserList(reply, {
						wrap: wrap,
						userList: userList,
						title: title,
						additionalDescription: additionalDescription,
						preUserDescriptionList: preUserDescriptionList,
						postUserDescriptionList: postUserDescriptionList,
						usersPerPage: usersPerPage,
						color: color
					});
				} catch (err) {
					logger.info(`Can't work with ${options.url} due to this error:`);
					logger.info(`    ${err}`);
					reply(wrap(errorMessage)).catch(console.error);
				}
			});
		break;
		case 'list':
			title = `Зарегистрировано: ${userCount}`;
			sendUserList(reply, {
				wrap: wrap,
				userList: userList,
				title: title,
				additionalDescription: additionalDescription,
				preUserDescriptionList: preUserDescriptionList,
				postUserDescriptionList: postUserDescriptionList,
				usersPerPage: usersPerPage,
				color: color
			});
		break;
		//case 'will':
		//	title = 'Сегодня будут:';
		//	if (userList.length === 0) {
		//		additionalDescription = '_\\*звук сверчков\\*_';
		//	}
		//	for (let i = 0; i < userList.length; i++) {
		//		preUserDescriptionList.push(getUserOnlineEmoji(userList[i]) + ' ');
		//		let postStr = '';
		//		if (playersStatus[userList[i]] === undefined && userInfo[userList[i]] !== undefined && userInfo[userList[i]].lastSeenAt !== undefined) {
		//			const onlineDiffHours = Math.floor((userInfo[userList[i]].lastSeenAt - Math.floor(Date.now()/(1000*60*60*24)) * (1000*60*60*24)) / (1000*60*60));
		//			if (0 <= onlineDiffHours && onlineDiffHours < 24) {
		//				postStr = ` ▪ \`${getUserOfflineTime(userList[i])}\``;
		//			}
		//		}
		//		if (willList[userList[i]] !== undefined && willList[userList[i]] != '') {
		//			postStr += `\n${cfg.emojiSpace} 📎 _${willList[userList[i]]}_`;
		//		}
		//		postUserDescriptionList.push(postStr);
		//	}
		//	sendUserList(reply, {
		//		wrap: wrap,
		//		userList: userList,
		//		title: title,
		//		additionalDescription: additionalDescription,
		//		preUserDescriptionList: preUserDescriptionList,
		//		postUserDescriptionList: postUserDescriptionList,
		//		usersPerPage: usersPerPage,
		//		color: color
		//	});
		//break;
		//case 'wait':
		//	let authorUsername = meta;
		//	title = `Список ожидания ${authorUsername}:`;
		//	if (userList.length === 0) {
		//		additionalDescription = '_\\*звук сверчков\\*_';
		//	}
		//	sendUserList(reply, {
		//		wrap: wrap,
		//		userList: userList,
		//		title: title,
		//		additionalDescription: additionalDescription,
		//		preUserDescriptionList: preUserDescriptionList,
		//		postUserDescriptionList: postUserDescriptionList,
		//		usersPerPage: usersPerPage,
		//		color: color
		//	});
		//break;
	}
}

// Tries to send message that will be deleted in "lifetime" milliseconds
function trySendNotification(reply, { wrap = DEFAULT_WRAPPER, content, lifetime = cfg.defaultNotificationLifetime } = {}) {
	if (!content || typeof content === 'string' && content.trim() === '') {
		return;
	}
	reply(wrap(content))
		.then(message => setTimeout(() => message.delete().catch(() => {}), lifetime).unref())
		.catch(() => {});
}

// Tries to send permission error message
function trySendPermissionError(reply, { wrap = DEFAULT_WRAPPER, lifetime = cfg.defaultNotificationLifetime } = {}) {
	trySendNotification(reply, {
		wrap: wrap,
		content: 'Возникли проблемы с выполнением данной команды: **не хватает прав**. 🧐',
		lifetime: lifetime
	});
}

// Sends one page of the content list with ◀️ ⏹️ ▶️ reactions (⏹️ is optional) in order to control message content according to these reactions
async function sendMessageList(reply, { wrap = DEFAULT_WRAPPER, contentList = [], page = 0, reactions = { left: '◀️', right: '▶️' } } = {}) {
	return reply(wrap(contentList[page]))
		.then(message => {
			if (contentList.length > 1) {
				operateWithMessageList(message, { contentList: contentList, page: page, reactions: reactions });
			}
		});
}

// Operates with message list according to its reactions
async function operateWithMessageList(message, { contentList = [], page = 0, reactions = { left: '◀️', right: '▶️' } } = {}) {
	const hasStop = reactions.stop;
	const isReactionValid = rName => rName === reactions.left || (hasStop && rName === reactions.stop) || rName === reactions.right;
	await message.react(reactions.left).catch(() => {}); 
	if (hasStop) await message.react(reactions.stop).catch(() => {});
	await message.react(reactions.right).catch(() => {});
	const filter = (reaction, user) => !user.bot && isReactionValid(reaction.emoji.name);
	const collector = message.createReactionCollector({ filter, time: 28200000, dispose: true });  // 7 hours 50 mins
	const reactionHandler = (r, user) => {
		const isRefresh = !(r.emoji.name === reactions.left && page == 0 || r.emoji.name === reactions.right && page == contentList.length - 1);
		if (r.emoji.name === reactions.left) {
			page = Math.max(0, page - 1);
		}
		if (r.emoji.name === reactions.right) {
			page = Math.min(page + 1, contentList.length - 1);
		}
		if (!isRefresh) {
			return;
		}
		if (r.emoji.name !== reactions.stop) {
			message.edit(contentList[page]).catch(console.error);
		} else {
			collector.stop();
		}
	};
	collector.on('collect', reactionHandler);
	collector.on('remove', reactionHandler);
	collector.on('end', () => {
		message?.reactions?.cache?.forEach((r, name) => {
			if (isReactionValid(name)) {
				r.remove().catch(() => {});
			}
		});
	});
}

// Wraps string content into MessageOptions object
function wrapContent(content, options = {}) {
	return typeof content === 'string'
		? { 'content': content, 'allowedMentions': { 'parse': [] }, ...options }
		: { ...content, 'allowedMentions': { 'parse': [] }, ...options };
}

// Sends help message directly to a user or into a guild channel if can't
cfg.manager.commands['help'].execute = async (reply, { wrap = DEFAULT_WRAPPER, replyToDM, useExternalEmojis = false } = {}) => {
	const helpMessage = await getHelp(randomColor(), replyToDM || useExternalEmojis);
	if (replyToDM) {
		replyToDM(wrap(helpMessage))
			.catch(() => reply(wrap(
					'Сорре, не хватает прав, чтобы отправить сообщение тебе в ЛС. <:OSsloth:338961408320339968>\n' +
					'Выкладываю текст справки в данный канал:'
				)).then(() => reply(wrap(helpMessage)))
			).catch(() => {});  // Ignore smart-asses who deny every single permission for the client
	} else {
		reply(wrap(helpMessage)).catch(() => {});
	}
};

// Calculates ping in ms and sends the result
cfg.manager.commands['online'].execute = async (reply, { wrap = DEFAULT_WRAPPER } = {}) => {
	sendUserListByType(reply, { wrap: wrap, messageType: 'online' });
};

// Calculates ping in ms and sends the result
cfg.manager.commands['list'].execute = async (reply, { wrap = DEFAULT_WRAPPER } = {}) => {
	sendUserListByType(reply, { wrap: wrap, messageType: 'list', userList: Object.keys(userAvatars).filter(name => name != '_apply') });
};

// Calculates ping in ms and sends the result
cfg.manager.commands['ping'].execute = async (reply, { wrap = DEFAULT_WRAPPER, edit = DEFAULT_EDITOR } = {}) => {
	const generatePingMessage = calculationStartTime => wrap(`<:Sombra:601097115195670559> Понг. \`${Date.now() - calculationStartTime}мс\``);
	const calculationStartTime = Date.now();
	reply(wrap('Вычисляю...'))
		.then(message => edit(generatePingMessage(calculationStartTime), message))
		.catch(console.error);
};

client.on('messageCreate', async message => {
	// =============================================== PREPARATION ===============================================
	// Ignore message if the client hasn't loaded yet or the message author is bot
	if (!clientLoaded || message.author.bot) {
		return;
	}
	// Ignore empty messages (more about why here: https://support-dev.discord.com/hc/en-us/articles/4404772028055)
	if (!message.content) {
		return;
	}
	// Variables
	const channel = message.channel;
	let content = message.content;
	let cleanContent = message.cleanContent;
	const commands = cfg.manager.commands;
	const permissions = isChannelDMorGroup(channel)
					  ? new Permissions(Permissions.DEFAULT)
					  : channel.permissionsFor(message.guild.me);
	const member = message.member ?? {
			...message.author,
			displayName: message.author.username,
			displayAvatarURL: options => message.author.displayAvatarURL(options),
			send: async content => message.author.send(content)
		};
	const reply = async content => channel.send(content);
	//const deferReply = async () => channel.sendTyping();
	const replyToDM = async content => member.send(content);
	const wrapReply = content => wrapContent(content, { 'reply': { 'messageReference': message, 'failIfNotExists': false } });
	//const wrapReplyWithPing = content => wrapContent(content, { 'reply': { 'messageReference': message, 'failIfNotExists': false }, 'allowedMentions': { 'repliedUser': true } });
	
	// Ignore everyone if the client has started in maintenance mode
	if (clientMaintenance && message.author.id != cfg.creatorID) {
		trySendNotification(reply, { wrap: wrapReply, content: 'Ведутся тех. работы. 🍺' });
		return;
	}
	
	// ================================================= PREFIX ==================================================
	// If message starts with bot mention it can be perceived as prefix
	const prefix = content.match(new RegExp(`^<@!?${client.user.id}>\\s*`))?.[0] ?? cfg.prefix;
	// Ignore messages not starting with prefix or having less or equal symbols than prefix length
	if (!content.startsWith(prefix) || content.length <= prefix.length) {
		return;
	}
	// Remove prefix from content
	content = content.substring(prefix.length);
	
	// ================================================= COMMAND =================================================
	// Get command
	const commandRaw = content.match(/^(\S+)/)?.[1].toLowerCase();
	// Change command aliases to their full versions
	const commandName = cfg.manager.aliases[commandRaw] ?? commandRaw;
	// Ignore invalid commands
	if (!commands[commandName]) {
		return;
	}
	// Check whether client has permissions to execute the command
	if (!permissions.has(commands[commandName].permissions)) {
		trySendPermissionError(reply, { wrap: wrapReply });
		return;
	}
	
	// ================================================ ARGUMENTS ================================================
	// Throw away any garbage
	content = shrinkSpaces(content.substring(commandRaw.length)).trim();
	cleanContent = shrinkSpaces(cleanContent
			.substring(cleanContent.match(commandRaw)?.index + commandRaw.length)
		).replace(/[@#]\u200b?(?=[^ ])/g, '').trim();
	// Get data options (arguments)
	const data = [{ 'value': content, 'cleanValue': cleanContent }, ...splitContentsIntoData(content, cleanContent)];
	
	// ================================================ EXECUTION ================================================
	switch (commandName) {
		case 'help':   commands['help']  .execute(reply, { wrap: wrapReply, replyToDM: replyToDM, useExternalEmojis: permissions.has(['USE_EXTERNAL_EMOJIS']) }); break;
		case 'online': commands['online'].execute(reply, { wrap: wrapReply }); break;
		case 'list':   commands['list']  .execute(reply, { wrap: wrapReply }); break;
		case 'ping':   commands['ping']  .execute(reply, { wrap: wrapReply }); break;
		case 'reset':
			// Shutdown client in order to restart it via ./startup.sh script
			if (message.author.id == cfg.creatorID) {
				process.kill(process.pid, 'SIGTERM');
			}
		break;
		//case 'reusers':
		//	// Reload userInfo and userAvatars maps
		//	if (message.author.id == cfg.creatorID) {
		//		loadUserAvatars();
		//		loadUserInfo();
		//		logger.info(`Reloaded userInfo and userAvatars maps at ${dateNow()}`);
		//		sendNotification(message.channel, 'Файлы аватаров и информации о персонажах успешно перезагружены. <:OSsloth:338961408320339968>');
		//	}
		//break;
		//case 'avatarswitch':
		//	if (message.author.id == cfg.creatorID) {
		//		userAvatars._apply = !userAvatars._apply;
		//		saveUserAvatars();
		//		sendNotification(message.channel, 'Флаг отображения аватаров персонажей успешно переключен. <:OSsloth:338961408320339968>');
		//	}
		//break;
		//case 'avatar':
		//	// Setup emoji-avatar for the user
		//	if (message.author.id == cfg.creatorID) {
		//		let avatarNotification = '';
		//		if (args.length === 0) {       // Clear all the user avatars
		//			userAvatars = { _apply: userAvatars._apply };
		//			avatarNotification = 'Все аватары персонажей успешно удалены.';
		//		}
		//		else if (args.length === 1) {  // Clear the user's avatar
		//			delete userAvatars[args[0]];
		//			avatarNotification = 'Аватар данного персонажа успешно удален.';
		//		}
		//		else {                         // Otherwise setup it
		//			userAvatars[args[0]] = args[0] != '_apply' ? args[1] : userAvatars[args[0]];
		//			avatarNotification = 'Аватар данного персонажа успешно изменен.';
		//		}
		//		saveUserAvatars();
		//		sendNotification(message.channel, `${avatarNotification} <:OSsloth:338961408320339968>`);
		//	}
		//break;
		//case 'info':
		//	if (args.length > 0)
		//		message.channel.send(getUserInfo(args[0]));
		//break;
		//case 'setinfo':
		//	if (args.length > 1) {
		//		if ((userInfo._global_lock || userInfo[args[0]] !== undefined && userInfo[args[0]].locked) && message.author.id != cfg.creatorID) {
		//			message.channel.send('Изменение информации об этом персонаже недоступно. <:SlothGun:609715424317276160>');
		//			return;
		//		}
		//		let contentInfo = content.replace(/^"[^"]*"|^[^ "]+/, '').trim().substring(0, 1500);
		//		if (userInfo[args[0]] === undefined)
		//			userInfo[args[0]] = {
		//				description: contentInfo,
		//				locked: false
		//			};
		//		else
		//			userInfo[args[0]].description = contentInfo;
		//		saveUserInfo();
		//		sendNotification(message.channel, 'Информация о персонаже успешно изменена. <:OSsloth:338961408320339968>');
		//	}
		//break;
		//case 'setart':
		//	if (args.length > 1) {
		//		if ((userInfo._global_lock || userInfo[args[0]] !== undefined && userInfo[args[0]].locked) && message.author.id != cfg.creatorID) {
		//			message.channel.send('Изменение информации об этом персонаже недоступно. <:SlothGun:609715424317276160>');
		//			return;
		//		}
		//		if (userInfo[args[0]] === undefined)
		//			userInfo[args[0]] = {
		//				art: args[1],
		//				locked: false
		//			};
		//		else
		//			userInfo[args[0]].art = args[1];
		//		saveUserInfo();
		//		sendNotification(message.channel, 'Изображение/арт персонажа успешно изменены. <:OSsloth:338961408320339968>');
		//	}
		//break;
		//case 'infolockswitch':
		//	if (message.author.id == cfg.creatorID) {
		//		let infolockNotification = '';
		//		if (args.length === 0) {
		//			userInfo._global_lock = !userInfo._global_lock;
		//			infolockNotification = 'Флаг глобальной блокировки изменения информации о персонажах успешно переключен.';
		//		}
		//		else if (userInfo[args[0]] !== undefined) {
		//			userInfo[args[0]].locked = !userInfo[args[0]].locked;
		//			infolockNotification = 'Флаг блокировки изменения информации о данном персонаже успешно переключен.';
		//		}
		//		else
		//			infolockNotification = 'Не найдено информации о данном персонаже.';
		//		saveUserInfo();
		//		sendNotification(message.channel, `${infolockNotification} <:OSsloth:338961408320339968>`);
		//	}
		//break;
		//case 'deleteinfo':
		//	if (message.author.id == cfg.creatorID) {
		//		let deleteinfoNotification = '';
		//		if (args.length === 0) {
		//			userInfo = { _global_lock: false, _default: userInfo._default }
		//			deleteinfoNotification = 'Информация обо всех персонажах успешно удалена.';
		//		}
		//		else {
		//			delete userInfo[args[0]];
		//			deleteinfoNotification = 'Информация о данном персонаже успешно удалена.';
		//		}
		//		saveUserInfo();
		//		sendNotification(message.channel, `${deleteinfoNotification} <:OSsloth:338961408320339968>`);
		//	}
		//break;
		//case 'will':
		//	if (args.length === 0) {
		//		fs.stat(willListFullPath, (err, stats) => {
		//			let lastWillListModifyDay = Math.floor(stats.mtimeMs/(1000*60*60*24));
		//			let currentDay = Math.floor(Date.now()/(1000*60*60*24));
		//			if (!err && lastWillListModifyDay != currentDay) {
		//				willList = {};
		//				saveWillList();
		//			}
		//			sendUserListByType(message.channel, 'will', Object.keys(willList), '', 10);
		//		});
		//	}
		//	else {
		//		let willNotification = '';
		//		if (args.length > 1 && args[1] == 'remove') {
		//			delete willList[args[0]];
		//			saveWillList();
		//			willNotification = 'Персонаж успешно удален из списка \"**Сегодня будут**\".';
		//		}
		//		else {
		//			let willCommentary = content.replace(/^"[^"]*"|^[^ "]+/, '').trim().substring(0, 100);
		//			willList[args[0].substring(0, 30)] = willCommentary;
		//			saveWillList();
		//			willNotification = 'Персонаж успешно добавлен в список \"**Сегодня будут**\".';
		//		}
		//		sendNotification(message.channel, `${willNotification} <:OSsloth:338961408320339968>`);
		//	}
		//break;
		//case 'wait':
		//	if (args.length === 0) {
		//		let authorWaitList = waitList[message.author.id] !== undefined ? Object.keys(waitList[message.author.id]) : [];
		//		let authorName = message.channel.type == 'text' && message.member.nickname ? message.member.nickname : message.author.username;
		//		sendUserListByType(message.channel, 'wait', authorWaitList, authorName);
		//	}
		//	else {
		//		let waitNotification = '';
		//		if (args.length > 1 && args[1] == 'remove') {
		//			if (waitList[message.author.id] !== undefined)
		//				delete waitList[message.author.id][args[0]];
		//			if (Object.keys(waitList[message.author.id]).length === 0)
		//				delete waitList[message.author.id];
		//			saveWaitList();
		//			waitNotification = 'Персонаж успешно удален из вашего списка ожидания.';
		//		}
		//		else {
		//			if (waitList[message.author.id] === undefined)
		//				waitList[message.author.id] = {};
		//			if (Object.keys(waitList[message.author.id]).length < cfg.maxUsersToWait) {
		//				waitList[message.author.id][args[0].substring(0, 30)] = {};
		//				saveWaitList();
		//				waitNotification = 'Персонаж успешно добавлен в ваш список ожидания.';
		//			}
		//			else
		//				waitNotification = 'Превышен лимит количества персонажей для ожидания.';
		//		}
		//		sendNotification(message.channel, `${waitNotification} <:OSsloth:338961408320339968>`);
		//	}
		//break;
	}
});

client.on('interactionCreate', async interaction => {
	// =============================================== PREPARATION ===============================================
	// Ignore interaction if the client hasn't loaded yet or the interaction author is bot
	if (!clientLoaded || interaction.user.bot) {
		return;
	}
	// Ignore interactions that are not commands
	if (!interaction.isCommand()) {
		return;
	}
	const commands = cfg.manager.commands;
	const commandName = interaction.commandName;
	// Ignore invalid commands
	if (!commands[commandName]) {
		return;
	}
	// Variables
	const channel = interaction.channel;
	const permissions = isChannelDMorGroup(channel)
					  ? new Permissions(Permissions.DEFAULT)
					  : channel.permissionsFor(interaction.guild.me);
	// Check whether client has permissions to execute the command
	const data = [...interaction.options.data];  // Making properties copy, because source is read-only
	//const member = interaction.member ?? {
	//		...interaction.user,
	//		displayName: interaction.user.username,
	//		displayAvatarURL: options => interaction.user.displayAvatarURL(options)
	//	};
	const reply = async content => interaction.reply(content);
	//const deferReply = async content => interaction.deferReply(content);
	const editReply = async content => interaction.editReply(content);
	//const fetchThenEditReply = async content => interaction.fetchReply().then(() => interaction.editReply(content));
	const wrapEphemeral = content => wrapContent(content, { 'ephemeral': true });
	const wrapFetchReply = content => wrapContent(content, { 'fetchReply': true });
	//const wrapFetchReplyWithPing = content => wrapContent(content, { 'fetchReply': true, 'allowedMentions': { 'repliedUser': true } });
	////const wrapEphemeralFetchReply = content => wrapContent(content, { 'ephemeral': true, 'fetchReply': true });
	
	// ================================================ ARGUMENTS ================================================
	// Cleanse data options (arguments)
	const resolvedData = interaction.options.resolved;
	let [content, cleanContent] = ['', ''];
	for (const option of data) {
		if (typeof option.value !== 'string')
			continue;
		
		let cleanValue = option.value.replace(/@(everyone|here)/g, '$1');  // Remove @everyone, @here mentions
		if (resolvedData.members) {
			for (const [id, member] of resolvedData.members)               // Remove resolved member mentions
				cleanValue = cleanValue.replace(new RegExp(`<@!?${id}>`, 'g'), member.nickname ?? member.user.username);
		} else if (resolvedData.users) {
			for (const [id, user] of resolvedData.users)                   // Remove resolved user mentions
				cleanValue = cleanValue.replace(new RegExp(`<@!?${id}>`, 'g'), user.username);
		}
		if (resolvedData.roles)
			for (const [id, role] of resolvedData.roles)                   // Remove resolved role mentions
				cleanValue = cleanValue.replace(new RegExp(`<@&?${id}>`, 'g'), role.name);
		if (resolvedData.channels)
			for (const [id, channel] of resolvedData.channels)             // Remove resolved channel mentions
				cleanValue = cleanValue.replace(new RegExp(`<#${id}>`, 'g'), channel.name);
		
		option.value      = shrinkSpaces(option.value).trim();
		option.cleanValue = shrinkSpaces(cleanValue).trim();
		content      += `${option.value} `;
		cleanContent += `${option.cleanValue} `;
	}
	data.unshift({ 'value': content.trimEnd(), 'cleanValue': cleanContent.trimEnd() });
	
	// ================================================ EXECUTION ================================================
	switch (commandName) {
		case 'help':   commands['help']  .execute(reply, { wrap: wrapFetchReply, useExternalEmojis: permissions.has(['USE_EXTERNAL_EMOJIS']) }); break;
		case 'online': commands['online'].execute(reply); break;
		case 'list':   commands['list']  .execute(reply); break;
		case 'ping':   commands['ping']  .execute(reply, { wrap: wrapEphemeral, edit: editReply }); break;
	}
});

// Initialization block
loadOnlineRecord();
loadUserAvatars();
loadUserInfo();
loadWillList();
loadWaitList();
client.login(auth.token);
