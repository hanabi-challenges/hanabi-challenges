#!/usr/bin/env python3
"""
sim_league.py — Simulate a complete session_ladder (League) event end-to-end.

Drives real API endpoints against any environment (local or production).
All created data is tagged to a sim_run_id and cleaned up automatically on
completion or error.

Flow per session:
    1. Start session
    2. Sim users mark presence as "playing"
    3. Create ROUNDS_PER_SESSION empty rounds
    4. For each round:
         a. assign-next-round (pairs players into teams based on ELO)
         b. Submit score for each team via sim endpoint (bypasses replay gate)
         c. Finalize round (computes ELO deltas)
    5. Close session

Prerequisites:
    pip install requests

Usage:
    python3 scripts/sim/sim_league.py

    BASE_URL=https://api.example.com \\
    ADMIN_USERNAME=myname \\
    ADMIN_PASSWORD=mypass \\
    SIM_TOKEN=abc123 \\
    python3 scripts/sim/sim_league.py
"""

import os
import random
import string
import sys
import time
import requests

# ---------------------------------------------------------------------------
# Configuration — edit or override via environment variables
# ---------------------------------------------------------------------------

BASE_URL       = os.environ.get("BASE_URL", "http://localhost:3001")
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "password")

# Sim API token — generate once (superadmin only):
#   POST /api/sim/tokens  { "label": "my-sim-token" }  →  save `token`.
SIM_TOKEN = os.environ.get("SIM_TOKEN", "REPLACE_ME")

# ---- Event definition -------------------------------------------------------

SUFFIX = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))

EVENT_NAME       = f"Sim League {SUFFIX}"
EVENT_SLUG       = f"sim-league-{SUFFIX}"
EVENT_SHORT_DESC = "Simulated league event (ephemeral)"
EVENT_LONG_DESC  = (
    "Fully simulated session_ladder event created by sim_league.py. "
    "All users and results are synthetic and deleted at end of run."
)

# ---- Player pool ------------------------------------------------------------

# Number of sim players. Must be divisible by TEAM_SIZE so every player is
# assigned to a team each round. Minimum: TEAM_SIZE * 2.
PLAYER_COUNT = 6

# ---- Session ladder config --------------------------------------------------

# "fixed"   — every round uses teams of exactly TEAM_SIZE players.
# "variable" — players choose their team size each session.
TEAM_SIZE_MODE = "fixed"

# Players per team per round. Ignored when TEAM_SIZE_MODE = "variable".
TEAM_SIZE = 2

# Number of sessions to run. Each session is a full event night.
SESSION_COUNT = 3

# Rounds within each session (each round = one cooperative game played by all teams).
ROUNDS_PER_SESSION = 2

# Days between auto-generated sessions (used by generate-sessions; not enforced in sim).
INTERVAL_DAYS = 7

# ELO configuration.
K_FACTOR           = 32    # Standard ELO K-factor; higher = faster rating changes.
PARTICIPATION_BONUS = 0    # Flat ELO bonus just for showing up.

# Optional: supply a random_seed_salt so the system generates consistent seeds
# for each round variant. Leave None to omit.
RANDOM_SEED_SALT = None

# Variant used for all sim rounds. Leave None to let the event default apply.
ROUND_VARIANT = None   # e.g. "No Variant", "Rainbow (6 Suits)"

# Scores drawn uniformly at random for each team per round.
SCORE_MIN = 14
SCORE_MAX = 25

# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

_session = requests.Session()
_session.headers["Content-Type"] = "application/json"


def _raise(r: requests.Response, label: str) -> dict:
    if not r.ok:
        raise RuntimeError(f"{label} → {r.status_code}: {r.text}")
    return r.json() if r.content else {}


def api(method: str, path: str, body: dict | None = None, extra_headers: dict | None = None) -> dict:
    headers = dict(extra_headers or {})
    r = _session.request(method, f"{BASE_URL}{path}", json=body, headers=headers, timeout=20)
    return _raise(r, f"{method} {path}")


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def sim_hdrs() -> dict:
    return {"X-Sim-Token": SIM_TOKEN}


def step(title: str) -> None:
    print(f"\n[{title}]")


def log(msg: str) -> None:
    print(f"  {msg}")


# ---------------------------------------------------------------------------
# Simulation steps
# ---------------------------------------------------------------------------

def admin_login() -> str:
    step("Admin login")
    data = api("POST", "/api/login", {"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD})
    user = data["user"]
    log(f"Logged in as {user['display_name']} (role={user['role']})")
    if user["role"] not in ("admin", "superadmin"):
        raise RuntimeError(
            f"User {user['display_name']} is not an admin — event creation requires admin role"
        )
    return data["token"]


def create_sim_run() -> int:
    step("Creating sim run")
    data = api("POST", "/api/sim/runs", {"label": f"league-{SUFFIX}"}, sim_hdrs())
    log(f"run_id={data['id']}")
    return data["id"]


def create_sim_users(run_id: int) -> list:
    """Create PLAYER_COUNT ephemeral sim players. Returns list of { user, token }."""
    step(f"Creating {PLAYER_COUNT} sim players")
    users = []
    for i in range(PLAYER_COUNT):
        name = f"p{SUFFIX}{i + 1}"
        pw   = "".join(random.choices(string.ascii_letters + string.digits, k=16))
        data = api("POST", "/api/sim/users",
                   {"display_name": name, "password": pw, "sim_run_id": run_id},
                   sim_hdrs())
        users.append(data)
    log(f"Players: {[u['user']['display_name'] for u in users]}")
    return users


def create_event(admin_token: str) -> dict:
    step("Creating event")
    event = api("POST", "/api/events", {
        "name":                    EVENT_NAME,
        "slug":                    EVENT_SLUG,
        "short_description":       EVENT_SHORT_DESC,
        "long_description":        EVENT_LONG_DESC,
        "event_format":            "session_ladder",
        "event_status":            "LIVE",
        "published":               True,
        "allow_late_registration": True,
    }, bearer(admin_token))
    log(f"id={event['id']}  slug={event['slug']}  status={event['event_status']}")
    return event


def configure_ladder(admin_token: str) -> None:
    step("Configuring session ladder")
    config_body = {
        "team_size_mode":      TEAM_SIZE_MODE,
        "k_factor":            K_FACTOR,
        "participation_bonus": PARTICIPATION_BONUS,
        "rounds_per_session":  ROUNDS_PER_SESSION,
    }
    if TEAM_SIZE_MODE == "fixed":
        config_body["team_size"] = TEAM_SIZE
    if RANDOM_SEED_SALT is not None:
        config_body["random_seed_salt"] = RANDOM_SEED_SALT

    api("POST", f"/api/session-ladder/events/{EVENT_SLUG}/config",
        config_body, bearer(admin_token))
    log(f"team_size_mode={TEAM_SIZE_MODE}  team_size={TEAM_SIZE}  "
        f"k_factor={K_FACTOR}  rounds_per_session={ROUNDS_PER_SESSION}")


def generate_sessions(admin_token: str) -> list:
    step(f"Generating {SESSION_COUNT} sessions")
    data = api("POST", f"/api/session-ladder/events/{EVENT_SLUG}/sessions/generate", {
        "session_count":     SESSION_COUNT,
        "interval_days":     INTERVAL_DAYS,
        "rounds_per_session": ROUNDS_PER_SESSION,
    }, bearer(admin_token))
    sessions = data.get("sessions", [])
    for s in sessions:
        log(f"  session id={s['id']}  status={s.get('status', '?')}")
    return sessions


def run_session(session: dict, sim_users: list, admin_token: str) -> None:
    session_id = session["id"]
    step(f"Session {session_id}")

    # Start the session.
    api("POST", f"/api/session-ladder/sessions/{session_id}/start", {}, bearer(admin_token))
    log("Session started")

    # All players mark themselves as online and playing.
    for u in sim_users:
        api("POST", f"/api/session-ladder/sessions/{session_id}/presence", {
            "role":  "playing",
            "state": "online",
        }, bearer(u["token"]))
    log(f"  {len(sim_users)} players marked as playing")

    # Create empty round slots upfront so we know their IDs.
    round_ids = []
    for r_idx in range(ROUNDS_PER_SESSION):
        round_def = {"variant": ROUND_VARIANT} if ROUND_VARIANT else {}
        round_row = api("POST", f"/api/session-ladder/sessions/{session_id}/rounds",
                        round_def, bearer(admin_token))
        round_ids.append(round_row["id"])
        log(f"  Round slot created: id={round_row['id']}")

    # Process each round: assign teams → submit scores → finalize.
    for r_idx, round_id in enumerate(round_ids):
        log(f"\n  --- Round {r_idx + 1} / {ROUNDS_PER_SESSION} (id={round_id}) ---")

        # Assign players to teams for this round.
        # override_missing_scores=true handles players with no prior ELO.
        assign_result = api(
            "POST", f"/api/session-ladder/sessions/{session_id}/assign-next-round",
            {"override_missing_scores": True},
            bearer(admin_token),
        )
        if assign_result.get("blocked"):
            reason = assign_result.get("reason", "unknown")
            raise RuntimeError(f"assign-next-round blocked: {reason}")
        log(f"  Teams assigned")

        # Determine number of teams in this round.
        # With TEAM_SIZE_MODE=fixed and all players present, teams_per_round = PLAYER_COUNT // TEAM_SIZE.
        teams_per_round = PLAYER_COUNT // TEAM_SIZE

        # Submit a score for each team via the sim endpoint (bypasses replay validation).
        submitter_id = sim_users[0]["user"]["id"]
        for team_no in range(1, teams_per_round + 1):
            score = random.randint(SCORE_MIN, SCORE_MAX)
            api("POST", f"/api/sim/session-ladder/rounds/{round_id}/submit-score", {
                "team_no":             team_no,
                "score":               score,
                "submitted_by_user_id": submitter_id,
            }, sim_hdrs())
            log(f"    team_no={team_no}  score={score}")

        # Finalize: compute ELO deltas for this round.
        finalize_result = api(
            "POST", f"/api/session-ladder/rounds/{round_id}/finalize",
            {}, bearer(admin_token),
        )
        log(f"  Round finalized: {finalize_result}")

    # Close the session once all rounds are done.
    close_result = api(
        "POST", f"/api/session-ladder/sessions/{session_id}/close",
        {}, bearer(admin_token),
    )
    log(f"Session closed: {close_result.get('status', close_result)}")


def end_event(admin_token: str) -> None:
    step("Ending event")
    api("POST", f"/api/session-ladder/events/{EVENT_SLUG}/end", {}, bearer(admin_token))
    log("Event status → COMPLETE")


# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

def cleanup(admin_token: str | None, run_id: int | None) -> None:
    """Delete the event then GC sim users. Errors are warnings, not failures."""
    if admin_token:
        step("Cleanup — deleting event")
        try:
            r = _session.delete(f"{BASE_URL}/api/events/{EVENT_SLUG}",
                                headers=bearer(admin_token), timeout=20)
            if r.ok:
                log("Event deleted")
            else:
                print(f"  WARNING: Event delete returned {r.status_code}: {r.text}",
                      file=sys.stderr)
        except Exception as e:
            print(f"  WARNING: Event delete failed: {e}", file=sys.stderr)

    if run_id is not None:
        step("Cleanup — GC sim run (users)")
        try:
            r = _session.delete(f"{BASE_URL}/api/sim/runs/{run_id}",
                                headers=sim_hdrs(), timeout=20)
            if r.ok:
                d = r.json().get("deleted", {})
                log(f"Deleted: events={d.get('events', 0)}  users={d.get('users', 0)}")
            else:
                print(f"  WARNING: GC returned {r.status_code}: {r.text}", file=sys.stderr)
        except Exception as e:
            print(f"  WARNING: GC failed: {e}", file=sys.stderr)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate_config() -> None:
    if SIM_TOKEN == "REPLACE_ME":
        sys.exit("ERROR: Set SIM_TOKEN to a valid sim API token (or export SIM_TOKEN=...).")

    if PLAYER_COUNT < TEAM_SIZE * 2:
        sys.exit(
            f"ERROR: PLAYER_COUNT ({PLAYER_COUNT}) must be at least TEAM_SIZE * 2 "
            f"({TEAM_SIZE * 2}) so there are at least 2 teams per round."
        )

    if PLAYER_COUNT % TEAM_SIZE != 0:
        sys.exit(
            f"ERROR: PLAYER_COUNT ({PLAYER_COUNT}) must be divisible by TEAM_SIZE ({TEAM_SIZE}) "
            f"so all players can be assigned to complete teams."
        )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    validate_config()

    run_id      = None
    admin_token = None
    event_ok    = False

    try:
        admin_token = admin_login()
        run_id      = create_sim_run()
        sim_users   = create_sim_users(run_id)
        _           = create_event(admin_token)
        event_ok    = True
        configure_ladder(admin_token)
        sessions = generate_sessions(admin_token)

        for session in sessions:
            run_session(session, sim_users, admin_token)

        end_event(admin_token)

        step("Simulation complete")
        log(f"Event:    {EVENT_SLUG}")
        log(f"Sessions: {len(sessions)}")
        log(f"Rounds:   {len(sessions) * ROUNDS_PER_SESSION}")
        log(f"Players:  {PLAYER_COUNT}")

    except Exception as e:
        print(f"\nERROR: {e}", file=sys.stderr)
        sys.exit(1)

    finally:
        cleanup(admin_token if event_ok else None, run_id)


if __name__ == "__main__":
    main()
