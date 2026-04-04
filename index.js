// index.js
require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
} = require('discord.js');

const TOKEN = process.env.BOT_TOKEN;
const ROLE_ID = process.env.ROLE_ID;
const GRACE_MS = Number(process.env.GRACE_MS ?? 60 * 60 * 1000); // default 1 hour
const SWEEP_MS = Number(process.env.SWEEP_MS ?? 5 * 60 * 1000);  // default 5 minutes

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.GuildMember],
});

// key: "guildId:userId" -> { timeoutId, expiresAt }
const graceTimers = new Map();

function keyOf(guildId, userId) {
  return `${guildId}:${userId}`;
}

function clearGraceTimer(guildId, userId) {
  const key = keyOf(guildId, userId);
  const existing = graceTimers.get(key);
  if (existing) clearTimeout(existing.timeoutId);
  graceTimers.delete(key);
}

function scheduleGraceTimer(member) {
  const key = keyOf(member.guild.id, member.id);

  if (graceTimers.has(key)) return;

  const expiresAt = Date.now() + GRACE_MS;

  const timeoutId = setTimeout(() => {
    kickIfStillOutOfVoice(member.guild.id, member.id).catch(err => {
      console.error(`Timer kick failed for ${member.user.tag}:`, err);
    });
  }, GRACE_MS);

  graceTimers.set(key, { timeoutId, expiresAt });
  console.log(`Timer started for ${member.user.tag}`);
}

async function kickIfStillOutOfVoice(guildId, userId) {
  const key = keyOf(guildId, userId);
  const timer = graceTimers.get(key);
  if (timer) {
    clearTimeout(timer.timeoutId);
    graceTimers.delete(key);
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;

  //members who still have the role.
  if (!member.roles.cache.has(ROLE_ID)) return;

  // If they are in voice again, do nothing.
  if (member.voice?.channelId) return;

  try {
    await member.send(
      'Your 1-hour voice grace period has expired, so you have been removed from the server. You are welcome to join again.'
    );
  } catch {
    // DM can fail if the user has DMs closed.
  }

  try {
    await member.kick('Did not join voice within the grace period');
    console.log(`Kicked ${member.user.tag}`);
  } catch (err) {
    console.error(`Failed to kick ${member.user.tag}:`, err);
  }
}

async function syncMemberState(member) {
  if (!member || member.user.bot) return;

  const hasRole = member.roles.cache.has(ROLE_ID);
  const inVoice = Boolean(member.voice?.channelId);
  const key = keyOf(member.guild.id, member.id);

  // No role no timer
  if (!hasRole) {
    clearGraceTimer(member.guild.id, member.id);
    return;
  }

  // Role exists and they are in voice
  if (inVoice) {
    clearGraceTimer(member.guild.id, member.id);
    return;
  }

  // Role exists and they are not in voice
  if (!graceTimers.has(key)) {
    scheduleGraceTimer(member);
  }
}

async function sweepGuild(guild) {
  const members = await guild.members.fetch().catch(() => null);
  if (!members) return;

  for (const member of members.values()) {
    await syncMemberState(member);
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);

  // Start periodic resync.
  setInterval(() => {
    for (const guild of client.guilds.cache.values()) {
      sweepGuild(guild).catch(err => {
        console.error(`Sweep failed for guild ${guild.id}:`, err);
      });
    }
  }, SWEEP_MS);

  // Initial sweep after startup.
  for (const guild of client.guilds.cache.values()) {
    sweepGuild(guild).catch(err => {
      console.error(`Initial sweep failed for guild ${guild.id}:`, err);
    });
  }
});

// 1) joins server -> give role, then start timer if not in voice.
client.on(Events.GuildMemberAdd, async (member) => {
  try {
    await member.roles.add(ROLE_ID, 'Auto role on join');
    await syncMemberState(member);
    console.log(`Gave role to ${member.user.tag}`);
  } catch (err) {
    console.error(`Failed to add role to ${member.user.tag}:`, err);
  }
});

// 2) Voice changes -> cancel timer when they enter voice, restart when they leave.
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const member = newState.member ?? oldState.member;
  if (!member) return;

  // Only care about users with the target role.
  if (!member.roles.cache.has(ROLE_ID)) return;

  const leftVoice = Boolean(oldState.channelId) && !newState.channelId;
  const joinedVoice = !oldState.channelId && Boolean(newState.channelId);

  if (joinedVoice) {
    clearGraceTimer(member.guild.id, member.id);
    return;
  }

  if (leftVoice) {
    // Restart to 1 hour from zero.
    clearGraceTimer(member.guild.id, member.id);
    scheduleGraceTimer(member);
  }
});

// 3) Manual role edits -> keep timers aligned with current role state.
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  const hadRole = oldMember.roles.cache.has(ROLE_ID);
  const hasRole = newMember.roles.cache.has(ROLE_ID);

  if (hadRole !== hasRole) {
    await syncMemberState(newMember);
  }
});

client.login(TOKEN);