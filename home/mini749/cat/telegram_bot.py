import os
import telegram
from flask import Flask, request
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Dispatcher, CommandHandler, CallbackContext

# Initialize Flask app
app = Flask(__name__)

# Get bot token from environment variable
TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN')
if not TOKEN:
    raise ValueError("No TELEGRAM_BOT_TOKEN found in environment variables")

# Get game URL from environment variable
GAME_URL = os.environ.get('TELEGRAM_GAME_URL')
if not GAME_URL:
    raise ValueError("No TELEGRAM_GAME_URL found in environment variables")

# Initialize bot and dispatcher
bot = telegram.Bot(token=TOKEN)
dispatcher = Dispatcher(bot, None, use_context=True)

# Define the start command handler
def start(update: Update, context: CallbackContext) -> None:
    keyboard = [[InlineKeyboardButton("Play Game", url=GAME_URL)]]
    reply_markup = InlineKeyboardMarkup(keyboard)
    update.message.reply_text('Welcome to the game! Click the button below to play.', reply_markup=reply_markup)

# 新增一个 play 命令处理函数
def play(update: Update, context: CallbackContext) -> None:
    """Sends a message with a button that opens the game URL."""
    keyboard = [[InlineKeyboardButton("Play Latest Game", url=GAME_URL)]]
    reply_markup = InlineKeyboardMarkup(keyboard)
    update.message.reply_text('Click the button to play the latest version of the game:', reply_markup=reply_markup)

# Add command handlers to the dispatcher
dispatcher.add_handler(CommandHandler("start", start))
dispatcher.add_handler(CommandHandler("play", play)) # 添加新的 play 命令

@app.route('/webhook', methods=['POST'])
def webhook():
    update = Update.de_json(request.get_json(force=True), bot)
    dispatcher.process_update(update)
    return 'ok'