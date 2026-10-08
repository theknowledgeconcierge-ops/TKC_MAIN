"""Shared Mongo handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

logger = logging.getLogger(__name__)

# One entry per collection: every field a route filters, sorts, or dedupes on. Applied by ensure_indexes() at startup.
INDEXES: dict[str, list[IndexModel]] = {
    "status_checks": [IndexModel([("timestamp", DESCENDING)], name="timestamp_desc")],
    "orders": [
        IndexModel([("id", ASCENDING)], name="orders_id", unique=True),
        IndexModel([("customer_email", ASCENDING)], name="orders_customer_email"),
        IndexModel([("created_at", DESCENDING)], name="orders_created_desc"),
        IndexModel([("razorpay_order_id", ASCENDING)], name="orders_razorpay_order_id", unique=True, sparse=True),
    ],
    "razorpay_webhook_events": [
        IndexModel([("event_key", ASCENDING)], name="razorpay_event_key", unique=True),
        IndexModel([("received_at", DESCENDING)], name="razorpay_received_desc"),
    ],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:  # one at a time so a bad spec skips only itself
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:  # never block boot on an index; the log line names what to fix
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)
