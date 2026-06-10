// Friends list — account-level social graph with online indicators.
import { net } from './net';
import { msg } from './game';

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
      headers: { Authorization: 'Bearer ' + net.token },
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

export function startFriendsPolling(active: () => boolean) {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    if (active() && net.online) void loadFriends();
  }, 8000);
}

export function stopFriendsPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}
