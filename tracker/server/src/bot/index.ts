/**
 * Discord bot entry point.
 *
 * Runs as a SEPARATE process from the Express server.
 * Activated by setting DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, and DISCORD_MOD_ROLE_NAME.
 * If these env vars are absent the bot exits immediately (dormant until go-live).
 *
 * Responsibilities:
 *   - Listen for role grant/revocation events in the guild → write to discord_role_sync_log
 *   - Expose a /token slash command that links a Discord identity to a hanab.live username
 *   - On successful /token: apply pending role grants from discord_role_sync_log
 */

import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  Events,
  type GuildMember,
  type Interaction,
} from 'discord.js';
import { env } from '../env.js';
import { getPool } from '../db/pool.js';
import {
  recordRoleSyncEvent,
  linkDiscordIdentity,
  getPendingRoleGrants,
  markRoleGrantsApplied,
} from '../db/discord-bot.js';
import { findTrackerUser, resolveUserRole } from '../db/users.js';

const { DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, DISCORD_MOD_ROLE_NAME } = env;

if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID || !DISCORD_MOD_ROLE_NAME) {
  console.info('Discord bot env vars not set — bot is dormant. Exiting.');
  process.exit(0);
}

const sql = getPool();

// ── Slash command registration ────────────────────────────────────────────────

const tokenCommand = new SlashCommandBuilder()
  .setName('token')
  .setDescription('Link your Discord account to your hanab.live account.')
  .addStringOption((opt) =>
    opt.setName('username').setDescription('Your hanab.live username').setRequired(true),
  );

const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);

async function registerCommands(): Promise<void> {
  const data = await rest.put(
    Routes.applicationGuildCommands(
      ((await rest.get(Routes.currentApplication())) as { id: string }).id,
      DISCORD_GUILD_ID!,
    ),
    { body: [tokenCommand.toJSON()] },
  );
  console.info({ commandCount: (data as unknown[]).length }, 'Registered Discord slash commands');
}

// ── Client ────────────────────────────────────────────────────────────────────

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

// ── Role sync ─────────────────────────────────────────────────────────────────

async function handleRoleChange(oldMember: GuildMember, newMember: GuildMember): Promise<void> {
  const modRoleName = DISCORD_MOD_ROLE_NAME!;
  const hadRole = oldMember.roles.cache.some((r) => r.name === modRoleName);
  const hasRole = newMember.roles.cache.some((r) => r.name === modRoleName);

  if (hadRole === hasRole) return;

  const eventType = hasRole ? 'granted' : 'revoked';
  try {
    await recordRoleSyncEvent(sql, newMember.id, modRoleName, eventType);
    console.info(
      { discordUserId: newMember.id, modRoleName, eventType },
      'Role sync event recorded',
    );
  } catch (err) {
    console.error({ discordUserId: newMember.id, err }, 'Failed to record role sync event');
  }
}

// ── /token slash command ──────────────────────────────────────────────────────

async function applyPendingGrants(
  discordUserId: string,
  userId: number,
  guild: import('discord.js').Guild,
): Promise<void> {
  const modRoleName = DISCORD_MOD_ROLE_NAME!;
  const pending = await getPendingRoleGrants(sql, discordUserId);
  const modRoleGrants = pending.filter((g) => g.discord_role_name === modRoleName);
  if (modRoleGrants.length === 0) return;

  try {
    // Apply tracker role (moderator)
    const role = await resolveUserRole(sql, userId);
    if (role === 'community_member') {
      // Find the role in the guild and assign in the DB
      const modRole = guild.roles.cache.find((r) => r.name === modRoleName);
      if (modRole) {
        const member = await guild.members.fetch(discordUserId).catch(() => null);
        if (member && !member.roles.cache.has(modRole.id)) {
          // Role is already in discord — just mark grants applied
        }
      }
    }
    await markRoleGrantsApplied(
      sql,
      modRoleGrants.map((g) => g.id),
    );
    console.info(
      { userId, modRoleGrantsApplied: modRoleGrants.length },
      'Applied pending role grants',
    );
  } catch (err) {
    console.error({ userId, err }, 'Failed to apply pending role grants');
  }
}

async function handleTokenCommand(
  interaction: import('discord.js').ChatInputCommandInteraction,
): Promise<void> {
  const hanabLiveUsername = interaction.options.getString('username', true).trim();
  const discordUserId = interaction.user.id;
  const discordUsername = interaction.user.username;

  if (!hanabLiveUsername) {
    await interaction.reply({ content: 'Username cannot be empty.', ephemeral: true });
    return;
  }

  try {
    // Look up the user in public.users — they must have a hanab.live account first
    const trackerUser = await findTrackerUser(sql, hanabLiveUsername);
    if (!trackerUser) {
      await interaction.reply({
        content: `No hanab.live account found for **${hanabLiveUsername}**. Please ensure you have a hanab.live account before linking Discord.`,
        ephemeral: true,
      });
      return;
    }

    // Link the Discord identity
    const linkResult = await linkDiscordIdentity(
      sql,
      trackerUser.id,
      discordUserId,
      discordUsername,
    );

    if (!linkResult.ok) {
      await interaction.reply({
        content: 'This Discord account is already linked to a different hanab.live account.',
        ephemeral: true,
      });
      return;
    }

    // Apply any pending role grants
    if (interaction.guild) {
      await applyPendingGrants(discordUserId, trackerUser.id, interaction.guild);
    }

    await interaction.reply({
      content: `Successfully linked your Discord account to **${hanabLiveUsername}** on hanab.live.`,
      ephemeral: true,
    });
  } catch (err) {
    console.error({ discordUserId, hanabLiveUsername, err }, '/token command failed');
    await interaction.reply({
      content: 'An error occurred while linking your account. Please try again later.',
      ephemeral: true,
    });
  }
}

// ── Event handlers ────────────────────────────────────────────────────────────

client.on(Events.ClientReady, async () => {
  console.info({ username: client.user?.tag }, 'Discord bot is ready');
  await registerCommands().catch((err) => {
    console.error({ err }, 'Failed to register Discord commands');
  });
});

client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
  void handleRoleChange(oldMember as GuildMember, newMember as GuildMember);
});

client.on(Events.InteractionCreate, (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'token') {
    void handleTokenCommand(interaction);
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

client.login(DISCORD_BOT_TOKEN).catch((err) => {
  console.error({ err }, 'Discord bot login failed');
  process.exit(1);
});

process.on('SIGTERM', () => {
  client.destroy();
  process.exit(0);
});
