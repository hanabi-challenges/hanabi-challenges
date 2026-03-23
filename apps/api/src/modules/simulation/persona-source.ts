// Persona source — Greek Mythology themed names used for shadow team generation.
//
// When simulating TEAM stages (participation_type = 'TEAM'), shadow players are
// drawn from these groups rather than generated with generic sim-* names.  Each
// group maps thematically related characters; the team-building algorithm cycles
// through groups and picks unused members to form teams of the required size.
//
// INDIVIDUAL/QUEUED stages (where real players opt in and are drawn into teams)
// continue to use the generic sim-s{id}-q/z naming scheme.

export const personaSource = {
  theme: 'Greek Mythology',

  nodes: [
    'Zeus','Hera','Poseidon','Demeter','Athena','Apollo','Artemis','Ares','Aphrodite','Hephaestus','Hermes','Dionysus','Hestia',
    'Hades','Persephone','Thanatos','Hypnos','Charon','Cerberus','Nyx','Erebus',
    'Cronus','Rhea','Oceanus','Tethys','Hyperion','Theia','Iapetus','Coeus','Phoebe','Mnemosyne','Themis',
    'Prometheus','Epimetheus','Atlas','Menoetius',
    'Heracles','Perseus','Theseus','Achilles','Odysseus','Jason','Bellerophon','Atalanta','Meleager','Orpheus',
    'Hector','Paris','Priam','Hecuba','Andromache','Aeneas','Agamemnon','Menelaus','Helen','Clytemnestra','Orestes','Electra','Patroclus','Ajax_Telamonian','Ajax_Lesser','Diomedes','Nestor',
    'Cadmus','Harmonia','Pentheus','Oedipus','Jocasta','Antigone','Ismene','Eteocles','Polynices',
    'Minos','Pasiphae','Ariadne','Phaedra','Daedalus','Icarus','Talos',
    'Medea','Circe','Aeetes','Calypso','Nausicaa','Penelope','Telemachus',
    'Eros','Psyche','Hebe','Ganymede',
    'Leto','Maia','Semele','Alcmene','Amphitryon',
    'Thetis','Peleus','Neoptolemus','Chiron',
    'Helios','Selene','Eos',
    'Nike','Nemesis','Eris',
    'Pan','Asclepius','Hygieia',
    'Europa','Io','Callisto','Leda',
  ],

  groups: {
    Olympians:              ['Zeus','Hera','Poseidon','Demeter','Athena','Apollo','Artemis','Ares','Aphrodite','Hephaestus','Hermes','Dionysus','Hestia'],
    Underworld:             ['Hades','Persephone','Thanatos','Hypnos','Charon','Cerberus','Nyx','Erebus','Hermes'],
    Titans:                 ['Cronus','Rhea','Oceanus','Tethys','Hyperion','Theia','Iapetus','Coeus','Phoebe','Mnemosyne','Themis'],
    Titan_Descendants:      ['Prometheus','Epimetheus','Atlas','Menoetius','Helios','Selene','Eos'],
    Children_of_Zeus:       ['Athena','Apollo','Artemis','Ares','Hermes','Dionysus','Persephone','Heracles','Perseus','Helen','Minos'],
    Trojan_Greeks:          ['Achilles','Agamemnon','Menelaus','Odysseus','Ajax_Telamonian','Ajax_Lesser','Diomedes','Nestor','Patroclus'],
    Trojan_Trojans:         ['Hector','Paris','Priam','Hecuba','Andromache','Aeneas'],
    Trojan_All:             ['Achilles','Hector','Paris','Helen','Menelaus','Agamemnon','Odysseus','Ajax_Telamonian','Diomedes','Aeneas'],
    House_of_Atreus:        ['Agamemnon','Menelaus','Clytemnestra','Orestes','Electra'],
    Theban_Cycle:           ['Oedipus','Jocasta','Antigone','Ismene','Eteocles','Polynices'],
    Cretan_Myths:           ['Minos','Pasiphae','Ariadne','Phaedra','Daedalus','Icarus','Talos'],
    Argonauts:              ['Jason','Heracles','Atalanta','Meleager','Orpheus'],
    Heroes:                 ['Heracles','Perseus','Theseus','Achilles','Odysseus','Jason','Bellerophon','Atalanta','Meleager'],
    Odyssey:                ['Odysseus','Penelope','Telemachus','Circe','Calypso','Nausicaa'],
    Underworld_Travelers:   ['Heracles','Orpheus','Odysseus','Theseus','Persephone','Hermes'],
    Divine_Affairs:         ['Zeus','Hera','Leto','Maia','Semele','Alcmene','Europa','Io','Callisto','Leda','Ganymede'],
    Children_of_Titans:     ['Prometheus','Atlas','Helios','Selene','Eos','Leto'],
    Sea_Associated:         ['Poseidon','Theseus','Odysseus','Aeneas','Nausicaa','Thetis'],
    Achilles_Family:        ['Achilles','Thetis','Peleus','Neoptolemus','Patroclus'],
    Inventors:              ['Hephaestus','Daedalus','Prometheus'],
    Love:                   ['Aphrodite','Eros','Psyche','Helen','Paris'],
    War:                    ['Ares','Athena','Achilles','Hector','Ajax_Telamonian','Diomedes'],
    Healing:                ['Asclepius','Hygieia','Apollo'],
    Nature:                 ['Artemis','Pan','Callisto','Atalanta'],
    Tricksters:             ['Hermes','Odysseus','Prometheus'],
    Artists:                ['Apollo','Orpheus'],
    Celestial:              ['Helios','Selene','Eos'],
    Justice:                ['Nemesis','Orestes','Electra','Athena'],
    Primordial:             ['Nyx','Erebus'],
    Theban_Family_Extended: ['Cadmus','Harmonia','Pentheus','Oedipus','Antigone'],
  },
} as const;

// ---------------------------------------------------------------------------
// Team-building helper
//
// Cycles through groups in declaration order, picking `teamSize` unused members
// per team.  The same name is never assigned to two teams in a single call, so
// each simulated player appears in exactly one team (no ingest dedup collisions).
//
// Returns a 2-D array of player-name arrays: one inner array per team.
// If there are not enough unused names to fill all requested teams, the
// returned array may contain fewer than `teamsPerSize` entries.
// ---------------------------------------------------------------------------

export function buildPersonaTeams(teamSize: number, teamsPerSize: number): string[][] {
  const usedNames = new Set<string>();
  const teams: string[][] = [];
  const groupList = Object.values(personaSource.groups) as unknown as string[][];
  let groupIdx = 0;
  let attempts = 0;
  const maxAttempts = groupList.length * 4;

  while (teams.length < teamsPerSize && attempts < maxAttempts) {
    const group = groupList[groupIdx % groupList.length];
    groupIdx++;
    attempts++;

    const available = group.filter((n) => !usedNames.has(n));
    if (available.length < teamSize) continue;

    const team = available.slice(0, teamSize);
    for (const name of team) usedNames.add(name);
    teams.push(team);
  }

  return teams;
}

// The full flat node list — used to identify persona shadow users when clearing.
export const PERSONA_NAMES = personaSource.nodes as readonly string[];
