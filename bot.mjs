import 'dotenv/config';

import {
  Bot,
  Keyboard
} from '@maxhub/max-bot-api';


const BOT_TOKEN = process.env.BOT_TOKEN;

const WEB_APP_URL = process.env.WEB_APP_URL;


if (!BOT_TOKEN) {
  throw new Error(
    'В .env отсутствует BOT_TOKEN.'
  );
}


if (!WEB_APP_URL) {
  throw new Error(
    'В .env отсутствует WEB_APP_URL.'
  );
}


const bot = new Bot(BOT_TOKEN);


function getMainKeyboard() {
  return Keyboard.inlineKeyboard([
    [
      Keyboard.button.openApp(
        'Открыть ZigZag',
        WEB_APP_URL
      )
    ]
  ]);
}


bot.command('start', async (ctx) => {
  await ctx.reply(
    [
      ' <b>ZigZag — твой маршрут по Казани</b>',
      '',
      'Выбери интересы, время прогулки и бюджет.',
      'Мы подберём реальные места и события.',
      '',
      'Нажми кнопку ниже, чтобы открыть мини-приложение.'
    ].join('\n'),
    {
      format: 'html',
      attachments: [
        getMainKeyboard()
      ]
    }
  );
});



bot.on('message_created', async (ctx) => {
  const text = ctx.message?.body?.text?.trim();

  if (!text) {
    return;
  }

  await ctx.reply(
    'Нажми кнопку, чтобы построить маршрут по Казани.',
    {
      attachments: [
        getMainKeyboard()
      ]
    }
  );
});


bot.start();

console.log('MAX-бот ZigZag запущен.');