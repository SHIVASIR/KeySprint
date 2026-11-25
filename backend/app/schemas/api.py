from datetime import datetime
from typing import Any
from pydantic import BaseModel, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[a-zA-Z0-9_]+$")
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str | None = Field(default=None, max_length=64)


class LoginRequest(BaseModel):
    identifier: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    display_name: str
    bio: str
    preferred_layout: str
    is_public: bool = True
    show_stats: bool = True
    show_achievements: bool = True
    show_race_history: bool = True
    created_at: datetime


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=64)
    bio: str | None = Field(default=None, max_length=240)
    preferred_layout: str | None = Field(default=None, max_length=32)
    is_public: bool | None = None
    show_stats: bool | None = None
    show_achievements: bool | None = None
    show_race_history: bool | None = None


class TimelineSampleSchema(BaseModel):
    second: int = Field(ge=0)
    wpm: float = Field(ge=0, le=350)
    rawWpm: float = Field(ge=0, le=400)
    accuracy: float = Field(ge=0, le=100)
    errors: int = Field(ge=0)


class KeystrokeSummaryItem(BaseModel):
    expected: str = Field(min_length=1, max_length=4)
    correct: bool
    latency_ms: float = Field(ge=0, le=5000)


class BigramSummaryItem(BaseModel):
    attempts: int = Field(ge=0, le=50000)
    errors: int = Field(ge=0, le=50000)
    total_latency_ms: float = Field(ge=0, le=10000000)


class CreateResultRequest(BaseModel):
    client_record_id: str = Field(min_length=4, max_length=64)
    mode: str = Field(min_length=1, max_length=24)
    category: str = Field(min_length=1, max_length=64)
    difficulty: str = Field(min_length=1, max_length=16)
    duration_seconds: float = Field(ge=0, le=3600)
    gross_wpm: float = Field(ge=0, le=350)
    net_wpm: float = Field(ge=0, le=350)
    accuracy: float = Field(ge=0, le=100)
    consistency: float = Field(default=0.0, ge=0, le=100)
    correct_chars: int = Field(ge=0, le=50000)
    incorrect_chars: int = Field(ge=0, le=50000)
    total_chars: int = Field(ge=0, le=50000)
    correct_words: int = Field(default=0, ge=0, le=10000)
    incorrect_words: int = Field(default=0, ge=0, le=10000)
    language: str | None = Field(default=None, max_length=32)
    timeline: list[TimelineSampleSchema] = Field(default_factory=list, max_length=300)
    keystroke_summary: list[KeystrokeSummaryItem] = Field(default_factory=list, max_length=1000)
    bigram_summary: dict[str, BigramSummaryItem] = Field(default_factory=dict)
    mistake_summary: dict[str, int] = Field(default_factory=dict)
    created_at: datetime | None = None

    @field_validator("net_wpm")
    @classmethod
    def check_plausible_wpm(cls, v: float) -> float:
        if v > 320:
            raise ValueError("Implausible WPM value rejected.")
        return v


class ImportResultsRequest(BaseModel):
    records: list[CreateResultRequest] = Field(max_length=200)


class ResultResponse(BaseModel):
    id: str
    client_record_id: str
    mode: str
    category: str
    difficulty: str
    language: str | None
    duration_seconds: float
    gross_wpm: float
    net_wpm: float
    accuracy: float
    consistency: float
    correct_chars: int
    incorrect_chars: int
    total_chars: int
    correct_words: int
    incorrect_words: int
    timeline: list[dict[str, Any]]
    verified_competitive: bool
    imported_from_guest: bool
    created_at: datetime


class PaginatedResultsResponse(BaseModel):
    items: list[ResultResponse]
    total: int
    page: int
    page_size: int


class LearningProgressRequest(BaseModel):
    lesson_id: str = Field(min_length=2, max_length=64)
    completed: bool
    best_wpm: float = Field(ge=0, le=350)
    best_accuracy: float = Field(ge=0, le=100)
    draft_typed_text: str | None = Field(default=None, max_length=10000)
    draft_elapsed_ms: int | None = Field(default=None, ge=0, le=3600000)
    clear_draft: bool = False


class CreateRaceRequest(BaseModel):
    difficulty: str = Field(default="medium", pattern="^(easy|medium|hard)$")
    is_private: bool = True


class InviteRaceRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[a-zA-Z0-9_]+$")


class FriendRequestCreate(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[a-zA-Z0-9_]+$")


class ChallengeCheckpointRequest(BaseModel):
    attempt_token: str = Field(min_length=10, max_length=512)
    seq: int = Field(ge=1, le=2000)
    chars_typed: int = Field(ge=0, le=5000)


class ChallengeCompleteRequest(BaseModel):
    attempt_token: str = Field(min_length=10, max_length=512)
    typed_text: str = Field(min_length=1, max_length=5000)
    consistency: float | None = Field(default=None, ge=0, le=100)
    timeline: list[TimelineSampleSchema] = Field(default_factory=list, max_length=300)


class PreferencesPayload(BaseModel):
    theme: str = Field(default="dark", pattern="^(dark|light|system)$")
    settings: dict[str, Any] = Field(default_factory=dict)
