from fastapi import APIRouter

from app.api.v1 import (
    analytics,
    auth,
    friends,
    leaderboard,
    learning,
    notifications,
    preferences,
    profile,
    races,
    results,
)

api_v1_router = APIRouter(prefix="/api/v1")
api_v1_router.include_router(auth.router)
api_v1_router.include_router(results.router)
api_v1_router.include_router(profile.router)
api_v1_router.include_router(preferences.router)
api_v1_router.include_router(learning.router)
api_v1_router.include_router(analytics.router)
api_v1_router.include_router(leaderboard.router)
api_v1_router.include_router(races.router)
api_v1_router.include_router(friends.router)
api_v1_router.include_router(notifications.router)
