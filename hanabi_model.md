# Hanabi Competition Platform — Conceptual Model Reference

_Version 1.0_

---

## Table of Contents

1. [Introduction](#introduction)
2. [Concept Glossary](#concept-glossary)
3. [Axes of Control](#axes-of-control)
   - 3.1 [Structural Hierarchy](#31-structural-hierarchy)
   - 3.2 [Attempt Modifier](#32-attempt-modifier)
   - 3.3 [Scoring Units](#33-scoring-units)
   - 3.4 [Aggregation Functions](#34-aggregation-functions)
   - 3.5 [Time Windows](#35-time-windows)
   - 3.6 [Capture Policies](#36-capture-policies)
   - 3.7 [Registration](#37-registration)
   - 3.8 [Event Dimensions](#38-event-dimensions)
   - 3.9 [Validity Rules](#39-validity-rules)
   - 3.10 [Visibility Policy](#310-visibility-policy)
   - 3.11 [Matchmaking](#311-matchmaking)
   - 3.12 [Seed Patterns](#312-seed-patterns)
   - 3.13 [Awards](#313-awards)
4. [Event Walkthroughs](#event-walkthroughs)
   - 4.1 [No Variant Challenge](#41-no-variant-challenge-nvc)
   - 4.2 [Mix Gauntlet](#42-mix-gauntlet)
   - 4.3 [Boom and Bloom](#43-boom-and-bloom)
5. [Implementation Proposal](#implementation-proposal)
   - 5.1 [Data Layer](#51-data-layer)
   - 5.2 [Result Computation](#52-result-computation)
   - 5.3 [Seed Pattern Engine](#53-seed-pattern-engine)
   - 5.4 [Inference Sufficiency Checker](#54-inference-sufficiency-checker)
   - 5.5 [Configuration Interface](#55-configuration-interface)
   - 5.6 [hanab-live Integration](#56-hanab-live-integration)

---

## Introduction

This document describes the conceptual model for a Hanabi competition platform — a system for organizing, running, and scoring competitive Hanabi events of any format or complexity. The model is designed around a small number of orthogonal concepts that compose freely, so that any event format can be expressed as a combination of configuration choices rather than as a special case.

The central insight of the model is that archetypes should not be first-class concepts. A Gauntlet, a League, a Mixer, a head-to-head tournament — none of these are defined in the model. Instead, they emerge naturally from the intersection of configurable dimensions: how games are grouped, how scores are aggregated, how attempts work, how participants are assembled, and when results are captured. If the model is correctly specified, any format expressible as a combination of these dimensions is automatically supported, and new formats can be introduced without changing the model.

The model is organized around a fixed four-layer structural hierarchy: events contain sections, sections contain game slots, and game slots contain games. This hierarchy is stable and does not change regardless of event format. What varies is the configuration attached to each layer — the aggregation functions, time windows, scoring unit types, attempt modifiers, and other policy settings that determine how each layer behaves.

Alongside the structural hierarchy, a set of orthogonal policies can be attached at any layer: time windows, capture policies, registration policies, visibility policies, and matchmaking configurations. These policies do not belong to any particular layer — they attach wherever they are relevant and inherit downward unless overridden at a more specific layer.

Game results are not stored in event-specific tables. The platform maintains a single global game database that records every game ever played. Event results are queries against that database, filtered and aggregated by each event's configuration. This means event rules can be corrected retroactively, results update automatically, and there is no synchronization problem between captured games and event standings.

Spoilage — the condition in which a player has been exposed to a game's content and can no longer play it for competitive credit — is a global, permanent fact keyed on a `(user, game spec)` pair. Since game specs are never reused across events, spoilage requires no scoping logic: if you have seen a game spec, you are spoiled for it everywhere, forever. The seed generation system is designed to make accidental spoilage mechanically implausible.

The platform is integrated with [hanab.live](https://hanab.live), the primary online Hanabi platform. Games are either scraped from hanab.live automatically or submitted manually, depending on event configuration. User identity in the platform is directly tied to hanab.live identity. Users who register on this site will use a hanab.live-issued token to validate their identity and ensure perfect parity between profiles across the platforms.

---

## Concept Glossary

The following terms have precise meanings in this model. Some are counterintuitive or diverge from common usage. This glossary should be read before the axes of control section.

| Term                      | Definition                                                                                                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Event**                 | The top-level container for a competition. Owns configuration shared across all its sections. An event may run in parallel across multiple dimension instances (e.g. by player count).                                                     |
| **Section**               | A named grouping of game slots within an event. Owns its scoring unit type, aggregation function, and advancement criteria. Every event has at least one section. The terminal section produces the canonical ranking.                     |
| **Game slot**             | A position within a section. Owns a game spec (or a per-unit override), an assignment trigger, and an aggregation function over attempts. A slot is the unit of play from the event's perspective.                                         |
| **Game**                  | An atomic fact: a specific play of a game spec by a set of participants at a point in time, producing a result. Games are never deleted; they are filtered by event rules at query time.                                                   |
| **Game spec**             | The full specification of a game's content: `p{player count}v{variant}s{seed string}`. Uniquely identifies a deal. Never reused across events.                                                                                             |
| **Attempt**               | A repeatability modifier that can be applied to any layer. When a layer has attempt enabled, a scoring unit can traverse that layer multiple times. Each attempt has its own seed via the attempt coordinate in the seed pattern.          |
| **Scoring unit**          | The entity that accumulates score and appears on leaderboards. Can be an individual or a team. Declared per section. In mixed events, resolved post-capture from participation pattern.                                                    |
| **Roster**                | The full set of players associated with a scoring unit. Always present, even for fixed teams. Versioned to support approved changes over time.                                                                                             |
| **Lineup**                | The specific subset of roster members who play a particular game. Enables pool teams and substitutions. A fixed team's lineup always equals its roster.                                                                                    |
| **Validity**              | A post-hoc predicate evaluated against a captured game in the context of a specific event's rules. A game can be captured but invalid. Spoilage is recorded regardless of validity.                                                        |
| **Eligibility**           | A computed gate over a scoring unit for a specific game slot. True only when all constituent conditions hold: registered, unspoiled, within time window, and advancement-qualified.                                                        |
| **Spoilage**              | A permanent global fact: `(user, game spec) → spoiled`. Recorded when a user plays or is exposed to a game spec. Since specs are never reused, no scoping is needed.                                                                       |
| **Inference sufficiency** | A computable property of an event's configuration. True when the system can unambiguously determine every scoring unit's identity, game attributions, and leaderboard from game data alone, without explicit registration.                 |
| **Canonical ranking**     | The single authoritative leaderboard for an event, produced by the terminal section. Non-participants are assigned positions via carry-through from prior section rankings.                                                                |
| **Constituent view**      | Any ranking or display derived from a subset of event data — per section, per week, per variant, etc. Read-only projections with no mechanical role.                                                                                       |
| **Stage label**           | A human-readable UI label applied to one or more sections for display purposes. Has no mechanical role in the model.                                                                                                                       |
| **Capture policy**        | The method by which game results enter the platform. Scraping pulls games from hanab-live automatically; submission requires manual entry. Policies can be combined or made sequential.                                                    |
| **Registration policy**   | The method by which scoring units are enrolled in an event. Implicit registration infers enrollment from play. Explicit registration requires a declaration. Implicit is the default; explicit is required when inference is insufficient. |
| **Aggregation function**  | A pluggable function that combines results at a layer boundary. Can be absolute (operates on one unit's results) or relational (operates on all units' results simultaneously). Sum, best-of, ELO, and head-to-head record are examples.   |
| **Assignment trigger**    | The condition under which a game spec is assigned to a slot. Eager assignment happens at configuration time. Lazy assignment happens at play time, triggered by prior slot completion, a participant action, or an admin action.           |
| **Session mode**          | An event configuration combining real-time time windows, forced matchmaking, and submission-based capture. Produces event formats like the Mixer without requiring a named archetype in the model.                                         |

---

## Axes of Control

This section catalogs every configurable concept in the model. Each entry describes what the concept is, what values it can take, what it interacts with, and any special constraints or callouts. Entries are grouped by category.

### 3.1 Structural Hierarchy

The structural hierarchy is fixed and does not vary by event format. Configuration is attached to layers, not embedded in them.

#### Event

| Property            | Description                                            | Values / Notes                                  |
| ------------------- | ------------------------------------------------------ | ----------------------------------------------- |
| Name                | Human-readable event name                              | Free text                                       |
| Slug                | URL-safe identifier, shared across dimension instances | Alphanumeric + hyphens                          |
| Dimensions          | Axes along which parallel instances run                | See [Event Dimensions](#38-event-dimensions)    |
| Registration policy | Default registration mode for the event                | Implicit / explicit / both / sequential         |
| Capture policy      | Default game capture mode                              | Scrape / submit / both / sequential             |
| Visibility policy   | Default result visibility rules                        | See [Visibility Policy](#310-visibility-policy) |
| Time window         | Default time bounds for the event                      | See [Time Windows](#35-time-windows)            |

> **Inheritance:** Policies declared at the event level are inherited by all sections and slots unless overridden at a more specific layer.

---

#### Section

| Property               | Description                                         | Values / Notes                                                    |
| ---------------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| Name                   | Human-readable label                                | Free text; used as stage label in UI                              |
| Scoring unit type      | What gets ranked in this section                    | Individual / team / resolved (mixed events)                       |
| Aggregation function   | How slot results combine into section score         | Pluggable; see [Aggregation Functions](#34-aggregation-functions) |
| Advancement criteria   | How scoring units exit this section                 | Top N / conditional / manual / none                               |
| Attempt modifier       | Whether the full section is repeatable              | Enabled / disabled; requires attempt ID in seed                   |
| Terminal               | Whether this section produces the canonical ranking | Boolean; defaults to last section in sequence                     |
| Conditional activation | Predicate that triggers this section                | Expression over upstream section output; null = always active     |
| Matchmaking config     | How operational units are assembled on entry        | None / forced (with algorithm) / support                          |
| Time window            | Override of event-level time window                 | See [Time Windows](#35-time-windows)                              |
| Capture policy         | Override of event-level capture policy              | See [Capture Policies](#36-capture-policies)                      |
| Registration policy    | Override of event-level registration policy         | See [Registration](#37-registration)                              |
| Visibility policy      | Override of event-level visibility policy           | See [Visibility Policy](#310-visibility-policy)                   |

> **Terminal section:** Every event has at least one section. A simple event with no explicit sections has one implicit section that the UI does not surface. The terminal section is the preeminent section — its output is the event's canonical ranking. It is always the last section in sequence by default. Parallel sections of equal standing are not supported; one must be designated terminal.

---

#### Game Slot

| Property                    | Description                                       | Values / Notes                                                          |
| --------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------- |
| Slot index                  | Position within the section                       | Integer; locally scoped to event + section                              |
| Game spec                   | Default game spec for this slot                   | Admin-configured seed pattern; see [Seed Patterns](#312-seed-patterns)  |
| Per-unit game spec override | Replacement spec for a specific scoring unit      | Keyed on (slot, scoring unit); used for seed substitutions              |
| Assignment trigger          | When the spec is assigned                         | Eager (at config time) / lazy (on completion, action, or admin trigger) |
| Attempt modifier            | Whether this slot is individually repeatable      | Enabled / disabled; requires attempt ID in seed                         |
| Aggregation function        | How attempts combine into slot score              | Pluggable; see [Aggregation Functions](#34-aggregation-functions)       |
| Reference score             | Maximum or expected score for boolean aggregation | Integer; optional                                                       |
| Missing score default       | Score assigned when no valid game is captured     | Integer; default 0                                                      |
| Time window                 | Override of section-level time window             | See [Time Windows](#35-time-windows)                                    |
| Validity rules              | Predicates a game must satisfy to count           | See [Validity Rules](#39-validity-rules)                                |

---

#### Game

Games are atomic facts recorded in the global game database. They are never modified or deleted. Event results are computed by querying the game database with event-specific validity rules and aggregation functions.

| Property     | Description                                                        |
| ------------ | ------------------------------------------------------------------ |
| Participants | The specific players who played, keyed to platform user identities |
| Game spec    | The full `p{n}v{variant}s{seed}` specification played              |
| Result       | The score achieved                                                 |
| Timestamp    | When the game was played                                           |
| Source       | Scraped or submitted                                               |
| Tags         | hanab-live game tags; used for enrichment and validity filtering   |

---

### 3.2 Attempt Modifier

The attempt modifier is not a layer in the hierarchy — it is a repeatability configuration that can be applied to any layer. When enabled on a layer, a scoring unit can traverse that layer multiple times. Each traversal is an attempt and receives its own seed via the attempt coordinate in the seed pattern.

| Configuration        | Description                                                                       |
| -------------------- | --------------------------------------------------------------------------------- |
| Attempt count        | Maximum number of attempts allowed. Unlimited if unset.                           |
| Aggregation function | How multiple attempt results combine: best, latest, first, sum, best N of M, etc. |
| Scope                | Which layer the modifier applies to: event, section, or slot.                     |

> **Enforcement:** If attempt modifier is enabled at any layer, the attempt ID must appear in the seed pattern for all specs generated within that layer. This is a configuration-time validation error if missing.

---

### 3.3 Scoring Units

A scoring unit is the entity that accumulates score and appears on leaderboards. The type of scoring unit is declared per section, allowing it to change between sections of the same event. The terminal section's scoring unit type is the event's canonical scoring unit.

| Type       | Description                                                                                                                                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Individual | A single platform user. Registration creates or enrolls a user as a scoring unit.                                                                                                                                                 |
| Team       | A fixed or pool group of users. Has a roster (full eligible membership) and a per-game lineup.                                                                                                                                    |
| Resolved   | Used in mixed events. Unit type is determined post-capture by analyzing participation patterns. A user who plays exclusively with the same partner is scored as a team; a user who mixes compositions is scored as an individual. |

#### Roster and Lineup

Every scoring unit of type team has a roster — the full set of eligible players. The lineup is the subset of roster members who play a specific game. For fixed teams, roster and lineup are always identical. For pool teams, the lineup varies per game.

| Concept        | Description                                                                                                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Roster         | Full eligible membership. Always explicitly declared when pool teams are allowed. Versioned: roster changes are timestamped and approved. Team identity persists through roster changes. |
| Lineup         | Per-game subset of the roster. Declared before or at the time of play. Handles substitutions uniformly — a substitution is a lineup change, not a roster change.                         |
| Roster version | Timestamped record of roster state. Used by validity queries to determine which composition was active for any given game.                                                               |

---

### 3.4 Aggregation Functions

Aggregation functions are pluggable and live at every layer boundary in the hierarchy. They reduce child results into a score for the parent layer. There is no fixed set — the model supports any function that can be evaluated against the available result data.

| Function            | Shape      | Notes                                                                                                                     |
| ------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| Sum                 | Absolute   | Sum of all child results                                                                                                  |
| Best of N           | Absolute   | Highest N results from M children                                                                                         |
| Drop lowest K       | Absolute   | Sum after removing K lowest results                                                                                       |
| First               | Absolute   | Only the first result counts                                                                                              |
| Latest              | Absolute   | Only the most recent result counts                                                                                        |
| Boolean max         | Absolute   | 1 if result equals reference score, else 0. Requires reference score on slot.                                             |
| Count of max        | Absolute   | Count of slots where boolean max = 1                                                                                      |
| Head-to-head record | Relational | Win/loss/draw record against other units in the same section                                                              |
| ELO                 | Relational | Rating update based on results compared to opponents. Stateful; operates on section result set after attempt aggregation. |
| Custom              | Either     | Admin-defined function; must be registered and validated before use                                                       |

> **Relational functions:** Relational aggregation functions operate on the full result set for a section, not just one unit's results. They require all units' results to be available before any unit's standing can be computed.

---

### 3.5 Time Windows

Time windows are policies that attach at any layer and control when play is valid. Multiple window types are supported and can be applied independently.

| Type           | Description                                                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Not before X   | Play is invalid before a specific timestamp                                                                                                                                       |
| Not after Y    | Play is invalid after a specific timestamp                                                                                                                                        |
| Bounded [X, Y] | Play is valid only between two timestamps                                                                                                                                         |
| Real-time      | Play is valid only during an active session window opened by an admin. No fixed schedule. Typically short-lived. Associated with submission-based capture and forced matchmaking. |

> **Timestamp evaluation:** Time window validity is evaluated against the game's timestamp, not the scrape time. A game scraped after the window closes but played during it is valid.

> **Conflict rule:** A slot cannot have two conflicting time window types simultaneously. The configuration is considered malformed and is rejected at save time.

---

### 3.6 Capture Policies

Capture policies determine how game results enter the platform. They can be set at the event level and overridden at the section or slot level.

| Mode            | Description                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Scrape only     | Games are pulled automatically from hanab-live based on matching game specs within the time window. No manual submission required.       |
| Submit only     | All results must be manually submitted. No scraping occurs. Required for real-time session modes and events with no hanab-live presence. |
| Both concurrent | Scraping and submission are both active simultaneously. A game may arrive via either path.                                               |
| Sequential      | Scraping is active during the play window; submission is required afterward. Used when scraped games may be incomplete at window close.  |

> **Incompatibility:** Real-time time windows and scraping are mutually incompatible. If a real-time window is configured on a slot or section, capture policy must be submit only for that scope.

---

### 3.7 Registration

Registration is the enrollment of a scoring unit in a specific event dimension instance. The mechanism by which enrollment happens is configurable and can vary by dimension.

| Mode            | Description                                                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implicit        | Playing a valid game in the event constitutes registration. No site visit required. The default for simple events. Only valid when inference sufficiency holds. |
| Explicit        | Participants must declare their intent to participate before their games count. Required when inference sufficiency fails.                                      |
| Both concurrent | Implicit and explicit registration are both active. Explicitly registered units are confirmed; implicitly registered units are inferred from play.              |
| Sequential      | Implicit during the play window; explicit required afterward for games to count in final standings.                                                             |

#### Inference Sufficiency

Inference sufficiency is a computable property of the event configuration. It is true when the system can unambiguously determine every scoring unit's identity, every game's attribution, and the full leaderboard from game data alone. The following conditions break inference sufficiency and require explicit registration:

- Pool teams are enabled but roster declaration is not required
- An organizer-assigned dimension is present (e.g. skill tier)
- A player appears in games for multiple units in the same dimension instance without a declared exclusivity rule
- Tag requirements are declared but the capture method cannot guarantee tag presence
- Forced matchmaking is configured but units have not been pre-assembled

> **Design principle:** Implicit registration should never be a surprise. The event configuration is designed to be transparent enough that admins immediately understand when a setting breaks inference. The platform surfaces configuration-time warnings for every known inference sufficiency failure condition. The warnings are specific and actionable — not "inference may fail" but the exact condition that causes it and what configuration change would resolve it.

---

### 3.8 Event Dimensions

An event can declare one or more dimensions along which it runs parallel instances. Each combination of dimension values is mechanically independent but shares configuration, slug, and landing page with the parent event.

| Dimension          | Description                                                                                                                           | Registration cardinality         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Player count class | 2p, 3-4p, 5-6p, or individual player counts. Game specs with different player counts are distinct and carry no spoilage between them. | Multiple allowed per player      |
| Convention system  | Which convention set teams are playing under.                                                                                         | One per team                     |
| Variant family     | Rainbow, black, etc. where separate leaderboards are warranted.                                                                       | One per team                     |
| Skill tier         | Open, experienced, expert, etc.                                                                                                       | One per team; organizer-assigned |
| Format             | Timed vs untimed, etc.                                                                                                                | One per team                     |

| Registration cardinality type | Description                                                                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Multiple allowed              | A player or team can register in more than one instance of this dimension within the same event.                                                                                                                   |
| One per unit                  | A team may only register in one instance of this dimension.                                                                                                                                                        |
| Organizer-assigned            | The dimension value is assigned by an admin, not self-declared. Players cannot self-register for this dimension. Self-declared tags on hanab-live games are informational only and do not constitute registration. |

> **Enforcement:** If multiple registrations per player count are allowed, team ID must appear in the seed pattern. This is enforced at configuration time.

---

### 3.9 Validity Rules

Validity rules are predicates evaluated against a captured game in the context of a specific event. An invalid game is retained in the global game database and still generates spoilage records, but does not contribute to event standings.

| Rule type               | Description                                                                                                                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit exclusivity        | A player may only appear in games for one scoring unit per dimension instance. A game is invalid for all associated units if this rule is violated. Spoilage is recorded regardless.                             |
| Participation freshness | A game is only valid if each participant has not previously played that game spec within the event context. Since attempt IDs are embedded in seed patterns, this rule does not conflict with attempt modifiers. |
| Time window             | A game is only valid if its timestamp falls within the configured time window.                                                                                                                                   |
| Tag requirement         | A game is only valid if it carries a required hanab-live tag. Used for convention-set filtering and enrichment.                                                                                                  |
| Lineup validity         | A game is only valid if all participants are on the scoring unit's roster at the time of play, per the active roster version.                                                                                    |

> **Spoilage independence:** Spoilage is always recorded, regardless of validity. A game that is invalid for unit X still records spoilage for all participants.

> **Rule conflicts:** Some combinations of validity rules and other configuration settings are mutually contradictory. The configuration-time inference sufficiency checker enumerates known conflicts. Examples: unit exclusivity combined with pool teams configured without roster declaration; tag requirements combined with scrape-only capture where tags may not be present at scrape time. Conflicting configurations produce warnings, not hard errors.

---

### 3.10 Visibility Policy

Visibility policies control when results and game specs are exposed to participants. They are the primary mechanism for spoiler protection.

| Setting                             | Description                                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Results hidden until section closes | Scores and standings are not visible until the section's advancement criteria are met or its time window closes. |
| Spec hidden until eligible          | A game spec is not shown to a scoring unit until that unit is eligible to play it. Prevents pre-game exposure.   |
| Spec hidden until assigned          | For lazy-assigned slots, the spec is not revealed until the assignment trigger fires.                            |
| Public                              | Results and specs are visible to all users at all times.                                                         |

---

### 3.11 Matchmaking

Matchmaking is the process of assembling operational units — the groups of players who sit at a table together. It is only a model concern when assembly is system-directed. Organic and support matchmaking are invisible to the model.

| Type    | Model role             | Description                                                                                                                                                                                      |
| ------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Organic | None                   | Players find their own teams offline. Units are inferred from game data or declared explicitly. The platform has no role in assembly.                                                            |
| Support | None                   | The platform offers a non-binding service to connect players seeking teams. Resulting unit declarations are treated as explicit registrations. The matching process itself is outside the model. |
| Forced  | Section entry property | Units are system-assigned by the platform before play begins. Used in session-mode events (Mixer) and individual-to-team transitions between sections.                                           |

| Forced matchmaking algorithm | Description                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| Random                       | Units assembled randomly from eligible participants                                       |
| Seeded by score              | Units assembled to balance or maximize score differentials based on prior section results |
| Manual                       | Admin assigns units explicitly                                                            |

---

### 3.12 Seed Patterns

Every game spec is admin-configured using a seed pattern. The pattern defines the structure of the seed string, which is the `s`-component of the full game spec `p{n}v{variant}s{seed}`.

#### Element Types

| Type             | Description                                                                                                                        | Example                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| String literal   | Any fixed string appearing verbatim in every generated spec.                                                                       | `NVC`, `p2`, `v0`, `e`, `s`, `g`, `a`, `t`                      |
| Prefixed integer | A variable that resolves to a fixed letter prefix followed by an integer. Self-separating due to the prefix letter.                | `{eventID}` → `e42`, `{sectionID}` → `s3`, `{slotIndex}` → `g7` |
| Bare integer     | A variable that resolves to a raw integer with no prefix. Requires adjacent string literal separators to avoid boundary ambiguity. | `{eventID*}` → `42`, `{sectionID*}` → `3`                       |

#### Available Variables

| Variable   | Prefixed form        | Bare form            | Required when                                                 |
| ---------- | -------------------- | -------------------- | ------------------------------------------------------------- |
| Event ID   | `{eventID}` → `e#`   | `{eventID*}` → `#`   | Strongly encouraged always                                    |
| Section ID | `{sectionID}` → `s#` | `{sectionID*}` → `#` | Required when omitting would cause intra-event slot collision |
| Slot index | `{slotIndex}` → `g#` | `{slotIndex*}` → `#` | Almost always required for slot uniqueness                    |
| Team ID    | `{teamID}` → `t#`    | `{teamID*}` → `#`    | Required when multi-registration per player count is enabled  |
| Attempt ID | `{attemptID}` → `a#` | `{attemptID*}` → `#` | Required when attempt modifier is enabled at any layer        |
| Arbitrary  | N/A                  | Admin-defined string | Strongly encouraged for spoiler resistance                    |

#### Conflict Detection

The seed pattern system performs conflict detection at two points:

**At configuration time:** the system generates all specs producible from bounded variables (event ID, section ID, slot index) and checks the full set against the global spec registry and against itself. All specs are registered atomically on success or all conflicts are reported on failure.

**At issuance time:** when an unbounded variable resolves (team registers, attempt begins), the specific spec is checked against the global registry before being issued.

Pattern-to-pattern conflict detection uses the three element types as a parsing basis. Literal anchors act as segment delimiters. Prefixed integer variables are self-distinguishing by their prefix letter. Adjacent bare integers produce a minimum-length segment expressed as a regex of the form `\d{n,}` where `n` is the number of adjacent bare integer variables.

> **Adjacency warning:** Adjacent bare integer variables are permitted but strongly discouraged. They produce ambiguous segment boundaries that conservatively widen the conflict detection surface, potentially generating false positive conflicts. A separator string literal between any two bare integers eliminates this ambiguity. The system warns when adjacent bare integers are detected but does not block the configuration.

---

### 3.13 Awards

Awards are display-layer predicates evaluated against a section's output after scoring. They are not advancement gates — they do not affect who can play subsequent sections.

| Predicate type | Description                                                                       |
| -------------- | --------------------------------------------------------------------------------- |
| Threshold      | Score meets or exceeds a fixed value (e.g. total points >= 200)                   |
| Rank           | Unit finishes at or above a position (e.g. top 3, top 10%)                        |
| Completion     | Unit has a valid result for all required slots in the section                     |
| Boolean        | Unit achieved a specific result on a specific slot (e.g. perfect score on slot 5) |

Award predicates compose: an award can require threshold AND rank, or completion AND threshold. The system evaluates them as boolean expressions against the section result set after scoring completes.

---

## Event Walkthroughs

The following section demonstrates the model through three real event formats used in the Hanabi competitive community. Each event is briefly introduced, followed by an annotated configuration that shows exactly how the model expresses it. The goal is not to be exhaustive but to show that each event emerges naturally from orthogonal configuration choices without any special-casing. Where configuration choices have non-obvious implications, inline notes explain the reasoning.

---

### 4.1 No Variant Challenge (NVC)

The No Variant Challenge is an open endurance event in which teams attempt to achieve maximum scores (25 points) across 100 No Variant seeds, designated NVC1 through NVC100. Teams are self-assembled and may be pool teams, allowing the roster composition to vary from game to game within the declared pool. Players may participate on one team per player count class, making the event effectively a parallel set of independent leaderboards by team size. Games are scraped during the play window and must be manually submitted afterward. The event is scored by counting how many of the 100 seeds a team achieved the maximum possible score on. Awards recognize teams that completed various percentages of the challenge.

```
EVENT
  name:                   No Variant Challenge
  slug:                   nvc
  dimensions:             player_count_class
                          [2p | 3-4p | 5-6p — independent leaderboards]
  registration_policy:    implicit during window (non-pool teams)
                          explicit required (pool teams — roster must be declared)
                          explicit required after window (all teams)
  capture_policy:         scrape during window → submit after window (sequential)
  multi_registration:     one team per player per player_count_class

SECTION  [terminal]
  scoring_unit_type:      team
  aggregation_function:   count_of_max_scores
  advancement_criteria:   none
  attempt_modifier:       disabled

GAME SLOTS  [1–100, one per seed NVC1–NVC100]
  assignment_trigger:     eager (all specs configured upfront)
  order:                  unrestricted (any order)
  reference_score:        25 (No Variant maximum)
  aggregation_function:   boolean_max (1 if score = 25, else 0)
  missing_score_default:  0
  attempt_modifier:       disabled (one attempt per seed per unit)

SEED PATTERN
  p{n}v0sNVC{slotIndex*}
  e.g.  p2v0sNVC1 through p2v0sNVC100
  note: {eventID} omitted — NVC prefix provides sufficient global uniqueness
        {teamID} not required — one team per player count class enforced by validity
        {sectionID} not required — single section, no collision risk

VALIDITY RULES
  unit_exclusivity:       if a player appears in a game for a different unit
                          in the same player_count_class, game is invalid
                          for both units; spoilage recorded regardless
  attempt_uniqueness:     one valid game per seed per unit

AWARDS  [display layer — evaluated against section score]
  any%:        count_of_max >= 1
  70%:         count_of_max >= 70
  80%:         count_of_max >= 80
  90%:         count_of_max >= 90
  100%:        count_of_max = 100  (completion)
```

> **Note on pool team registration:** Pool team registration is explicit even though the event is otherwise implicit-first. The platform surfaces a configuration-time warning that pool team support breaks inference sufficiency for those units. The admin's event description communicates this requirement to participants. Non-pool teams whose composition is consistent across all their games require no site visit.

> **Note on cross-class participation:** A player appearing in a 2p game and a 4p game is not a conflict — those are distinct dimension instances with distinct game specs. The unit exclusivity rule is scoped to a single player_count_class instance.

---

### 4.2 Mix Gauntlet

The Mix Gauntlet is a personal-best event in which players work through a sequence of eight special variants, progressing from one to the next within a single attempt. Players may restart at any time, beginning a new attempt from variant 1. The event score is the highest total points achieved across any single attempt. There is no time restriction, no scraping, and no limit on the number of attempts. Teams are fixed. Because team ID and attempt ID are embedded in the seed, each attempt produces globally unique game specs — the same logical game can be replayed by the same team without spoilage conflict. There are no awards.

```
EVENT
  name:                   Mix Gauntlet
  slug:                   mix-gauntlet
  dimensions:             none
  registration_policy:    explicit
  capture_policy:         submit only
  time_window:            none

SECTION  [terminal]
  scoring_unit_type:      team (fixed composition)
  aggregation_function:   best_attempt (highest total points across attempts)
  attempt_modifier:       enabled at section level
                          count: unlimited
                          aggregation: best
  advancement_criteria:   none
  matchmaking:            none (organic)

GAME SLOTS  [1–8, one per special variant]
  assignment_trigger:     lazy — triggered by completion of prior slot
                          (slot 1 assigned on attempt start)
  order:                  strictly sequential
  aggregation_function:   points achieved (raw score)
  attempt_modifier:       disabled at slot level
                          (attempts are at section level, not slot level)

SEED PATTERN
  p{n}v{variantID}s{teamID}{attemptID*}
  e.g.  p4v7st42a3  (4-player, variant 7, team 42, attempt 3)
  note: {teamID} required — multi-registration is unrestricted
        {attemptID} required — section-level attempt modifier enabled
        team + attempt coordinate ensures global uniqueness without spoilage

VALIDITY RULES
  none beyond defaults

AWARDS
  none configured
```

> **Note on spoilage:** The combination of `{teamID}` and `{attemptID}` in the seed is what makes unlimited restarts possible without spoilage side effects. Each attempt produces a globally unique set of game specs. A team that has played attempt 3 of the gauntlet is not spoiled for attempt 4 — those are different game specs. This is a direct consequence of the seed pattern design, not a special case in the spoilage model.

> **Note on lazy assignment:** Variant specs are not generated or revealed until the prior slot is complete. This is both a spoiler protection measure and a practical necessity — later variants in the sequence should not be known to players who have not yet reached them.

---

### 4.3 Boom and Bloom

Boom and Bloom is a 2-player weekly league running over multiple weeks. Teams are scored together when they play consistently with the same partner across the event; players who mix their team compositions are scored as individuals. All participation is inferred from scraped game data — no site visit is required. Each week, four games are allocated with daily result scrapes. Games played outside the weekly window are not captured and do not count. Missing scores are treated as zero. The event concludes with a conditional head-to-head tournament among teams tied for podium positions.

```
EVENT
  name:                   Boom and Bloom
  slug:                   boom-and-bloom
  dimensions:             player_count_class = 2p exclusively
  registration_policy:    implicit (all participation inferred)
  capture_policy:         scrape only; daily scrapes within weekly windows
                          no capture outside window

SECTIONS  [one per week, non-terminal] × N weeks
  scoring_unit_type:      resolved post-capture
                            team        — player appears exclusively with same partner
                            individual  — player mixes compositions across the event
  aggregation_function:   sum of slot scores
  attempt_modifier:       disabled
  advancement_criteria:   none (all units carry forward)
  time_window:            bounded [week_start, week_end]
  capture_policy:         scrape; daily schedule within window

GAME SLOTS  [1–4 per weekly section]
  assignment_trigger:     eager within window
  aggregation_function:   points achieved
  missing_score_default:  0
  attempt_modifier:       disabled

SECTION  [terminal, conditional]
  name:                   Tiebreaker Tournament
  activation_predicate:   tie exists at position 1, 2, or 3
                          after final weekly section
  scoring_unit_type:      team
  aggregation_function:   head-to-head record
  matchmaking:            forced — bracket assembled from tied units
                          algorithm: seeded by regular season score
  game_slots:             dynamic — determined by bracket size at activation
  assignment_trigger:     lazy — sequential bracket play

SEED PATTERN  [weekly sections]
  p2v0s{eventID}s{sectionID*}g{slotIndex*}
  e.g.  p2v0se7s3g2  (event 7, week 3, game 2)
  note: sectionID is bare integer — separated by literal 's' prefix
        slotIndex is bare integer — separated by literal 'g' prefix

SEED PATTERN  [tiebreaker section]
  p2v0s{eventID}TBg{slotIndex*}
  e.g.  p2v0se7TBg1
  note: TB literal distinguishes tiebreaker from weekly sections
        eliminates collision with weekly seeds regardless of week count

VALIDITY RULES
  time_window:            games outside weekly window not captured
                          (capture policy handles this — scraper ignores out-of-window games)

CANONICAL RANKING
  terminal section output with carry-through:
  non-participants retain their regular season rank
  tiebreaker results overwrite positions for participating units

AWARDS
  none configured
```

> **Note on resolved scoring:** The resolved scoring unit type requires a post-capture classification pass after the final weekly section closes. This pass analyzes each user's participation pattern across all weekly sections and assigns them to a team unit or individual unit before final scoring runs. A player who played some weeks with one partner and other weeks with another is scored as an individual. The classification rule is configurable.

> **Note on tiebreaker activation:** The conditional section exists in the event configuration before the regular season begins, but its game specs are not generated until activation. If no tie exists at podium positions, the section is inert and the regular season leaderboard is the canonical ranking. If a tie exists, the tiebreaker runs, and its results are merged into the canonical ranking via carry-through.

> **Note on dynamic bracket sizing:** The tiebreaker section does not have a fixed slot count at configuration time. Slot count is determined at activation based on how many units are tied and at which positions. The seed pattern uses a slot index variable that accommodates any bracket depth.

---

## Implementation Proposal

This section makes opinionated recommendations for implementing the model. Where tradeoffs exist, a position is taken. The goal is a system that is correct, maintainable, and extensible — in that order.

---

### 5.1 Data Layer

Use a relational database. The model is fundamentally relational: entities have well-defined identities, relationships are explicit, and query-based result computation is a first-class concern. A document database is tempting for the configuration objects (events, sections, slots are heavily nested) but the query surface for result computation is too relational to fight against a document model. Use JSONB columns for configuration blobs within a relational schema — the best of both.

The global game database is a single append-only table. Event results are views or queries against it, never separate tables.

**Core tables:**

- `games` — append-only log of every game played. Columns: `id`, `game_spec_id`, `participants` (array of user IDs), `result`, `timestamp`, `source`, `tags`.
- `game_specs` — global registry of every issued game spec. Columns: `id`, `spec_string`, `event_id`, `section_id`, `slot_index`, `issued_at`. Unique constraint on `spec_string`.
- `users` — platform identity. Columns: `id`, `display_name`.
- `hlive_accounts` — hanab-live account to user mapping. Columns: `id`, `user_id`, `hlive_username`.
- `spoilage` — `(user_id, game_spec_id)`. Append-only. Indexed on both columns. No deletions, ever.
- `events` — event configuration as a JSONB document plus indexed scalar fields for queryable dimensions.
- `sections` — section configuration. Foreign key to event. Ordered by `position`.
- `slots` — slot configuration. Foreign key to section. `slot_index` is locally scoped to section.
- `scoring_units` — teams and individuals. Foreign key to event.
- `rosters` — `(scoring_unit_id, user_id, effective_from, effective_to)`. Versioned roster membership.
- `lineups` — `(game_id, scoring_unit_id, user_id)`. Per-game participant-to-unit mapping.
- `registrations` — `(user_id, scoring_unit_id, event_id, dimension_values)`. Enrollment records.

> **Recommendation:** Store aggregation functions, validity rules, and award predicates as structured JSON configuration on their respective tables rather than as code. This allows rules to be inspected, versioned, and evaluated by a common rule engine without deploying code changes for each new event. Define a small, stable set of built-in function types and allow custom functions as a separate registered type with a defined interface.

---

### 5.2 Result Computation

Event results are computed on demand by a layered query pipeline that mirrors the structural hierarchy. The pipeline executes in this order:

1. Fetch all games matching the event's game specs from the global game database.
2. Apply validity rules to filter the game set. Tag each game as valid or invalid with a reason code.
3. Apply attempt aggregation at the slot level for slots with attempt modifiers enabled.
4. Apply slot aggregation to produce per-unit slot scores.
5. Apply attempt aggregation at the section level for sections with attempt modifiers enabled.
6. Apply section aggregation to produce per-unit section scores.
7. Apply advancement criteria and canonical ranking with carry-through.
8. Evaluate award predicates against the final section scores.

Each step is a pure function over its inputs. Steps can be cached independently — slot scores rarely change after the window closes; section scores change only when new games are captured. The pipeline should be incrementally re-evaluatable: capturing a new game should re-run only the affected steps.

> **Recommendation:** Expose the result pipeline as a transparent audit log for admins. For any game, an admin should be able to see exactly which validity rules it passed or failed, which aggregation functions applied to it, and how it contributed to the final standing. This is the primary tool for resolving participant disputes and the primary mechanism for building trust in the platform.

> **Recommendation:** Relational aggregation functions (ELO, head-to-head) should be computed in a single pass over the full section result set after all absolute aggregations have completed. Do not interleave relational and absolute aggregation steps.

---

### 5.3 Seed Pattern Engine

The seed pattern engine has three responsibilities: pattern validation, spec generation, and conflict detection.

**Pattern validation** runs at configuration save time. It checks:

- All required variables are present given the event's other configuration (`{teamID}` if multi-registration is enabled; `{attemptID}` if attempt modifier is enabled at any layer)
- No string literal matches the format of a prefixed integer variable (e.g. the literal `e5` would be ambiguous with `{eventID}` resolving to event 5)
- Adjacent bare integer variables are detected and a warning is issued (not an error)
- The pattern produces a valid regular language with no internal ambiguity when separators are present

**Spec generation** enumerates all specs producible from bounded variables (event ID, section ID, slot index). For unbounded variables (team ID, attempt ID), generation is deferred to issuance time. All generated specs are checked against the global registry and against each other before being registered. Registration is atomic — all specs register or none do.

**Conflict detection** at configuration time uses pattern-to-pattern regex intersection over the bounded variable space. Literal anchors act as segment delimiters. Prefixed integer variables are matched by their prefix letter plus `\d+` pattern. Adjacent bare integer segments are expressed as `\d{n,}` where `n` is the count of adjacent variables. Any pattern pair whose output spaces intersect is flagged as a conflict.

At issuance time, the specific generated spec is checked against the global registry as a point lookup before being registered.

> **Recommendation:** Build the seed pattern engine as a standalone module with a clear interface: `validate(pattern, event_config) → warnings[]`; `generate(pattern, bound_vars) → spec_strings[]`; `check_conflicts(pattern, registry) → conflicts[]`; `register(spec_strings) → result`. This module is one of the highest-value pieces of the system to unit test exhaustively, with property-based tests covering the full conflict detection surface.

---

### 5.4 Inference Sufficiency Checker

The inference sufficiency checker is a validation function that runs whenever event configuration is saved. It evaluates the full configuration against the enumerated failure conditions and produces a list of warnings that the admin must acknowledge before publishing the event.

The checker is not a blocker — an admin can publish an event that fails inference sufficiency checks. The warnings are informational, not enforcement. The value is that the admin understands the implications before participants play.

The checker produces actionable output: not just "inference sufficiency fails" but the exact condition, the consequence if unaddressed, and the specific configuration change that would resolve it.

**Known failure conditions:**

| Condition                                                     | Warning                                                                                 |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Pool teams enabled, no roster declaration required            | Games where a player appears for multiple units will be invalid for all units           |
| Organizer-assigned dimension present                          | All registrations for this dimension require admin action; players cannot self-register |
| Multi-registration enabled, no team ID in seed                | Team attribution will be ambiguous; add `{teamID}` to seed pattern                      |
| Tag requirement declared, capture is scrape-only              | Tags may not be present at scrape time; consider submit-only or both capture            |
| Forced matchmaking configured, no pre-assembly mechanism      | Units must be assembled before the section can begin                                    |
| Real-time window with scrape capture                          | Real-time windows and scraping are incompatible; use submit-only capture                |
| Attempt modifier enabled, no attempt ID in seed               | Seed pattern will produce collisions across attempts; add `{attemptID}`                 |
| Resolved scoring unit type, no classification rule configured | Post-capture classification pass has no rule to apply                                   |

> **Recommendation:** Implement the checker as a declarative rule set, not procedural code. Each failure condition is a named rule with a predicate over the event configuration and a templated message. New failure conditions can be added without modifying existing logic. The rule set is the canonical documentation of what breaks inference.

---

### 5.5 Configuration Interface

The configuration interface is where the model's orthogonality pays off most visibly. Because every dimension is independent, the UI can present each axis of control separately without hidden dependencies between fields. The payoff is direct: a clean model makes a transparent interface achievable; a tangled model makes it impossible.

**Principles:**

- **Every setting shows its consequence immediately.** When an admin enables pool teams, the interface immediately shows which other settings are now required or recommended. The implication is surfaced at the moment of choice, not discovered later.
- **Warnings are specific and actionable.** A warning is not "this configuration may cause problems." It is the exact condition that causes it, the consequence if unaddressed, and the specific change that would resolve it.
- **The seed pattern builder** provides a structured editor that shows a live preview of generated specs and highlights any required variables that are missing given the current configuration. Conflict detection runs in the background and shows matches against the global registry in real time.
- **Configuration is saveable in any state.** Admins should be able to save incomplete configurations and publish only when ready. Publishing triggers a final sufficiency check with explicit acknowledgment of any outstanding warnings.
- **Event templates are first-class.** Common configurations should be available as starting points. Templates are pre-configured combinations of settings — they are not archetypes in the model, just convenient defaults that an admin can then customize freely.

> **Recommendation:** Build the configuration interface last, not first. Build the model layer, the result pipeline, and the seed pattern engine first. The interface is a projection of those systems — its quality is a direct function of the underlying model's clarity.

---

### 5.6 hanab-live Integration

The hanab-live integration has two surfaces: game scraping and user identity.

**Game scraping** polls the hanab-live API for games matching configured game specs within active time windows. The scraper should be idempotent — running it twice should produce the same result as running it once. Use the game spec plus participant set plus timestamp as a composite deduplication key. Scraping frequency is configurable per section (daily, hourly, on-demand). Real-time events should never use the scraper. Scraping failures should not affect result display — the platform displays results from whatever games are in the database; a failed scrape is logged and retried, not surfaced as an error to participants. Game tags are captured at scrape time and stored on the game record.

**User identity merging** allows a platform user to claim multiple hanab-live accounts. All games from claimed accounts are attributed to the merged user identity. Spoilage records are unified across the merged identity — spoilage on any claimed account applies to all. Merging requires confirmation from both the platform account and the hanab-live account being claimed. A claimed account cannot be claimed by a second platform user without first being released. Merging is reversible, but spoilage records generated while merged are not retracted.

> **Recommendation:** Treat hanab-live as an unreliable external dependency. Build the platform so that all core functionality — event configuration, result computation, standings display — works correctly from submitted games alone. Scraping is an enhancement, not a foundation. This makes the platform resilient to hanab-live API changes or outages, and makes it usable for events that have no hanab-live presence at all.

---

_End of document._
