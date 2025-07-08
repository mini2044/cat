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

# Add the command handler to the dispatcher
dispatcher.add_handler(CommandHandler("start", start))

@app.route('/webhook', methods=['POST'])
def webhook():
    update = Update.de_json(request.get_json(force=True), bot)
    dispatcher.process_update(update)
    return 'ok'

if __name__ == '__main__':
    # You need to set up a webhook for your bot to receive updates.
    # You can do this by sending a POST request to:
    # https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=<YOUR_WEBHOOK_URL>
    # Replace <YOUR_BOT_TOKEN> with your bot's token and <YOUR_WEBHOOK_URL> with the URL of your webhook endpoint.
    # For local development, you can use a tool like ngrok to expose your local server to the internet.
    app.run(port=5000)