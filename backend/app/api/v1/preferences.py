from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.entities import User, UserPreference
from app.schemas.api import PreferencesPayload

router = APIRouter(prefix="/preferences", tags=["preferences"])


@router.get("", response_model=PreferencesPayload)
def get_preferences(current_user: User = Depends(get_current_user)) -> PreferencesPayload:
    prefs = current_user.preferences
    if not prefs:
        return PreferencesPayload(theme="dark", settings={})
    return PreferencesPayload(theme=prefs.theme, settings=prefs.settings_json or {})


@router.put("", response_model=PreferencesPayload)
def update_preferences(
    payload: PreferencesPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PreferencesPayload:
    prefs = current_user.preferences
    if not prefs:
        prefs = UserPreference(
            user_id=current_user.id,
            theme=payload.theme,
            settings_json=payload.settings,
        )
        db.add(prefs)
    else:
        prefs.theme = payload.theme
        prefs.settings_json = payload.settings

    db.commit()
    db.refresh(prefs)
    return PreferencesPayload(theme=prefs.theme, settings=prefs.settings_json or {})
