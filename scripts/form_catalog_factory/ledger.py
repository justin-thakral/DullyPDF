"""Transactional control plane for the form-catalog factory.

The factory can have many workers researching, rendering, and reviewing forms
at the same time. This module keeps coordination in SQLite instead of shared
JSON files so claims and state changes are atomic. Leases are fenced with a
monotonically increasing epoch: once an expired task is reclaimed, the old
worker can no longer publish a result even if it resumes later.

SQLite WAL mode is appropriate for the current single-host worker pool. The
public API deliberately avoids returning a live connection so every operation
owns a short transaction and workers do not hold database locks while doing
expensive PDF work.
"""

from __future__ import annotations

import hashlib
import json
import secrets
import sqlite3
import time
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Iterable, Iterator, Mapping, Sequence


class Stage(str, Enum):
    """All durable states supported by the factory item state machine."""

    QUEUED = "queued"
    SPEC_CLAIMED = "spec_claimed"
    SPEC_READY = "spec_ready"
    RENDER_CLAIMED = "render_claimed"
    RENDERED = "rendered"
    QA_CLAIMED = "qa_claimed"
    QA_PASSED = "qa_passed"
    REVIEW_CLAIMED = "review_claimed"
    REVIEW_APPROVED = "review_approved"
    BATCH_FROZEN = "batch_frozen"
    UPLOAD_CLAIMED = "upload_claimed"
    STAGING_UPLOADED = "staging_uploaded"
    CANARY_CLAIMED = "canary_claimed"
    CANARY_LIVE = "canary_live"
    RELEASE_CLAIMED = "release_claimed"
    LIVE = "live"
    RETRY_WAIT = "retry_wait"
    BLOCKED = "blocked"
    SUPERSEDED = "superseded"
    RETIRED = "retired"


class BatchStatus(str, Enum):
    OPEN = "open"
    FROZEN = "frozen"


@dataclass(frozen=True)
class LeasePolicy:
    ready: Stage
    claimed: Stage
    completed: Stage


LEASE_POLICIES: dict[Stage, LeasePolicy] = {
    Stage.SPEC_CLAIMED: LeasePolicy(Stage.QUEUED, Stage.SPEC_CLAIMED, Stage.SPEC_READY),
    Stage.RENDER_CLAIMED: LeasePolicy(
        Stage.SPEC_READY,
        Stage.RENDER_CLAIMED,
        Stage.RENDERED,
    ),
    Stage.QA_CLAIMED: LeasePolicy(Stage.RENDERED, Stage.QA_CLAIMED, Stage.QA_PASSED),
    Stage.REVIEW_CLAIMED: LeasePolicy(
        Stage.QA_PASSED,
        Stage.REVIEW_CLAIMED,
        Stage.REVIEW_APPROVED,
    ),
    Stage.UPLOAD_CLAIMED: LeasePolicy(
        Stage.BATCH_FROZEN,
        Stage.UPLOAD_CLAIMED,
        Stage.STAGING_UPLOADED,
    ),
    Stage.CANARY_CLAIMED: LeasePolicy(
        Stage.STAGING_UPLOADED,
        Stage.CANARY_CLAIMED,
        Stage.CANARY_LIVE,
    ),
    Stage.RELEASE_CLAIMED: LeasePolicy(
        Stage.CANARY_LIVE,
        Stage.RELEASE_CLAIMED,
        Stage.LIVE,
    ),
}

CLAIMED_STAGES = frozenset(LEASE_POLICIES)
ALL_STAGE_VALUES = tuple(stage.value for stage in Stage)
ALL_BATCH_STATUS_VALUES = tuple(status.value for status in BatchStatus)

ARTIFACT_UPDATE_FIELDS = frozenset(
    {
        "spec_hash",
        "pdf_hash",
        "thumbnail_hash",
        "schema_hash",
        "pdf_uri",
        "thumbnail_uri",
        "qa_evidence_uri",
    }
)
FREEZE_REQUIRED_FIELDS = (
    "spec_hash",
    "pdf_hash",
    "thumbnail_hash",
    "schema_hash",
    "pdf_uri",
    "thumbnail_uri",
    "qa_evidence_uri",
)
_IDEMPOTENCY_MISSING = object()


@dataclass(frozen=True)
class WorkItem:
    catalog_id: str
    section: str
    filename: str
    slug: str
    ownership: str
    intent_fingerprint: str | None
    stage: Stage
    batch_id: str | None
    priority: int
    payload: dict[str, Any]
    current_asset_hash: str | None
    spec_hash: str | None
    pdf_hash: str | None
    thumbnail_hash: str | None
    schema_hash: str | None
    pdf_uri: str | None
    thumbnail_uri: str | None
    qa_evidence_uri: str | None
    lease_owner: str | None
    lease_token: str | None
    fence_epoch: int
    lease_expires_at: float | None
    attempt_count: int
    retry_stage: Stage | None
    not_before: float
    last_error: str | None
    version: int
    created_at: float
    updated_at: float


@dataclass(frozen=True)
class WorkLease:
    catalog_id: str
    worker_id: str
    token: str
    fence_epoch: int
    claimed_stage: Stage
    expires_at: float
    attempt_count: int


@dataclass(frozen=True)
class Batch:
    batch_id: str
    target_count: int
    base_commit: str
    renderer_commit: str
    status: BatchStatus
    frozen_digest: str | None
    manifest: dict[str, Any] | None
    created_at: float
    frozen_at: float | None


@dataclass(frozen=True)
class Completion:
    item: WorkItem
    idempotent_replay: bool


@dataclass(frozen=True)
class FreezeResult:
    batch: Batch
    idempotent_replay: bool


class LedgerError(RuntimeError):
    """Base class for control-plane errors."""


class ConflictError(LedgerError):
    """The requested identity or state conflicts with existing ledger data."""


class InvalidTransitionError(LedgerError):
    """The item is not in the state required by an operation."""


class LeaseLostError(LedgerError):
    """The worker no longer owns the current, unexpired fenced lease."""


class IdempotencyConflictError(LedgerError):
    """An idempotency key was reused for a different operation or payload."""


class BatchFrozenError(LedgerError):
    """A caller attempted to mutate an immutable frozen batch."""


class FreezeValidationError(LedgerError):
    """A batch does not satisfy the requirements for an immutable freeze."""


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _sha256_json(value: Any) -> str:
    return hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


def _stage_value(stage: Stage | str) -> str:
    try:
        return Stage(stage).value
    except ValueError as exc:
        raise InvalidTransitionError(f"Unknown factory stage: {stage!r}") from exc


def _validate_nonempty(name: str, value: str) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        raise ValueError(f"{name} must not be empty")
    return normalized


def _validate_seconds(name: str, value: float) -> float:
    normalized = float(value)
    if normalized <= 0:
        raise ValueError(f"{name} must be greater than zero")
    return normalized


class CatalogFactoryLedger:
    """SQLite-backed work ledger with atomic claims and immutable batch freezes."""

    def __init__(
        self,
        database_path: str | Path,
        *,
        clock: Callable[[], float] = time.time,
        busy_timeout_seconds: float = 30.0,
    ) -> None:
        self.database_path = Path(database_path).expanduser().resolve()
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._clock = clock
        self._busy_timeout_ms = max(1, int(busy_timeout_seconds * 1000))
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(
            self.database_path,
            timeout=self._busy_timeout_ms / 1000,
            isolation_level=None,
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute(f"PRAGMA busy_timeout = {self._busy_timeout_ms}")
        return connection

    @contextmanager
    def _transaction(self) -> Iterator[sqlite3.Connection]:
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def _initialize(self) -> None:
        connection = self._connect()
        try:
            journal_mode = connection.execute("PRAGMA journal_mode = WAL").fetchone()[0]
            if str(journal_mode).lower() != "wal":
                raise LedgerError(
                    f"Catalog factory ledger requires SQLite WAL mode; got {journal_mode!r}"
                )
            connection.execute("PRAGMA synchronous = NORMAL")
            stage_values = ",".join(f"'{value}'" for value in ALL_STAGE_VALUES)
            claimed_values = ",".join(f"'{stage.value}'" for stage in CLAIMED_STAGES)
            batch_status_values = ",".join(
                f"'{value}'" for value in ALL_BATCH_STATUS_VALUES
            )
            connection.executescript(
                f"""
                CREATE TABLE IF NOT EXISTS catalog_factory_batches (
                    batch_id TEXT PRIMARY KEY,
                    target_count INTEGER NOT NULL CHECK (target_count > 0),
                    base_commit TEXT NOT NULL,
                    renderer_commit TEXT NOT NULL,
                    status TEXT NOT NULL CHECK (status IN ({batch_status_values})),
                    frozen_digest TEXT,
                    manifest_json TEXT,
                    created_at REAL NOT NULL,
                    frozen_at REAL,
                    CHECK (
                        (status = 'open' AND frozen_digest IS NULL
                            AND manifest_json IS NULL AND frozen_at IS NULL)
                        OR
                        (status = 'frozen' AND frozen_digest IS NOT NULL
                            AND manifest_json IS NOT NULL AND frozen_at IS NOT NULL)
                    )
                );

                CREATE TABLE IF NOT EXISTS catalog_factory_items (
                    catalog_id TEXT PRIMARY KEY,
                    section TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    slug TEXT NOT NULL,
                    ownership TEXT NOT NULL,
                    intent_fingerprint TEXT,
                    stage TEXT NOT NULL CHECK (stage IN ({stage_values})),
                    batch_id TEXT REFERENCES catalog_factory_batches(batch_id),
                    priority INTEGER NOT NULL DEFAULT 0,
                    payload_json TEXT NOT NULL DEFAULT '{{}}',
                    current_asset_hash TEXT,
                    spec_hash TEXT,
                    pdf_hash TEXT,
                    thumbnail_hash TEXT,
                    schema_hash TEXT,
                    pdf_uri TEXT,
                    thumbnail_uri TEXT,
                    qa_evidence_uri TEXT,
                    lease_owner TEXT,
                    lease_token TEXT,
                    fence_epoch INTEGER NOT NULL DEFAULT 0 CHECK (fence_epoch >= 0),
                    lease_expires_at REAL,
                    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
                    retry_stage TEXT CHECK (
                        retry_stage IS NULL OR retry_stage IN ({stage_values})
                    ),
                    not_before REAL NOT NULL DEFAULT 0,
                    last_error TEXT,
                    version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL,
                    UNIQUE (section, filename),
                    UNIQUE (slug),
                    CHECK (
                        (
                            stage IN ({claimed_values})
                            AND lease_owner IS NOT NULL
                            AND lease_token IS NOT NULL
                            AND lease_expires_at IS NOT NULL
                        )
                        OR
                        (
                            stage NOT IN ({claimed_values})
                            AND lease_owner IS NULL
                            AND lease_token IS NULL
                            AND lease_expires_at IS NULL
                        )
                    ),
                    CHECK (
                        (stage = 'retry_wait' AND retry_stage IS NOT NULL)
                        OR
                        (stage != 'retry_wait' AND retry_stage IS NULL)
                    )
                );

                CREATE UNIQUE INDEX IF NOT EXISTS
                    catalog_factory_items_intent_fingerprint_unique
                    ON catalog_factory_items(intent_fingerprint)
                    WHERE intent_fingerprint IS NOT NULL;

                CREATE INDEX IF NOT EXISTS catalog_factory_items_claim_queue
                    ON catalog_factory_items(stage, not_before, priority, created_at);

                CREATE INDEX IF NOT EXISTS catalog_factory_items_batch
                    ON catalog_factory_items(batch_id, catalog_id);

                CREATE TABLE IF NOT EXISTS catalog_factory_operations (
                    idempotency_key TEXT PRIMARY KEY,
                    action TEXT NOT NULL,
                    scope_id TEXT NOT NULL,
                    request_hash TEXT NOT NULL,
                    result_json TEXT NOT NULL,
                    created_at REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS catalog_factory_events (
                    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    catalog_id TEXT,
                    batch_id TEXT,
                    event_type TEXT NOT NULL,
                    actor TEXT,
                    fence_epoch INTEGER,
                    details_json TEXT NOT NULL,
                    created_at REAL NOT NULL
                );

                CREATE INDEX IF NOT EXISTS catalog_factory_events_item
                    ON catalog_factory_events(catalog_id, event_id);

                CREATE INDEX IF NOT EXISTS catalog_factory_events_batch
                    ON catalog_factory_events(batch_id, event_id);

                CREATE TRIGGER IF NOT EXISTS
                    catalog_factory_prevent_frozen_membership_update
                BEFORE UPDATE OF batch_id ON catalog_factory_items
                WHEN OLD.batch_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1
                        FROM catalog_factory_batches
                        WHERE batch_id = OLD.batch_id AND status = 'frozen'
                    )
                BEGIN
                    SELECT RAISE(ABORT, 'frozen batch membership is immutable');
                END;

                CREATE TRIGGER IF NOT EXISTS
                    catalog_factory_prevent_frozen_item_delete
                BEFORE DELETE ON catalog_factory_items
                WHEN OLD.batch_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1
                        FROM catalog_factory_batches
                        WHERE batch_id = OLD.batch_id AND status = 'frozen'
                    )
                BEGIN
                    SELECT RAISE(ABORT, 'frozen batch items cannot be deleted');
                END;

                CREATE TRIGGER IF NOT EXISTS
                    catalog_factory_prevent_frozen_artifact_update
                BEFORE UPDATE OF
                    section,
                    filename,
                    slug,
                    ownership,
                    intent_fingerprint,
                    payload_json,
                    current_asset_hash,
                    spec_hash,
                    pdf_hash,
                    thumbnail_hash,
                    schema_hash,
                    pdf_uri,
                    thumbnail_uri,
                    qa_evidence_uri
                ON catalog_factory_items
                WHEN OLD.batch_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1
                        FROM catalog_factory_batches
                        WHERE batch_id = OLD.batch_id AND status = 'frozen'
                    )
                BEGIN
                    SELECT RAISE(ABORT, 'frozen batch artifacts are immutable');
                END;

                CREATE TRIGGER IF NOT EXISTS
                    catalog_factory_prevent_frozen_batch_update
                BEFORE UPDATE OF
                    target_count,
                    base_commit,
                    renderer_commit,
                    status,
                    frozen_digest,
                    manifest_json,
                    frozen_at
                ON catalog_factory_batches
                WHEN OLD.status = 'frozen'
                BEGIN
                    SELECT RAISE(ABORT, 'frozen batch manifest is immutable');
                END;

                CREATE TRIGGER IF NOT EXISTS
                    catalog_factory_prevent_frozen_batch_delete
                BEFORE DELETE ON catalog_factory_batches
                WHEN OLD.status = 'frozen'
                BEGIN
                    SELECT RAISE(ABORT, 'frozen batch cannot be deleted');
                END;
                """
            )
        finally:
            connection.close()

    def journal_mode(self) -> str:
        connection = self._connect()
        try:
            return str(connection.execute("PRAGMA journal_mode").fetchone()[0]).lower()
        finally:
            connection.close()

    def _now(self) -> float:
        return float(self._clock())

    @staticmethod
    def _row_to_item(row: sqlite3.Row) -> WorkItem:
        retry_stage = Stage(row["retry_stage"]) if row["retry_stage"] else None
        return WorkItem(
            catalog_id=row["catalog_id"],
            section=row["section"],
            filename=row["filename"],
            slug=row["slug"],
            ownership=row["ownership"],
            intent_fingerprint=row["intent_fingerprint"],
            stage=Stage(row["stage"]),
            batch_id=row["batch_id"],
            priority=row["priority"],
            payload=json.loads(row["payload_json"]),
            current_asset_hash=row["current_asset_hash"],
            spec_hash=row["spec_hash"],
            pdf_hash=row["pdf_hash"],
            thumbnail_hash=row["thumbnail_hash"],
            schema_hash=row["schema_hash"],
            pdf_uri=row["pdf_uri"],
            thumbnail_uri=row["thumbnail_uri"],
            qa_evidence_uri=row["qa_evidence_uri"],
            lease_owner=row["lease_owner"],
            lease_token=row["lease_token"],
            fence_epoch=row["fence_epoch"],
            lease_expires_at=row["lease_expires_at"],
            attempt_count=row["attempt_count"],
            retry_stage=retry_stage,
            not_before=row["not_before"],
            last_error=row["last_error"],
            version=row["version"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    @staticmethod
    def _row_to_batch(row: sqlite3.Row) -> Batch:
        return Batch(
            batch_id=row["batch_id"],
            target_count=row["target_count"],
            base_commit=row["base_commit"],
            renderer_commit=row["renderer_commit"],
            status=BatchStatus(row["status"]),
            frozen_digest=row["frozen_digest"],
            manifest=json.loads(row["manifest_json"]) if row["manifest_json"] else None,
            created_at=row["created_at"],
            frozen_at=row["frozen_at"],
        )

    @staticmethod
    def _lease_from_item(item: WorkItem) -> WorkLease:
        if (
            item.lease_owner is None
            or item.lease_token is None
            or item.lease_expires_at is None
            or item.stage not in CLAIMED_STAGES
        ):
            raise LedgerError(f"Item {item.catalog_id} does not contain an active lease")
        return WorkLease(
            catalog_id=item.catalog_id,
            worker_id=item.lease_owner,
            token=item.lease_token,
            fence_epoch=item.fence_epoch,
            claimed_stage=item.stage,
            expires_at=item.lease_expires_at,
            attempt_count=item.attempt_count,
        )

    def _event(
        self,
        connection: sqlite3.Connection,
        *,
        event_type: str,
        catalog_id: str | None = None,
        batch_id: str | None = None,
        actor: str | None = None,
        fence_epoch: int | None = None,
        details: Mapping[str, Any] | None = None,
        now: float,
    ) -> None:
        connection.execute(
            """
            INSERT INTO catalog_factory_events (
                catalog_id,
                batch_id,
                event_type,
                actor,
                fence_epoch,
                details_json,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                catalog_id,
                batch_id,
                event_type,
                actor,
                fence_epoch,
                _canonical_json(dict(details or {})),
                now,
            ),
        )

    def _idempotency_replay(
        self,
        connection: sqlite3.Connection,
        *,
        idempotency_key: str | None,
        action: str,
        scope_id: str,
        request: Mapping[str, Any],
    ) -> Any:
        if not idempotency_key:
            return _IDEMPOTENCY_MISSING
        request_hash = _sha256_json(request)
        row = connection.execute(
            """
            SELECT action, scope_id, request_hash, result_json
            FROM catalog_factory_operations
            WHERE idempotency_key = ?
            """,
            (idempotency_key,),
        ).fetchone()
        if row is None:
            return _IDEMPOTENCY_MISSING
        if (
            row["action"] != action
            or row["scope_id"] != scope_id
            or row["request_hash"] != request_hash
        ):
            raise IdempotencyConflictError(
                f"Idempotency key {idempotency_key!r} was already used for "
                "a different request"
            )
        return json.loads(row["result_json"])

    def _save_idempotency(
        self,
        connection: sqlite3.Connection,
        *,
        idempotency_key: str | None,
        action: str,
        scope_id: str,
        request: Mapping[str, Any],
        result: Any,
        now: float,
    ) -> None:
        if not idempotency_key:
            return
        connection.execute(
            """
            INSERT INTO catalog_factory_operations (
                idempotency_key,
                action,
                scope_id,
                request_hash,
                result_json,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                idempotency_key,
                action,
                scope_id,
                _sha256_json(request),
                _canonical_json(result),
                now,
            ),
        )

    @staticmethod
    def _item_result(item: WorkItem) -> dict[str, Any]:
        payload = asdict(item)
        payload["stage"] = item.stage.value
        payload["retry_stage"] = item.retry_stage.value if item.retry_stage else None
        return payload

    @staticmethod
    def _item_from_result(payload: Mapping[str, Any]) -> WorkItem:
        values = dict(payload)
        values["stage"] = Stage(values["stage"])
        values["retry_stage"] = (
            Stage(values["retry_stage"]) if values.get("retry_stage") else None
        )
        return WorkItem(**values)

    @staticmethod
    def _batch_result(batch: Batch) -> dict[str, Any]:
        payload = asdict(batch)
        payload["status"] = batch.status.value
        return payload

    @staticmethod
    def _batch_from_result(payload: Mapping[str, Any]) -> Batch:
        values = dict(payload)
        values["status"] = BatchStatus(values["status"])
        return Batch(**values)

    def add_item(
        self,
        *,
        catalog_id: str,
        section: str,
        filename: str,
        slug: str,
        ownership: str = "first_party",
        intent_fingerprint: str | None = None,
        priority: int = 0,
        payload: Mapping[str, Any] | None = None,
        current_asset_hash: str | None = None,
        idempotency_key: str | None = None,
    ) -> WorkItem:
        """Add one stable catalog identity to the queue.

        Repeating an identical call for an existing ``catalog_id`` is safe even
        without an idempotency key. A changed identity fails closed so a worker
        cannot silently repurpose an indexed form URL.
        """

        catalog_id = _validate_nonempty("catalog_id", catalog_id)
        section = _validate_nonempty("section", section)
        filename = _validate_nonempty("filename", filename)
        slug = _validate_nonempty("slug", slug)
        ownership = _validate_nonempty("ownership", ownership)
        normalized_fingerprint = (
            _validate_nonempty("intent_fingerprint", intent_fingerprint)
            if intent_fingerprint is not None
            else None
        )
        normalized_payload = dict(payload or {})
        request = {
            "catalog_id": catalog_id,
            "section": section,
            "filename": filename,
            "slug": slug,
            "ownership": ownership,
            "intent_fingerprint": normalized_fingerprint,
            "priority": int(priority),
            "payload": normalized_payload,
            "current_asset_hash": current_asset_hash,
        }
        now = self._now()
        with self._transaction() as connection:
            replay = self._idempotency_replay(
                connection,
                idempotency_key=idempotency_key,
                action="add_item",
                scope_id=catalog_id,
                request=request,
            )
            if replay is not _IDEMPOTENCY_MISSING:
                return self._item_from_result(replay)

            existing_row = connection.execute(
                "SELECT * FROM catalog_factory_items WHERE catalog_id = ?",
                (catalog_id,),
            ).fetchone()
            if existing_row is not None:
                existing = self._row_to_item(existing_row)
                identity = {
                    "section": existing.section,
                    "filename": existing.filename,
                    "slug": existing.slug,
                    "ownership": existing.ownership,
                    "intent_fingerprint": existing.intent_fingerprint,
                    "priority": existing.priority,
                    "payload": existing.payload,
                    "current_asset_hash": existing.current_asset_hash,
                }
                if identity != {key: request[key] for key in identity}:
                    raise ConflictError(
                        f"Catalog item {catalog_id!r} already exists with different data"
                    )
                item = existing
            else:
                try:
                    connection.execute(
                        """
                        INSERT INTO catalog_factory_items (
                            catalog_id,
                            section,
                            filename,
                            slug,
                            ownership,
                            intent_fingerprint,
                            stage,
                            priority,
                            payload_json,
                            current_asset_hash,
                            not_before,
                            created_at,
                            updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            catalog_id,
                            section,
                            filename,
                            slug,
                            ownership,
                            normalized_fingerprint,
                            Stage.QUEUED.value,
                            int(priority),
                            _canonical_json(normalized_payload),
                            current_asset_hash,
                            now,
                            now,
                            now,
                        ),
                    )
                except sqlite3.IntegrityError as exc:
                    raise ConflictError(
                        "Catalog filename, slug, or intent fingerprint is already reserved"
                    ) from exc
                item = self._row_to_item(
                    connection.execute(
                        "SELECT * FROM catalog_factory_items WHERE catalog_id = ?",
                        (catalog_id,),
                    ).fetchone()
                )
                self._event(
                    connection,
                    event_type="item_added",
                    catalog_id=catalog_id,
                    details={
                        "section": section,
                        "filename": filename,
                        "slug": slug,
                        "ownership": ownership,
                    },
                    now=now,
                )

            result = self._item_result(item)
            self._save_idempotency(
                connection,
                idempotency_key=idempotency_key,
                action="add_item",
                scope_id=catalog_id,
                request=request,
                result=result,
                now=now,
            )
            return item

    def get_item(self, catalog_id: str) -> WorkItem | None:
        connection = self._connect()
        try:
            row = connection.execute(
                "SELECT * FROM catalog_factory_items WHERE catalog_id = ?",
                (catalog_id,),
            ).fetchone()
            return self._row_to_item(row) if row is not None else None
        finally:
            connection.close()

    def list_items(
        self,
        *,
        stage: Stage | str | None = None,
        batch_id: str | None = None,
    ) -> list[WorkItem]:
        clauses: list[str] = []
        values: list[Any] = []
        if stage is not None:
            clauses.append("stage = ?")
            values.append(_stage_value(stage))
        if batch_id is not None:
            clauses.append("batch_id = ?")
            values.append(batch_id)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        connection = self._connect()
        try:
            rows = connection.execute(
                f"""
                SELECT *
                FROM catalog_factory_items
                {where}
                ORDER BY priority DESC, created_at, catalog_id
                """,
                values,
            ).fetchall()
            return [self._row_to_item(row) for row in rows]
        finally:
            connection.close()

    def _release_due_retries(
        self,
        connection: sqlite3.Connection,
        *,
        now: float,
        actor: str,
    ) -> int:
        rows = connection.execute(
            """
            SELECT catalog_id, retry_stage, fence_epoch
            FROM catalog_factory_items
            WHERE stage = ? AND not_before <= ?
            ORDER BY catalog_id
            """,
            (Stage.RETRY_WAIT.value, now),
        ).fetchall()
        for row in rows:
            connection.execute(
                """
                UPDATE catalog_factory_items
                SET stage = ?,
                    retry_stage = NULL,
                    last_error = NULL,
                    version = version + 1,
                    updated_at = ?
                WHERE catalog_id = ? AND stage = ?
                """,
                (
                    row["retry_stage"],
                    now,
                    row["catalog_id"],
                    Stage.RETRY_WAIT.value,
                ),
            )
            self._event(
                connection,
                event_type="retry_released",
                catalog_id=row["catalog_id"],
                actor=actor,
                fence_epoch=row["fence_epoch"],
                details={"ready_stage": row["retry_stage"]},
                now=now,
            )
        return len(rows)

    def release_due_retries(self, *, actor: str = "retry_reaper") -> int:
        now = self._now()
        with self._transaction() as connection:
            return self._release_due_retries(connection, now=now, actor=actor)

    def _requeue_expired(
        self,
        connection: sqlite3.Connection,
        *,
        now: float,
        actor: str,
    ) -> int:
        claimed_values = tuple(stage.value for stage in CLAIMED_STAGES)
        placeholders = ",".join("?" for _ in claimed_values)
        rows = connection.execute(
            f"""
            SELECT catalog_id, stage, lease_owner, fence_epoch, batch_id
            FROM catalog_factory_items
            WHERE stage IN ({placeholders})
                AND lease_expires_at <= ?
            ORDER BY catalog_id
            """,
            (*claimed_values, now),
        ).fetchall()
        for row in rows:
            claimed_stage = Stage(row["stage"])
            ready_stage = LEASE_POLICIES[claimed_stage].ready
            connection.execute(
                """
                UPDATE catalog_factory_items
                SET stage = ?,
                    lease_owner = NULL,
                    lease_token = NULL,
                    lease_expires_at = NULL,
                    last_error = ?,
                    version = version + 1,
                    updated_at = ?
                WHERE catalog_id = ?
                    AND stage = ?
                    AND lease_expires_at <= ?
                """,
                (
                    ready_stage.value,
                    "lease expired before completion",
                    now,
                    row["catalog_id"],
                    claimed_stage.value,
                    now,
                ),
            )
            self._event(
                connection,
                event_type="lease_expired",
                catalog_id=row["catalog_id"],
                batch_id=row["batch_id"],
                actor=actor,
                fence_epoch=row["fence_epoch"],
                details={
                    "previous_owner": row["lease_owner"],
                    "claimed_stage": claimed_stage.value,
                    "requeued_stage": ready_stage.value,
                },
                now=now,
            )
        return len(rows)

    def requeue_expired(self, *, actor: str = "lease_reaper") -> int:
        now = self._now()
        with self._transaction() as connection:
            return self._requeue_expired(connection, now=now, actor=actor)

    def claim_next(
        self,
        *,
        worker_id: str,
        claimed_stage: Stage | str,
        lease_seconds: float = 900,
        batch_id: str | None = None,
        catalog_id: str | None = None,
        idempotency_key: str | None = None,
    ) -> WorkLease | None:
        """Atomically claim the highest-priority eligible item.

        Selection is O(log n) for the stage queue because the schema indexes the
        stage, retry time, priority, and creation time. Expired leases and due
        retries are repaired in the same write transaction before selection.
        """

        worker_id = _validate_nonempty("worker_id", worker_id)
        claimed = Stage(_stage_value(claimed_stage))
        policy = LEASE_POLICIES.get(claimed)
        if policy is None:
            raise InvalidTransitionError(
                f"Stage {claimed.value!r} cannot be used to claim work"
            )
        lease_seconds = _validate_seconds("lease_seconds", lease_seconds)
        normalized_catalog_id = (
            _validate_nonempty("catalog_id", catalog_id)
            if catalog_id is not None
            else None
        )
        scope_id = (
            f"{batch_id or '*'}:{normalized_catalog_id or '*'}:"
            f"{claimed.value}:{worker_id}"
        )
        request = {
            "worker_id": worker_id,
            "claimed_stage": claimed.value,
            "lease_seconds": lease_seconds,
            "batch_id": batch_id,
            "catalog_id": normalized_catalog_id,
        }
        now = self._now()
        with self._transaction() as connection:
            replay = self._idempotency_replay(
                connection,
                idempotency_key=idempotency_key,
                action="claim_next",
                scope_id=scope_id,
                request=request,
            )
            if replay is not _IDEMPOTENCY_MISSING:
                return WorkLease(
                    catalog_id=replay["catalog_id"],
                    worker_id=replay["worker_id"],
                    token=replay["token"],
                    fence_epoch=replay["fence_epoch"],
                    claimed_stage=Stage(replay["claimed_stage"]),
                    expires_at=replay["expires_at"],
                    attempt_count=replay["attempt_count"],
                ) if replay else None

            self._release_due_retries(connection, now=now, actor="claim_reaper")
            self._requeue_expired(connection, now=now, actor="claim_reaper")

            clauses = [
                "stage = ?",
                "not_before <= ?",
                "lease_token IS NULL",
            ]
            values: list[Any] = [policy.ready.value, now]
            if batch_id is not None:
                clauses.append("batch_id = ?")
                values.append(batch_id)
            if normalized_catalog_id is not None:
                clauses.append("catalog_id = ?")
                values.append(normalized_catalog_id)
            row = connection.execute(
                f"""
                SELECT catalog_id
                FROM catalog_factory_items
                WHERE {' AND '.join(clauses)}
                ORDER BY priority DESC, created_at, catalog_id
                LIMIT 1
                """,
                values,
            ).fetchone()
            if row is None:
                self._save_idempotency(
                    connection,
                    idempotency_key=idempotency_key,
                    action="claim_next",
                    scope_id=scope_id,
                    request=request,
                    result=None,
                    now=now,
                )
                return None

            token = secrets.token_urlsafe(24)
            expires_at = now + lease_seconds
            cursor = connection.execute(
                """
                UPDATE catalog_factory_items
                SET stage = ?,
                    lease_owner = ?,
                    lease_token = ?,
                    fence_epoch = fence_epoch + 1,
                    lease_expires_at = ?,
                    attempt_count = attempt_count + 1,
                    last_error = NULL,
                    version = version + 1,
                    updated_at = ?
                WHERE catalog_id = ?
                    AND stage = ?
                    AND lease_token IS NULL
                """,
                (
                    claimed.value,
                    worker_id,
                    token,
                    expires_at,
                    now,
                    row["catalog_id"],
                    policy.ready.value,
                ),
            )
            if cursor.rowcount != 1:
                raise ConflictError("Eligible work changed during claim transaction")
            item = self._row_to_item(
                connection.execute(
                    "SELECT * FROM catalog_factory_items WHERE catalog_id = ?",
                    (row["catalog_id"],),
                ).fetchone()
            )
            lease = self._lease_from_item(item)
            self._event(
                connection,
                event_type="lease_claimed",
                catalog_id=item.catalog_id,
                batch_id=item.batch_id,
                actor=worker_id,
                fence_epoch=item.fence_epoch,
                details={
                    "claimed_stage": claimed.value,
                    "expires_at": expires_at,
                    "attempt_count": item.attempt_count,
                },
                now=now,
            )
            result = {
                "catalog_id": lease.catalog_id,
                "worker_id": lease.worker_id,
                "token": lease.token,
                "fence_epoch": lease.fence_epoch,
                "claimed_stage": lease.claimed_stage.value,
                "expires_at": lease.expires_at,
                "attempt_count": lease.attempt_count,
            }
            self._save_idempotency(
                connection,
                idempotency_key=idempotency_key,
                action="claim_next",
                scope_id=scope_id,
                request=request,
                result=result,
                now=now,
            )
            return lease

    def _assert_lease(
        self,
        connection: sqlite3.Connection,
        lease: WorkLease,
        *,
        now: float,
    ) -> WorkItem:
        row = connection.execute(
            "SELECT * FROM catalog_factory_items WHERE catalog_id = ?",
            (lease.catalog_id,),
        ).fetchone()
        if row is None:
            raise LeaseLostError(f"Catalog item {lease.catalog_id!r} no longer exists")
        item = self._row_to_item(row)
        if (
            item.stage != lease.claimed_stage
            or item.lease_owner != lease.worker_id
            or item.lease_token != lease.token
            or item.fence_epoch != lease.fence_epoch
            or item.lease_expires_at is None
            or item.lease_expires_at <= now
        ):
            raise LeaseLostError(
                f"Worker no longer owns the active fenced lease for "
                f"{lease.catalog_id!r}"
            )
        return item

    def heartbeat(
        self,
        lease: WorkLease,
        *,
        lease_seconds: float = 900,
    ) -> WorkLease:
        lease_seconds = _validate_seconds("lease_seconds", lease_seconds)
        now = self._now()
        with self._transaction() as connection:
            item = self._assert_lease(connection, lease, now=now)
            expires_at = now + lease_seconds
            cursor = connection.execute(
                """
                UPDATE catalog_factory_items
                SET lease_expires_at = ?,
                    version = version + 1,
                    updated_at = ?
                WHERE catalog_id = ?
                    AND stage = ?
                    AND lease_owner = ?
                    AND lease_token = ?
                    AND fence_epoch = ?
                    AND lease_expires_at > ?
                """,
                (
                    expires_at,
                    now,
                    item.catalog_id,
                    lease.claimed_stage.value,
                    lease.worker_id,
                    lease.token,
                    lease.fence_epoch,
                    now,
                ),
            )
            if cursor.rowcount != 1:
                raise LeaseLostError(
                    f"Lease for {lease.catalog_id!r} expired during heartbeat"
                )
            self._event(
                connection,
                event_type="lease_heartbeat",
                catalog_id=item.catalog_id,
                batch_id=item.batch_id,
                actor=lease.worker_id,
                fence_epoch=lease.fence_epoch,
                details={"expires_at": expires_at},
                now=now,
            )
            return WorkLease(
                catalog_id=lease.catalog_id,
                worker_id=lease.worker_id,
                token=lease.token,
                fence_epoch=lease.fence_epoch,
                claimed_stage=lease.claimed_stage,
                expires_at=expires_at,
                attempt_count=lease.attempt_count,
            )

    def complete_lease(
        self,
        lease: WorkLease,
        *,
        idempotency_key: str,
        artifact_updates: Mapping[str, str | None] | None = None,
    ) -> Completion:
        """Publish a lease result once and advance to its completed stage."""

        idempotency_key = _validate_nonempty("idempotency_key", idempotency_key)
        policy = LEASE_POLICIES.get(lease.claimed_stage)
        if policy is None:
            raise InvalidTransitionError(
                f"Stage {lease.claimed_stage.value!r} has no completion policy"
            )
        updates = dict(artifact_updates or {})
        unexpected = set(updates) - ARTIFACT_UPDATE_FIELDS
        if unexpected:
            raise ValueError(
                f"Unsupported artifact update field(s): {', '.join(sorted(unexpected))}"
            )
        request = {
            "catalog_id": lease.catalog_id,
            "worker_id": lease.worker_id,
            "fence_epoch": lease.fence_epoch,
            "claimed_stage": lease.claimed_stage.value,
            "artifact_updates": updates,
        }
        now = self._now()
        with self._transaction() as connection:
            replay = self._idempotency_replay(
                connection,
                idempotency_key=idempotency_key,
                action="complete_lease",
                scope_id=lease.catalog_id,
                request=request,
            )
            if replay is not _IDEMPOTENCY_MISSING:
                return Completion(
                    item=self._item_from_result(replay),
                    idempotent_replay=True,
                )

            item = self._assert_lease(connection, lease, now=now)
            if updates and item.batch_id is not None:
                batch_status = connection.execute(
                    """
                    SELECT status
                    FROM catalog_factory_batches
                    WHERE batch_id = ?
                    """,
                    (item.batch_id,),
                ).fetchone()
                if (
                    batch_status is not None
                    and BatchStatus(batch_status["status"]) is BatchStatus.FROZEN
                ):
                    raise BatchFrozenError(
                        f"Candidate artifacts for frozen batch {item.batch_id!r} "
                        "cannot be changed"
                    )
            set_parts = [
                "stage = ?",
                "lease_owner = NULL",
                "lease_token = NULL",
                "lease_expires_at = NULL",
                "last_error = NULL",
                "version = version + 1",
                "updated_at = ?",
            ]
            values: list[Any] = [policy.completed.value, now]
            for field_name in sorted(updates):
                set_parts.append(f"{field_name} = ?")
                values.append(updates[field_name])
            values.extend(
                [
                    lease.catalog_id,
                    lease.claimed_stage.value,
                    lease.worker_id,
                    lease.token,
                    lease.fence_epoch,
                    now,
                ]
            )
            cursor = connection.execute(
                f"""
                UPDATE catalog_factory_items
                SET {', '.join(set_parts)}
                WHERE catalog_id = ?
                    AND stage = ?
                    AND lease_owner = ?
                    AND lease_token = ?
                    AND fence_epoch = ?
                    AND lease_expires_at > ?
                """,
                values,
            )
            if cursor.rowcount != 1:
                raise LeaseLostError(
                    f"Lease for {lease.catalog_id!r} was lost during completion"
                )
            completed = self._row_to_item(
                connection.execute(
                    "SELECT * FROM catalog_factory_items WHERE catalog_id = ?",
                    (lease.catalog_id,),
                ).fetchone()
            )
            self._event(
                connection,
                event_type="lease_completed",
                catalog_id=completed.catalog_id,
                batch_id=completed.batch_id,
                actor=lease.worker_id,
                fence_epoch=lease.fence_epoch,
                details={
                    "claimed_stage": lease.claimed_stage.value,
                    "completed_stage": completed.stage.value,
                    "artifact_fields": sorted(updates),
                },
                now=now,
            )
            result = self._item_result(completed)
            self._save_idempotency(
                connection,
                idempotency_key=idempotency_key,
                action="complete_lease",
                scope_id=lease.catalog_id,
                request=request,
                result=result,
                now=now,
            )
            return Completion(item=completed, idempotent_replay=False)

    def fail_lease(
        self,
        lease: WorkLease,
        *,
        error: str,
        retryable: bool,
        retry_delay_seconds: float = 0,
        idempotency_key: str,
    ) -> Completion:
        """Release a failed lease to retry-wait or permanently blocked state."""

        error = _validate_nonempty("error", error)
        idempotency_key = _validate_nonempty("idempotency_key", idempotency_key)
        retry_delay_seconds = max(0.0, float(retry_delay_seconds))
        policy = LEASE_POLICIES.get(lease.claimed_stage)
        if policy is None:
            raise InvalidTransitionError(
                f"Stage {lease.claimed_stage.value!r} has no failure policy"
            )
        request = {
            "catalog_id": lease.catalog_id,
            "worker_id": lease.worker_id,
            "fence_epoch": lease.fence_epoch,
            "claimed_stage": lease.claimed_stage.value,
            "error": error,
            "retryable": bool(retryable),
            "retry_delay_seconds": retry_delay_seconds,
        }
        now = self._now()
        with self._transaction() as connection:
            replay = self._idempotency_replay(
                connection,
                idempotency_key=idempotency_key,
                action="fail_lease",
                scope_id=lease.catalog_id,
                request=request,
            )
            if replay is not _IDEMPOTENCY_MISSING:
                return Completion(
                    item=self._item_from_result(replay),
                    idempotent_replay=True,
                )
            item = self._assert_lease(connection, lease, now=now)
            next_stage = Stage.RETRY_WAIT if retryable else Stage.BLOCKED
            retry_stage = policy.ready.value if retryable else None
            not_before = now + retry_delay_seconds if retryable else now
            cursor = connection.execute(
                """
                UPDATE catalog_factory_items
                SET stage = ?,
                    retry_stage = ?,
                    not_before = ?,
                    last_error = ?,
                    lease_owner = NULL,
                    lease_token = NULL,
                    lease_expires_at = NULL,
                    version = version + 1,
                    updated_at = ?
                WHERE catalog_id = ?
                    AND stage = ?
                    AND lease_owner = ?
                    AND lease_token = ?
                    AND fence_epoch = ?
                    AND lease_expires_at > ?
                """,
                (
                    next_stage.value,
                    retry_stage,
                    not_before,
                    error,
                    now,
                    lease.catalog_id,
                    lease.claimed_stage.value,
                    lease.worker_id,
                    lease.token,
                    lease.fence_epoch,
                    now,
                ),
            )
            if cursor.rowcount != 1:
                raise LeaseLostError(
                    f"Lease for {lease.catalog_id!r} was lost during failure update"
                )
            failed = self._row_to_item(
                connection.execute(
                    "SELECT * FROM catalog_factory_items WHERE catalog_id = ?",
                    (lease.catalog_id,),
                ).fetchone()
            )
            self._event(
                connection,
                event_type="lease_failed",
                catalog_id=failed.catalog_id,
                batch_id=failed.batch_id,
                actor=lease.worker_id,
                fence_epoch=lease.fence_epoch,
                details={
                    "claimed_stage": lease.claimed_stage.value,
                    "next_stage": failed.stage.value,
                    "retry_stage": retry_stage,
                    "not_before": not_before,
                    "error": error,
                },
                now=now,
            )
            result = self._item_result(failed)
            self._save_idempotency(
                connection,
                idempotency_key=idempotency_key,
                action="fail_lease",
                scope_id=lease.catalog_id,
                request=request,
                result=result,
                now=now,
            )
            return Completion(item=failed, idempotent_replay=False)

    def create_batch(
        self,
        *,
        batch_id: str,
        target_count: int,
        base_commit: str,
        renderer_commit: str,
        idempotency_key: str | None = None,
    ) -> Batch:
        batch_id = _validate_nonempty("batch_id", batch_id)
        base_commit = _validate_nonempty("base_commit", base_commit)
        renderer_commit = _validate_nonempty("renderer_commit", renderer_commit)
        target_count = int(target_count)
        if target_count <= 0:
            raise ValueError("target_count must be greater than zero")
        request = {
            "batch_id": batch_id,
            "target_count": target_count,
            "base_commit": base_commit,
            "renderer_commit": renderer_commit,
        }
        now = self._now()
        with self._transaction() as connection:
            replay = self._idempotency_replay(
                connection,
                idempotency_key=idempotency_key,
                action="create_batch",
                scope_id=batch_id,
                request=request,
            )
            if replay is not _IDEMPOTENCY_MISSING:
                return self._batch_from_result(replay)
            row = connection.execute(
                "SELECT * FROM catalog_factory_batches WHERE batch_id = ?",
                (batch_id,),
            ).fetchone()
            if row is not None:
                batch = self._row_to_batch(row)
                if (
                    batch.target_count != target_count
                    or batch.base_commit != base_commit
                    or batch.renderer_commit != renderer_commit
                ):
                    raise ConflictError(
                        f"Batch {batch_id!r} already exists with different settings"
                    )
            else:
                connection.execute(
                    """
                    INSERT INTO catalog_factory_batches (
                        batch_id,
                        target_count,
                        base_commit,
                        renderer_commit,
                        status,
                        created_at
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        batch_id,
                        target_count,
                        base_commit,
                        renderer_commit,
                        BatchStatus.OPEN.value,
                        now,
                    ),
                )
                batch = self._row_to_batch(
                    connection.execute(
                        "SELECT * FROM catalog_factory_batches WHERE batch_id = ?",
                        (batch_id,),
                    ).fetchone()
                )
                self._event(
                    connection,
                    event_type="batch_created",
                    batch_id=batch_id,
                    details={
                        "target_count": target_count,
                        "base_commit": base_commit,
                        "renderer_commit": renderer_commit,
                    },
                    now=now,
                )
            result = self._batch_result(batch)
            self._save_idempotency(
                connection,
                idempotency_key=idempotency_key,
                action="create_batch",
                scope_id=batch_id,
                request=request,
                result=result,
                now=now,
            )
            return batch

    def get_batch(self, batch_id: str) -> Batch | None:
        connection = self._connect()
        try:
            row = connection.execute(
                "SELECT * FROM catalog_factory_batches WHERE batch_id = ?",
                (batch_id,),
            ).fetchone()
            return self._row_to_batch(row) if row is not None else None
        finally:
            connection.close()

    def assign_to_batch(
        self,
        *,
        batch_id: str,
        catalog_ids: Sequence[str],
        idempotency_key: str | None = None,
    ) -> list[WorkItem]:
        """Assign stable item identities to an open batch atomically."""

        batch_id = _validate_nonempty("batch_id", batch_id)
        normalized_ids = [_validate_nonempty("catalog_id", value) for value in catalog_ids]
        if len(normalized_ids) != len(set(normalized_ids)):
            raise ValueError("catalog_ids contains duplicates")
        sorted_ids = sorted(normalized_ids)
        request = {"batch_id": batch_id, "catalog_ids": sorted_ids}
        now = self._now()
        with self._transaction() as connection:
            replay = self._idempotency_replay(
                connection,
                idempotency_key=idempotency_key,
                action="assign_to_batch",
                scope_id=batch_id,
                request=request,
            )
            if replay is not _IDEMPOTENCY_MISSING:
                return [self._item_from_result(item) for item in replay]
            batch_row = connection.execute(
                "SELECT * FROM catalog_factory_batches WHERE batch_id = ?",
                (batch_id,),
            ).fetchone()
            if batch_row is None:
                raise ConflictError(f"Unknown batch {batch_id!r}")
            batch = self._row_to_batch(batch_row)
            if batch.status is BatchStatus.FROZEN:
                raise BatchFrozenError(f"Batch {batch_id!r} is already frozen")
            existing_count = connection.execute(
                """
                SELECT COUNT(*)
                FROM catalog_factory_items
                WHERE batch_id = ?
                    AND catalog_id NOT IN (
                        SELECT value FROM json_each(?)
                    )
                """,
                (batch_id, _canonical_json(sorted_ids)),
            ).fetchone()[0]
            if existing_count + len(sorted_ids) > batch.target_count:
                raise ConflictError(
                    f"Assignment would exceed batch target count {batch.target_count}"
                )

            assigned: list[WorkItem] = []
            for catalog_id in sorted_ids:
                row = connection.execute(
                    "SELECT * FROM catalog_factory_items WHERE catalog_id = ?",
                    (catalog_id,),
                ).fetchone()
                if row is None:
                    raise ConflictError(f"Unknown catalog item {catalog_id!r}")
                item = self._row_to_item(row)
                if item.ownership != "first_party":
                    raise ConflictError(
                        f"Only first-party items may enter replacement batches: "
                        f"{catalog_id!r}"
                    )
                if item.batch_id not in (None, batch_id):
                    raise ConflictError(
                        f"Catalog item {catalog_id!r} already belongs to "
                        f"batch {item.batch_id!r}"
                    )
                if item.stage in {
                    Stage.BATCH_FROZEN,
                    Stage.UPLOAD_CLAIMED,
                    Stage.STAGING_UPLOADED,
                    Stage.CANARY_CLAIMED,
                    Stage.CANARY_LIVE,
                    Stage.RELEASE_CLAIMED,
                    Stage.LIVE,
                    Stage.SUPERSEDED,
                    Stage.RETIRED,
                }:
                    raise ConflictError(
                        f"Catalog item {catalog_id!r} cannot be assigned from "
                        f"stage {item.stage.value!r}"
                    )
                if item.batch_id is None:
                    connection.execute(
                        """
                        UPDATE catalog_factory_items
                        SET batch_id = ?,
                            version = version + 1,
                            updated_at = ?
                        WHERE catalog_id = ? AND batch_id IS NULL
                        """,
                        (batch_id, now, catalog_id),
                    )
                    self._event(
                        connection,
                        event_type="batch_item_assigned",
                        catalog_id=catalog_id,
                        batch_id=batch_id,
                        details={},
                        now=now,
                    )
                assigned.append(
                    self._row_to_item(
                        connection.execute(
                            "SELECT * FROM catalog_factory_items WHERE catalog_id = ?",
                            (catalog_id,),
                        ).fetchone()
                    )
                )
            result = [self._item_result(item) for item in assigned]
            self._save_idempotency(
                connection,
                idempotency_key=idempotency_key,
                action="assign_to_batch",
                scope_id=batch_id,
                request=request,
                result=result,
                now=now,
            )
            return assigned

    def remove_from_batch(
        self,
        *,
        batch_id: str,
        catalog_ids: Sequence[str],
    ) -> int:
        batch_id = _validate_nonempty("batch_id", batch_id)
        normalized_ids = sorted(
            {_validate_nonempty("catalog_id", value) for value in catalog_ids}
        )
        if not normalized_ids:
            return 0
        now = self._now()
        with self._transaction() as connection:
            row = connection.execute(
                "SELECT status FROM catalog_factory_batches WHERE batch_id = ?",
                (batch_id,),
            ).fetchone()
            if row is None:
                raise ConflictError(f"Unknown batch {batch_id!r}")
            if BatchStatus(row["status"]) is BatchStatus.FROZEN:
                raise BatchFrozenError(f"Batch {batch_id!r} is frozen")
            placeholders = ",".join("?" for _ in normalized_ids)
            leased_count = connection.execute(
                f"""
                SELECT COUNT(*)
                FROM catalog_factory_items
                WHERE batch_id = ?
                    AND catalog_id IN ({placeholders})
                    AND lease_token IS NOT NULL
                """,
                (batch_id, *normalized_ids),
            ).fetchone()[0]
            if leased_count:
                raise ConflictError("Cannot remove actively leased batch items")
            cursor = connection.execute(
                f"""
                UPDATE catalog_factory_items
                SET batch_id = NULL,
                    version = version + 1,
                    updated_at = ?
                WHERE batch_id = ?
                    AND catalog_id IN ({placeholders})
                """,
                (now, batch_id, *normalized_ids),
            )
            for catalog_id in normalized_ids:
                self._event(
                    connection,
                    event_type="batch_item_removed",
                    catalog_id=catalog_id,
                    batch_id=batch_id,
                    details={},
                    now=now,
                )
            return cursor.rowcount

    def freeze_batch(
        self,
        *,
        batch_id: str,
        idempotency_key: str,
    ) -> FreezeResult:
        """Freeze exactly the target count of approved, fully hashed items."""

        batch_id = _validate_nonempty("batch_id", batch_id)
        idempotency_key = _validate_nonempty("idempotency_key", idempotency_key)
        request = {"batch_id": batch_id}
        now = self._now()
        with self._transaction() as connection:
            replay = self._idempotency_replay(
                connection,
                idempotency_key=idempotency_key,
                action="freeze_batch",
                scope_id=batch_id,
                request=request,
            )
            if replay is not _IDEMPOTENCY_MISSING:
                return FreezeResult(
                    batch=self._batch_from_result(replay),
                    idempotent_replay=True,
                )
            row = connection.execute(
                "SELECT * FROM catalog_factory_batches WHERE batch_id = ?",
                (batch_id,),
            ).fetchone()
            if row is None:
                raise ConflictError(f"Unknown batch {batch_id!r}")
            batch = self._row_to_batch(row)
            if batch.status is BatchStatus.FROZEN:
                raise BatchFrozenError(
                    f"Batch {batch_id!r} is frozen under a different operation"
                )
            item_rows = connection.execute(
                """
                SELECT *
                FROM catalog_factory_items
                WHERE batch_id = ?
                ORDER BY catalog_id
                """,
                (batch_id,),
            ).fetchall()
            items = [self._row_to_item(item_row) for item_row in item_rows]
            errors: list[str] = []
            if len(items) != batch.target_count:
                errors.append(
                    f"expected exactly {batch.target_count} items, found {len(items)}"
                )
            for item in items:
                if item.ownership != "first_party":
                    errors.append(f"{item.catalog_id}: ownership is not first_party")
                if item.stage is not Stage.REVIEW_APPROVED:
                    errors.append(
                        f"{item.catalog_id}: stage is {item.stage.value}, "
                        f"expected {Stage.REVIEW_APPROVED.value}"
                    )
                for field_name in FREEZE_REQUIRED_FIELDS:
                    if not getattr(item, field_name):
                        errors.append(f"{item.catalog_id}: missing {field_name}")
            if errors:
                preview = "; ".join(errors[:20])
                if len(errors) > 20:
                    preview += f"; ... {len(errors) - 20} more"
                raise FreezeValidationError(
                    f"Batch {batch_id!r} cannot freeze: {preview}"
                )

            manifest = {
                "schema_version": 1,
                "batch_id": batch.batch_id,
                "target_count": batch.target_count,
                "base_commit": batch.base_commit,
                "renderer_commit": batch.renderer_commit,
                "items": [
                    {
                        "catalog_id": item.catalog_id,
                        "section": item.section,
                        "filename": item.filename,
                        "slug": item.slug,
                        "ownership": item.ownership,
                        "intent_fingerprint": item.intent_fingerprint,
                        "current_asset_hash": item.current_asset_hash,
                        "spec_hash": item.spec_hash,
                        "pdf_hash": item.pdf_hash,
                        "thumbnail_hash": item.thumbnail_hash,
                        "schema_hash": item.schema_hash,
                        "pdf_uri": item.pdf_uri,
                        "thumbnail_uri": item.thumbnail_uri,
                        "qa_evidence_uri": item.qa_evidence_uri,
                    }
                    for item in items
                ],
            }
            digest = _sha256_json(manifest)
            connection.execute(
                """
                UPDATE catalog_factory_batches
                SET status = ?,
                    frozen_digest = ?,
                    manifest_json = ?,
                    frozen_at = ?
                WHERE batch_id = ? AND status = ?
                """,
                (
                    BatchStatus.FROZEN.value,
                    digest,
                    _canonical_json(manifest),
                    now,
                    batch_id,
                    BatchStatus.OPEN.value,
                ),
            )
            connection.execute(
                """
                UPDATE catalog_factory_items
                SET stage = ?,
                    version = version + 1,
                    updated_at = ?
                WHERE batch_id = ? AND stage = ?
                """,
                (
                    Stage.BATCH_FROZEN.value,
                    now,
                    batch_id,
                    Stage.REVIEW_APPROVED.value,
                ),
            )
            frozen = self._row_to_batch(
                connection.execute(
                    "SELECT * FROM catalog_factory_batches WHERE batch_id = ?",
                    (batch_id,),
                ).fetchone()
            )
            self._event(
                connection,
                event_type="batch_frozen",
                batch_id=batch_id,
                actor="batch_freezer",
                details={"digest": digest, "item_count": len(items)},
                now=now,
            )
            result = self._batch_result(frozen)
            self._save_idempotency(
                connection,
                idempotency_key=idempotency_key,
                action="freeze_batch",
                scope_id=batch_id,
                request=request,
                result=result,
                now=now,
            )
            return FreezeResult(batch=frozen, idempotent_replay=False)

    def list_events(
        self,
        *,
        catalog_id: str | None = None,
        batch_id: str | None = None,
    ) -> list[dict[str, Any]]:
        clauses: list[str] = []
        values: list[Any] = []
        if catalog_id is not None:
            clauses.append("catalog_id = ?")
            values.append(catalog_id)
        if batch_id is not None:
            clauses.append("batch_id = ?")
            values.append(batch_id)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        connection = self._connect()
        try:
            rows = connection.execute(
                f"""
                SELECT *
                FROM catalog_factory_events
                {where}
                ORDER BY event_id
                """,
                values,
            ).fetchall()
            return [
                {
                    "event_id": row["event_id"],
                    "catalog_id": row["catalog_id"],
                    "batch_id": row["batch_id"],
                    "event_type": row["event_type"],
                    "actor": row["actor"],
                    "fence_epoch": row["fence_epoch"],
                    "details": json.loads(row["details_json"]),
                    "created_at": row["created_at"],
                }
                for row in rows
            ]
        finally:
            connection.close()


__all__ = [
    "Batch",
    "BatchFrozenError",
    "BatchStatus",
    "CatalogFactoryLedger",
    "Completion",
    "ConflictError",
    "FreezeResult",
    "FreezeValidationError",
    "IdempotencyConflictError",
    "InvalidTransitionError",
    "LedgerError",
    "LeaseLostError",
    "Stage",
    "WorkItem",
    "WorkLease",
]
