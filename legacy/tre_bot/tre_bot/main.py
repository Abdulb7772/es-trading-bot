"""
main.py
=======
Entry point. Loads credentials from a .env file (see .env.example),
then starts the bot's main loop. Run with:

    python main.py

Stop with Ctrl+C.
"""

import sys
from dotenv import load_dotenv

load_dotenv()  # populates os.environ from a local .env file, if present

import config  # noqa: E402 -- imported after load_dotenv so env vars are set
from bot import TREBot  # noqa: E402


def _check_required_config() -> None:
    missing = []
    if not config.ALPACA_API_KEY:
        missing.append("ALPACA_API_KEY")
    if not config.ALPACA_SECRET_KEY:
        missing.append("ALPACA_SECRET_KEY")
    if not config.TOPSTEPX_USERNAME:
        missing.append("TOPSTEPX_USERNAME")
    if not config.TOPSTEPX_API_KEY:
        missing.append("TOPSTEPX_API_KEY")
    if not config.TOPSTEPX_ACCOUNT_ID:
        missing.append("TOPSTEPX_ACCOUNT_ID")
    if missing:
        print("Missing required environment variables: " + ", ".join(missing))
        print("Copy .env.example to .env and fill these in before running.")
        sys.exit(1)


def main() -> None:
    _check_required_config()
    bot = TREBot()
    try:
        bot.start()
    except KeyboardInterrupt:
        print("\n[main] shutting down...")


if __name__ == "__main__":
    main()
