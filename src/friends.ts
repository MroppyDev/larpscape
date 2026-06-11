// Friends list — account-level social graph with online indicators.
// Also the guild client: roster state, REST helpers, invite popups, and the
// 'guild_vault' world-object action.
import { net } from './net';
import {
  msg, invCount, removeItem, addItem, startDialogue, showOptions,
  registerObjectAction,
} from './game';

export interface FriendEntry {
  username: string;
  online: boolean;
  addedAt: number;
}

export const friends = {
  list: [] as FriendEntry[],
  loaded: false,
  onChange: (() => {}) as () => void,
};

let pollTimer: ReturnType<typeof setInterval> | null = null;

export async function loadFriends(): Promise<void> {
  if (!net.online) return;
  try {
    const res = await net.api('/api/friends');
    friends.list = Array.isArray(res?.friends) ? res.friends : [];
    friends.loaded = true;
    friends.onChange();
  } catch { /* ignore */ }
}

export async function addFriend(username: string): Promise<boolean> {
  if (!net.online) { msg('You must be logged in to add friends.'); return false; }
  try {
    const res = await net.api('/api/friends/add', { username });
    friends.list = Array.isArray(res?.friends) ? res.friends : friends.list;
    friends.onChange();
    msg(`${username} has been added to your friends list.`, 'game');
    return true;
  } catch (e: any) {
    msg(String(e?.message || 'Could not add friend.'), 'game');
    return false;
  }
}

export async function removeFriend(username: string): Promise<void> {
  if (!net.online) return;
  try {
    const res = await fetch(`/api/friends/${encodeURIComponent(username)}`, {
      method: 'DELETE',
      // Bearer header for legacy token sessions; cookie sessions ride on credentials.
      headers: net.token ? { Authorization: 'Bearer ' + net.token } : {},
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'failed');
    friends.list = Array.isArray(data?.friends) ? data.friends : friends.list;
    friends.onChange();
    msg(`${username} removed from friends list.`, 'game');
  } catch (e: any) {
    msg(String(e?.message || 'Could not remove friend.'), 'game');
  }
}

export function isFriend(username: string): boolean {
  return friends.list.some((f) => f.username.toLowerCase() === username.toLowerCase());
}

export function setFriendOnline(username: string, online: boolean) {
  const f = friends.list.find((x) => x.username.toLowerCase() === username.toLowerCase());
  if (f && f.online !== online) {
    f.online = online;
    friends.onChange();
  }
}

// ---------------------------------------------------------------------------
// Guilds
// ---------------------------------------------------------------------------

export interface GuildMember { username: string; rank: 'leader' | 'officer' | 'member'; online: boolean; joinedAt: number }
export interface GuildInfo {
  id: number; name: string; tag: string;
  rank: 'leader' | 'officer' | 'member';
  memberDepositOnly: boolean;
  roster: GuildMember[];
}

export const guild = {
  info: null as GuildInfo | null,
  loaded: false,
  onChange: (() => {}) as () => void,
};

export const GUILD_COST = 5000;

export async function loadGuild(): Promise<void> {
  if (!net.online) return;
  try {
    const res = await net.api('/api/guild');
    guild.info = res?.guild ?? null;
    guild.loaded = true;
    guild.onChange();
  } catch { /* ignore */ }
}

// Creation costs 5000 coins — removed client-side first (GE escrow model),
// refunded if the server rejects the request.
export async function createGuild(name: string, tag: string): Promise<boolean> {
  if (!net.online) { msg('You must be logged in.'); return false; }
  if (invCount('coins') < GUILD_COST) {
    msg(`You need ${GUILD_COST.toLocaleString()} coins to found a guild.`);
    return false;
  }
  removeItem('coins', GUILD_COST);
  try {
    const res = await net.api('/api/guild/create', { name, tag });
    guild.info = res?.guild ?? null;
    guild.loaded = true;
    guild.onChange();
    msg(`You have founded ${name} [${guild.info?.tag ?? tag}]!`, 'level');
    return true;
  } catch (e: any) {
    addItem('coins', GUILD_COST); // refund
    msg(String(e?.message || 'Could not create guild.'), 'game');
    return false;
  }
}

export async function guildInvite(username: string): Promise<void> {
  try {
    await net.api('/api/guild/invite', { username });
    msg(`Guild invitation sent to ${username}.`, 'game');
  } catch (e: any) { msg(String(e?.message || 'Could not invite.'), 'game'); }
}

export async function guildLeave(): Promise<void> {
  try {
    const res = await net.api('/api/guild/leave', {});
    msg(res?.disbanded ? 'Your guild has been disbanded.' : 'You have left the guild.', 'game');
    guild.info = null;
    guild.onChange();
  } catch (e: any) { msg(String(e?.message || 'Could not leave.'), 'game'); }
}

export async function guildKick(username: string): Promise<void> {
  try {
    await net.api('/api/guild/kick', { username });
    void loadGuild();
  } catch (e: any) { msg(String(e?.message || 'Could not kick.'), 'game'); }
}

export async function guildPromote(username: string, rank: 'leader' | 'officer' | 'member'): Promise<void> {
  try {
    await net.api('/api/guild/promote', { username, rank });
    void loadGuild();
  } catch (e: any) { msg(String(e?.message || 'Could not change rank.'), 'game'); }
}

export async function guildSetDepositOnly(value: boolean): Promise<void> {
  try {
    await net.api('/api/guild/settings', { memberDepositOnly: value });
    if (guild.info) guild.info.memberDepositOnly = value;
    guild.onChange();
  } catch (e: any) { msg(String(e?.message || 'Could not change settings.'), 'game'); }
}

// Incoming guild invite (relayed over the websocket) — OSRS-style option prompt.
export function showGuildInvite(id: string, from: string, guildName: string, tag: string) {
  startDialogue(
    [{ speaker: from, text: `${from} invites you to join ${guildName} [${tag}].` }],
    () => {
      showOptions([
        {
          label: `Join ${guildName}`,
          fn: () => {
            net.api('/api/guild/invite/accept', { id })
              .then((res) => {
                guild.info = res?.guild ?? null;
                guild.loaded = true;
                guild.onChange();
                msg(`Welcome to ${guildName} [${tag}]! Type /g to chat with your guild.`, 'guild-msg');
              })
              .catch((e) => msg(String(e?.message || 'Could not join guild.'), 'game'));
          },
        },
        {
          label: 'No thanks.',
          fn: () => { void net.api('/api/guild/invite/decline', { id }).catch(() => { /* ignore */ }); },
        },
      ]);
    },
  );
}

// Guild vault world object — members only; opens the shared store UI.
registerObjectAction('guild_vault', 'Open', () => {
  if (!net.online) { msg('You must be logged in to use the guild vault.'); return 'done'; }
  if (!guild.loaded) void loadGuild();
  if (!guild.info) {
    msg('The vault stays shut. Only guild members may open it — found a guild from the Friends tab.');
    return 'done';
  }
  void import('./ui').then((u) => u.openGuildVault());
  return 'done';
});

export function startFriendsPolling(active: () => boolean) {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    if (active() && net.online) { void loadFriends(); void loadGuild(); }
  }, 8000);
}

export function stopFriendsPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}
