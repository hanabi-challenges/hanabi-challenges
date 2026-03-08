#!/usr/bin/env python3
"""
sim_challenge.py — Simulate a complete Challenge event end-to-end.

Drives real API endpoints against any environment (local or production).
All created data is tagged to a sim_run_id and cleaned up automatically on
completion or error.

Prerequisites:
    pip install requests

Usage:
    python3 scripts/sim/sim_challenge.py

    # Against a remote server:
    BASE_URL=https://api.example.com \\
    ADMIN_USERNAME=myname \\
    ADMIN_PASSWORD=mypass \\
    SIM_TOKEN=abc123 \\
    python3 scripts/sim/sim_challenge.py

    # Generate a sim token first (as superadmin via the admin UI or curl):
    #   POST /api/sim/tokens  { "label": "local-sim" }
"""

import os
import random
import string
import sys
import requests

# ---------------------------------------------------------------------------
# Configuration — edit or override via environment variables
# ---------------------------------------------------------------------------

BASE_URL       = os.environ.get("BASE_URL", "http://localhost:3001")
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "password")

# Sim API token — generate once (superadmin only) and reuse.
# POST /api/sim/tokens  { "label": "my-sim-token" }  →  save the returned `token`.
SIM_TOKEN = os.environ.get("SIM_TOKEN", "REPLACE_ME")

# ---- Event definition -------------------------------------------------------

# Unique suffix prevents slug/name collisions across concurrent runs.
SUFFIX = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))

EVENT_NAME       = f"Sim Challenge {SUFFIX}"
EVENT_SLUG       = f"sim-challenge-{SUFFIX}"
EVENT_SHORT_DESC = "Simulated challenge event (ephemeral)"
EVENT_LONG_DESC  = (
    "Fully simulated challenge event created by sim_challenge.py. "
    "All users, teams, and results are synthetic and deleted at end of run."
)

# Stages: define one or more stages, each with its own list of games.
# Each game needs a `variant` string (as it appears in the DB) and an optional
# `seed_payload` (the seed suffix, e.g. "AbCdEf") — use None to leave unspecified.
STAGES = [
    {
        "label":      "Main Stage",
        "stage_type": "main",
        "games": [
            {"variant": "No Variant",        "seed_payload": None},
            {"variant": "No Variant",        "seed_payload": None},
            {"variant": "Rainbow (6 Suits)", "seed_payload": None},
        ],
    },
    # Uncomment to add a second stage:
    # {
    #     "label":      "Tiebreaker",
    #     "stage_type": "tiebreaker",
    #     "games": [
    #         {"variant": "No Variant", "seed_payload": None},
    #     ],
    # },
]

# Teams: list of { team_size, count } groups.
# count teams will be created at each team_size.
# Total sim users = sum(team_size * count).
TEAMS = [
    {"team_size": 2, "count": 4},
    {"team_size": 3, "count": 2},
]

# Scores drawn uniformly at random from [SCORE_MIN, SCORE_MAX].
SCORE_MIN = 15
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
        raise RuntimeError(f"User {user['display_name']} is not an admin — challenge event creation requires admin role")
    return data["token"]


def create_sim_run() -> int:
    step("Creating sim run")
    data = api("POST", "/api/sim/runs", {"label": f"challenge-{SUFFIX}"}, sim_hdrs())
    log(f"run_id={data['id']}")
    return data["id"]


def create_sim_users(run_id: int, count: int) -> list:
    """Create `count` ephemeral sim users. Returns list of { user, token }."""
    step(f"Creating {count} sim users")
    users = []
    for i in range(count):
        name = f"s{SUFFIX}{i + 1}"
        pw   = "".join(random.choices(string.ascii_letters + string.digits, k=16))
        data = api("POST", "/api/sim/users",
                   {"display_name": name, "password": pw, "sim_run_id": run_id},
                   sim_hdrs())
        users.append(data)
    log(f"Created: {[u['user']['display_name'] for u in users]}")
    return users


def create_event(admin_token: str) -> dict:
    step("Creating event")
    event = api("POST", "/api/events", {
        "name":                    EVENT_NAME,
        "slug":                    EVENT_SLUG,
        "short_description":       EVENT_SHORT_DESC,
        "long_description":        EVENT_LONG_DESC,
        "event_format":            "challenge",
        "event_status":            "LIVE",
        "published":               True,
        "allow_late_registration": True,
    }, bearer(admin_token))
    log(f"id={event['id']}  slug={event['slug']}  status={event['event_status']}")
    return event


def create_stages_and_templates(admin_token: str) -> list:
    """Create all configured stages and game templates. Returns flat list of template rows."""
    step("Creating stages and game templates")
    all_templates = []
    for si, stage_def in enumerate(STAGES):
        stage = api("POST", f"/api/events/{EVENT_SLUG}/stages", {
            "stage_index": si,
            "label":       stage_def["label"],
            "stage_type":  stage_def["stage_type"],
        }, bearer(admin_token))
        log(f"Stage {si}: id={stage['event_stage_id']}  label={stage['label']}")

        for ti, game in enumerate(stage_def["games"]):
            tmpl = api("POST", f"/api/events/{EVENT_SLUG}/game-templates", {
                "event_stage_id": stage["event_stage_id"],
                "template_index": ti,
                "variant":        game["variant"],
                "seed_payload":   game.get("seed_payload"),
            }, bearer(admin_token))
            all_templates.append(tmpl)
            log(f"  Template {ti}: id={tmpl['id']}  variant={tmpl['variant']}")

    return all_templates


def register_teams(sim_users: list) -> list:
    """Register teams using sim user tokens. Returns list of { team, users }."""
    step("Registering teams")
    registered = []
    cursor = 0
    for group in TEAMS:
        size  = group["team_size"]
        count = group["count"]
        for i in range(count):
            team_users = sim_users[cursor: cursor + size]
            cursor += size
            if len(team_users) < size:
                raise RuntimeError(
                    f"Not enough sim users for {size}p team #{i + 1} — "
                    f"need {size}, have {len(team_users)}"
                )
            captain   = team_users[0]
            team_name = f"T{SUFFIX}{size}p{i + 1}"
            result = api("POST", f"/api/events/{EVENT_SLUG}/register", {
                "team_name": team_name,
                "team_size": size,
                "members": [{"user_id": u["user"]["id"], "role": "PLAYER"} for u in team_users],
            }, bearer(captain["token"]))
            registered.append({"team": result["team"], "users": team_users})
            log(f"  {team_name} (id={result['team']['id']}, {size}p)")
    return registered


def submit_results(registered_teams: list, all_templates: list) -> None:
    step("Submitting results")
    for team_info in registered_teams:
        team = team_info["team"]
        for tmpl in all_templates:
            score = random.randint(SCORE_MIN, SCORE_MAX)
            api("POST", "/api/sim/results", {
                "event_team_id":           team["id"],
                "event_game_template_id":  tmpl["id"],
                "score":                   score,
            }, sim_hdrs())
        log(f"  {team['name']}: {len(all_templates)} result(s) submitted")


def complete_event(admin_token: str) -> None:
    step("Marking event COMPLETE")
    api("PUT", f"/api/events/{EVENT_SLUG}", {"event_status": "COMPLETE"}, bearer(admin_token))
    log("event_status → COMPLETE")


# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

def cleanup(admin_token: str | None, run_id: int | None) -> None:
    """Delete the event (cascades teams/results) then GC sim users."""
    if admin_token:
        step("Cleanup — deleting event")
        try:
            _session.delete(f"{BASE_URL}/api/events/{EVENT_SLUG}",
                            headers=bearer(admin_token), timeout=20)
            log("Event deleted")
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
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    if SIM_TOKEN == "REPLACE_ME":
        sys.exit("ERROR: Set SIM_TOKEN to a valid sim API token (or export SIM_TOKEN=...).")

    total_users = sum(g["team_size"] * g["count"] for g in TEAMS)

    run_id      = None
    admin_token = None
    event_ok    = False

    try:
        admin_token   = admin_login()
        run_id        = create_sim_run()
        sim_users     = create_sim_users(run_id, total_users)
        _             = create_event(admin_token)
        event_ok      = True
        all_templates = create_stages_and_templates(admin_token)
        registered    = register_teams(sim_users)
        submit_results(registered, all_templates)
        complete_event(admin_token)

        total_results = len(registered) * len(all_templates)
        step("Simulation complete")
        log(f"Event:   {EVENT_SLUG}")
        log(f"Teams:   {len(registered)}")
        log(f"Results: {total_results}")

    except Exception as e:
        print(f"\nERROR: {e}", file=sys.stderr)
        sys.exit(1)

    finally:
        cleanup(admin_token if event_ok else None, run_id)


if __name__ == "__main__":
    main()
