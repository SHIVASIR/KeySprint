from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.rate_limit import enforce_rate_limit
from app.models.entities import Friendship, Profile, User
from app.schemas.api import FriendRequestCreate
from app.services.social import create_notification

router = APIRouter(prefix="/friends", tags=["friends"])


def _user_brief(db: Session, user: User) -> dict:
    prof = db.scalar(select(Profile).where(Profile.user_id == user.id))
    return {
        "user_id": user.id,
        "username": user.username,
        "display_name": prof.display_name if prof else user.username,
    }


@router.get("")
def list_friends(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    rows = db.scalars(
        select(Friendship).where(
            or_(
                Friendship.requester_id == current_user.id,
                Friendship.addressee_id == current_user.id,
            )
        )
    ).all()

    friends = []
    incoming_requests = []
    outgoing_requests = []

    for row in rows:
        if row.status == "accepted":
            other_id = row.addressee_id if row.requester_id == current_user.id else row.requester_id
            other = db.get(User, other_id)
            if other:
                friends.append(
                    {
                        "friendship_id": row.id,
                        "since": row.updated_at,
                        **_user_brief(db, other),
                    }
                )
        elif row.status == "pending":
            if row.addressee_id == current_user.id:
                requester = db.get(User, row.requester_id)
                if requester:
                    incoming_requests.append(
                        {
                            "friendship_id": row.id,
                            "created_at": row.created_at,
                            **_user_brief(db, requester),
                        }
                    )
            else:
                addressee = db.get(User, row.addressee_id)
                if addressee:
                    outgoing_requests.append(
                        {
                            "friendship_id": row.id,
                            "created_at": row.created_at,
                            **_user_brief(db, addressee),
                        }
                    )

    return {
        "friends": friends,
        "incoming_requests": incoming_requests,
        "outgoing_requests": outgoing_requests,
    }


@router.post(
    "/requests",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(enforce_rate_limit("friend_request", limit=20, window_seconds=60))],
)
def send_friend_request(
    payload: FriendRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    target_username = payload.username.strip().lower()
    if target_username == current_user.username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot send a friend request to yourself.",
        )

    target = db.scalar(select(User).where(User.username == target_username, User.is_active.is_(True)))
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    existing = db.scalar(
        select(Friendship).where(
            or_(
                and_(
                    Friendship.requester_id == current_user.id,
                    Friendship.addressee_id == target.id,
                ),
                and_(
                    Friendship.requester_id == target.id,
                    Friendship.addressee_id == current_user.id,
                ),
            )
        )
    )
    if existing:
        if existing.status == "accepted":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You are already friends with this user.",
            )
        if existing.status == "pending":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A pending friend request already exists between you and this user.",
            )
        # Re-open previously rejected request under current requester/addressee
        existing.requester_id = current_user.id
        existing.addressee_id = target.id
        existing.status = "pending"
        friendship = existing
    else:
        pair_key = f"{min(current_user.id, target.id)}:{max(current_user.id, target.id)}"
        friendship = Friendship(
            requester_id=current_user.id,
            addressee_id=target.id,
            pair_key=pair_key,
            status="pending",
        )
        db.add(friendship)

    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A friend relationship already exists between you and this user.",
        )

    create_notification(
        db,
        user_id=target.id,
        kind="friend_request",
        title="New Friend Request",
        message=f"@{current_user.username} sent you a friend request.",
        link="/profile",
        reference_id=friendship.id,
    )
    db.commit()
    db.refresh(friendship)

    return {
        "friendship_id": friendship.id,
        "status": friendship.status,
        **_user_brief(db, target),
    }


@router.post("/requests/{friendship_id}/accept")
def accept_friend_request(
    friendship_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    row = db.get(Friendship, friendship_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Friend request not found.")
    if row.addressee_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the recipient can accept a friend request.",
        )
    if row.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Friend request is no longer pending.",
        )

    row.status = "accepted"
    create_notification(
        db,
        user_id=row.requester_id,
        kind="friend_accepted",
        title="Friend Request Accepted",
        message=f"@{current_user.username} accepted your friend request.",
        link=f"/u/{current_user.username}",
        reference_id=row.id,
    )
    db.commit()
    return {"friendship_id": row.id, "status": row.status}


@router.post("/requests/{friendship_id}/reject")
def reject_friend_request(
    friendship_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    row = db.get(Friendship, friendship_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Friend request not found.")
    if row.addressee_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the recipient can reject a friend request.",
        )
    if row.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Friend request is no longer pending.",
        )

    row.status = "rejected"
    db.commit()
    return {"friendship_id": row.id, "status": row.status}


@router.delete("/requests/{friendship_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_friend_request(
    friendship_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    row = db.get(Friendship, friendship_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Friend request not found.")
    if row.requester_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the sender can cancel an outgoing friend request.",
        )
    if row.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only pending requests can be cancelled.",
        )
    db.delete(row)
    db.commit()


@router.delete("/{friend_user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_friend(
    friend_user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    row = db.scalar(
        select(Friendship).where(
            Friendship.status == "accepted",
            or_(
                and_(
                    Friendship.requester_id == current_user.id,
                    Friendship.addressee_id == friend_user_id,
                ),
                and_(
                    Friendship.requester_id == friend_user_id,
                    Friendship.addressee_id == current_user.id,
                ),
            ),
        )
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Friendship not found.")
    db.delete(row)
    db.commit()
