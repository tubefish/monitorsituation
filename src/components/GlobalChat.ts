import type { ConvexClient } from 'convex/browser';
import type { Id } from '../../convex/_generated/dataModel';
import { getAuthState, subscribeAuthState, type AuthSession } from '@/services/auth-state';
import { openSignIn } from '@/services/clerk';
import { getConvexApi, getConvexClient, waitForConvexAuthForUser } from '@/services/convex-client';

type ChatRoom = 'global' | 'geopolitics' | 'markets' | 'crypto';
const ROOMS: Array<{ id: ChatRoom; label: string }> = [
  { id: 'global', label: 'Global' },
  { id: 'geopolitics', label: 'Geopolitics' },
  { id: 'markets', label: 'Markets' },
  { id: 'crypto', label: 'Crypto' },
];

type Message = {
  _id: Id<'chatMessages'>;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  body: string;
  createdAt: number;
  replyTo?: Id<'chatMessages'>;
  replyDisplayName?: string;
  replyExcerpt?: string;
};

/** Shared chat rooms with subscriptions only while the overlay is visible. */
export class GlobalChat {
  public readonly element = document.createElement('aside');
  private readonly list = document.createElement('div');
  private readonly status = document.createElement('p');
  private readonly input = document.createElement('textarea');
  private readonly sendButton = document.createElement('button');
  private readonly olderButton = document.createElement('button');
  private readonly form = document.createElement('form');
  private readonly signInButton = document.createElement('button');
  private readonly counter = document.createElement('span');
  private readonly replyBar = document.createElement('div');
  private readonly onlineCount = document.createElement('span');
  private readonly roomTabs = new Map<ChatRoom, HTMLButtonElement>();
  private readonly listeners = new AbortController();
  private unsubscribeAuth: (() => void) | null = null;
  private stopUpdates: (() => void) | null = null;
  private stopCount: (() => void) | null = null;
  private countInterval: number | null = null;
  private heartbeatInterval: number | null = null;
  private client: ConvexClient | null = null;
  private current: Message[] = [];
  private older: Message[] = [];
  private cursor: string | null = null;
  private done = true;
  private loadingOlder = false;
  private active = false;
  private generation = 0;
  private sending = false;
  private replyTarget: Message | null = null;
  private openMenu: HTMLElement | null = null;
  private room: ChatRoom = 'global';

  constructor(close: () => void) {
    this.element.className = 'map-experience-stage map-experience-chat';
    this.element.hidden = true;
    this.element.setAttribute('aria-label', 'Chat');

    const header = document.createElement('header');
    const title = document.createElement('strong');
    title.textContent = 'GLOBAL CHAT';
    this.onlineCount.className = 'map-chat-online';
    this.onlineCount.title = 'Signed-in members active in this room within the last 90 seconds';
    this.onlineCount.textContent = 'Online: …';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'map-chat-close';
    closeButton.textContent = '×';
    closeButton.setAttribute('aria-label', 'Close chat');
    closeButton.addEventListener('click', close, { signal: this.listeners.signal });
    header.append(title, this.onlineCount, closeButton);

    const roomTabs = document.createElement('div');
    roomTabs.className = 'map-chat-rooms';
    roomTabs.setAttribute('role', 'tablist');
    roomTabs.setAttribute('aria-label', 'Chat rooms');
    for (const room of ROOMS) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.textContent = room.label;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(room.id === this.room));
      tab.classList.toggle('active', room.id === this.room);
      tab.addEventListener('click', () => this.setRoom(room.id), { signal: this.listeners.signal });
      this.roomTabs.set(room.id, tab);
      roomTabs.append(tab);
    }
    this.olderButton.type = 'button';
    this.olderButton.className = 'map-chat-older';
    this.olderButton.textContent = 'Load earlier messages';
    this.olderButton.hidden = true;
    this.olderButton.addEventListener('click', () => void this.loadOlder(), { signal: this.listeners.signal });
    this.list.className = 'map-chat-list';
    this.list.setAttribute('role', 'log');
    this.list.setAttribute('aria-label', 'Chat messages');
    this.status.className = 'map-chat-status';
    this.status.setAttribute('role', 'status');

    this.form.className = 'map-chat-composer';
    this.replyBar.className = 'map-chat-reply-bar';
    this.replyBar.hidden = true;
    this.input.placeholder = 'Type a message…';
    this.input.setAttribute('aria-label', 'Chat message');
    this.input.maxLength = 500;
    this.input.rows = 2;
    this.input.addEventListener('input', () => {
      this.counter.textContent = `${this.input.value.length}/500`;
    }, { signal: this.listeners.signal });
    this.input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        this.form.requestSubmit();
      }
    }, { signal: this.listeners.signal });
    const composerFooter = document.createElement('div');
    this.counter.textContent = '0/500';
    this.sendButton.type = 'submit';
    this.sendButton.textContent = 'Send ↗';
    composerFooter.append(this.counter, this.sendButton);
    this.form.append(this.replyBar, this.input, composerFooter);
    this.form.addEventListener('submit', event => {
      event.preventDefault();
      void this.send();
    }, { signal: this.listeners.signal });
    this.signInButton.type = 'button';
    this.signInButton.className = 'map-chat-signin';
    this.signInButton.textContent = 'Sign in to chat';
    this.signInButton.addEventListener('click', () => void openSignIn(), { signal: this.listeners.signal });
    this.element.addEventListener('click', event => {
      if (!(event.target as HTMLElement).closest('.map-chat-menu, .map-chat-menu-trigger')) this.closeMenu();
    }, { signal: this.listeners.signal });
    this.element.addEventListener('keydown', event => {
      if (event.key === 'Escape') this.closeMenu();
    }, { signal: this.listeners.signal });
    document.addEventListener('visibilitychange', () => {
      const userId = getAuthState().user?.id;
      if (document.visibilityState === 'visible' && userId && this.active && this.client) {
        void this.heartbeat(userId, this.generation);
      }
    }, { signal: this.listeners.signal });
    this.element.append(header, roomTabs, this.olderButton, this.list, this.status, this.form, this.signInButton);
    this.unsubscribeAuth = subscribeAuthState(state => this.authChanged(state));
  }

  public setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.element.hidden = !active;
    this.authChanged(getAuthState());
  }

  public destroy(): void {
    this.active = false;
    this.generation++;
    this.stopUpdates?.();
    this.stopCount?.();
    if (this.countInterval !== null) window.clearInterval(this.countInterval);
    if (this.heartbeatInterval !== null) window.clearInterval(this.heartbeatInterval);
    this.unsubscribeAuth?.();
    this.listeners.abort();
    this.element.remove();
  }

  private authChanged(state: AuthSession): void {
    this.generation++;
    this.stopUpdates?.();
    this.stopUpdates = null;
    this.stopCount?.();
    this.stopCount = null;
    if (this.countInterval !== null) window.clearInterval(this.countInterval);
    this.countInterval = null;
    if (this.heartbeatInterval !== null) window.clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = null;
    this.current = [];
    this.older = [];
    this.client = null;
    this.closeMenu();
    this.setReply(null);
    this.cursor = null;
    this.done = true;
    this.list.replaceChildren();
    if (!this.active) return;
    this.onlineCount.textContent = 'Online: …';
    void this.startCount(this.generation);
    this.form.hidden = !state.user;
    this.sendButton.disabled = true;
    this.signInButton.hidden = Boolean(state.user) || state.isPending;
    this.status.textContent = state.isPending ? 'Connecting…' : state.user ? 'Loading messages…' : 'Sign in to read and join the chat.';
    if (state.user) void this.start(state.user.id, this.generation);
  }

  private setRoom(room: ChatRoom): void {
    if (this.room === room) return;
    this.room = room;
    this.list.setAttribute('aria-label', `${ROOMS.find(item => item.id === room)!.label} chat messages`);
    for (const [id, tab] of this.roomTabs) {
      tab.classList.toggle('active', id === room);
      tab.setAttribute('aria-selected', String(id === room));
    }
    this.input.value = '';
    this.counter.textContent = '0/500';
    this.authChanged(getAuthState());
  }

  private async startCount(generation: number): Promise<void> {
    const [client, api] = await Promise.all([getConvexClient(), getConvexApi()]);
    if (!client || !api || !this.active || generation !== this.generation) {
      if (this.active && generation === this.generation) this.onlineCount.textContent = 'Online unavailable';
      return;
    }
    const room = this.room;
    const refresh = () => {
      this.stopCount?.();
      this.stopCount = client.onUpdate(api.chatMessages.countOnline,
        { room, refresh: Math.floor(Date.now() / 30_000) },
        count => {
          if (this.active && generation === this.generation && this.room === room) {
            this.onlineCount.textContent = `${count} online`;
          }
        },
        () => {
          if (this.active && generation === this.generation) this.onlineCount.textContent = 'Online unavailable';
        });
    };
    refresh();
    this.countInterval = window.setInterval(refresh, 30_000);
  }

  private async start(userId: string, generation: number): Promise<void> {
    const [client, api] = await Promise.all([getConvexClient(), getConvexApi()]);
    if (!client || !api || !await waitForConvexAuthForUser(userId)) {
      if (this.isCurrent(userId, generation)) this.status.textContent = 'Chat is unavailable right now.';
      return;
    }
    if (!this.isCurrent(userId, generation)) return;
    const user = getAuthState().user;
    if (!user) return;
    try {
      await client.mutation(api.chatMessages.setMyProfile, {
        displayName: (user.username?.trim() || user.name.trim() || 'Member').slice(0, 60),
        avatarUrl: user.image?.startsWith('https://') ? user.image : undefined,
      });
    } catch {
      if (this.isCurrent(userId, generation)) this.status.textContent = 'Could not connect your profile. Reopen chat to try again.';
      return;
    }
    if (!this.isCurrent(userId, generation)) return;
    this.client = client;
    this.sendButton.disabled = false;
    void this.heartbeat(userId, generation);
    this.heartbeatInterval = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') void this.heartbeat(userId, generation);
    }, 45_000);
    this.stopUpdates = client.onUpdate(api.chatMessages.list, { room: this.room, paginationOpts: { cursor: null, numItems: 30 } }, result => {
      if (!this.isCurrent(userId, generation)) return;
      const nearBottom = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 90;
      this.current = result.page;
      if (!this.older.length) {
        this.cursor = result.continueCursor;
        this.done = result.isDone;
      }
      this.status.textContent = '';
      this.render(userId);
      if (nearBottom) this.list.scrollTop = this.list.scrollHeight;
    }, () => {
      if (this.isCurrent(userId, generation)) this.status.textContent = 'Messages could not load. Try reopening chat.';
    });
  }

  private async heartbeat(userId: string, generation: number): Promise<void> {
    if (!this.client || !this.isCurrent(userId, generation)) return;
    try {
      const api = await getConvexApi();
      if (!api || !await waitForConvexAuthForUser(userId) || !this.isCurrent(userId, generation)) return;
      await this.client.mutation(api.chatMessages.heartbeat, { room: this.room });
    } catch {
      // Chat messages still work if the presence indicator is temporarily unavailable.
    }
  }

  private isCurrent(userId: string, generation: number): boolean {
    return this.active && generation === this.generation && getAuthState().user?.id === userId;
  }

  private async loadOlder(): Promise<void> {
    const userId = getAuthState().user?.id;
    if (!userId || !this.client || this.done || this.loadingOlder || !this.cursor) return;
    const generation = this.generation;
    const cursor = this.cursor;
    this.loadingOlder = true;
    this.olderButton.disabled = true;
    try {
      const api = await getConvexApi();
      if (!api || !await waitForConvexAuthForUser(userId) || !this.isCurrent(userId, generation)) return;
      const result = await this.client.query(api.chatMessages.list, { room: this.room, paginationOpts: { cursor, numItems: 30 } });
      if (!this.isCurrent(userId, generation)) return;
      this.older.push(...result.page);
      this.cursor = result.continueCursor;
      this.done = result.isDone;
      this.render(userId);
    } catch {
      if (this.isCurrent(userId, generation)) this.status.textContent = 'Could not load earlier messages.';
    } finally {
      this.loadingOlder = false;
      this.olderButton.disabled = false;
    }
  }

  private render(userId: string): void {
    this.closeMenu();
    const unique = new Map([...this.older, ...this.current].map(message => [message._id, message]));
    const messages = [...unique.values()].sort((a, b) => a.createdAt - b.createdAt);
    this.olderButton.hidden = this.done;
    const rows = messages.map(message => {
      const row = document.createElement('article');
      row.className = 'map-chat-message';
      const avatar = document.createElement('span');
      avatar.className = 'map-chat-avatar';
      if (message.avatarUrl?.startsWith('https://')) {
        const img = document.createElement('img');
        img.src = message.avatarUrl;
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.loading = 'lazy';
        avatar.append(img);
      } else {
        avatar.textContent = message.displayName.slice(0, 1).toUpperCase();
      }
      const content = document.createElement('div');
      const meta = document.createElement('div');
      meta.className = 'map-chat-meta';
      const name = document.createElement('strong');
      name.textContent = message.displayName;
      const time = document.createElement('time');
      time.dateTime = new Date(message.createdAt).toISOString();
      time.textContent = new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      meta.append(name, time);
      const actions = document.createElement('div');
      actions.className = 'map-chat-actions';
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'map-chat-menu-trigger';
      trigger.textContent = '⋯';
      trigger.setAttribute('aria-label', `Actions for ${message.displayName}'s message`);
      trigger.setAttribute('aria-haspopup', 'menu');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.addEventListener('click', () => this.toggleMenu(actions, trigger, message, userId), { signal: this.listeners.signal });
      actions.append(trigger);
      meta.append(actions);
      if (message.replyDisplayName && message.replyExcerpt) {
        const quote = document.createElement('div');
        quote.className = 'map-chat-reply-quote';
        const author = document.createElement('strong');
        author.textContent = message.replyDisplayName;
        const excerpt = document.createElement('span');
        excerpt.textContent = message.replyExcerpt;
        quote.append(author, excerpt);
        content.append(meta, quote);
      } else {
        content.append(meta);
      }
      const body = document.createElement('p');
      body.textContent = message.body;
      content.append(body);
      row.append(avatar, content);
      return row;
    });
    this.list.replaceChildren(...rows);
    if (!messages.length) this.status.textContent = 'No messages yet. Start the conversation.';
  }

  private closeMenu(): void {
    if (!this.openMenu) return;
    const trigger = this.openMenu.parentElement?.querySelector('.map-chat-menu-trigger');
    trigger?.setAttribute('aria-expanded', 'false');
    this.openMenu.remove();
    this.openMenu = null;
  }

  private toggleMenu(actions: HTMLElement, trigger: HTMLButtonElement, message: Message, userId: string): void {
    const wasOpen = this.openMenu?.parentElement === actions;
    this.closeMenu();
    if (wasOpen) return;
    const menu = document.createElement('div');
    menu.className = 'map-chat-menu';
    menu.setAttribute('role', 'menu');
    if (trigger.getBoundingClientRect().bottom + 140 > this.list.getBoundingClientRect().bottom) {
      menu.classList.add('map-chat-menu-up');
    }
    const option = (label: string, action: () => void) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.textContent = label;
      button.addEventListener('click', () => { this.closeMenu(); action(); }, { signal: this.listeners.signal });
      menu.append(button);
    };
    option('Reply', () => this.setReply(message));
    option('Copy', () => void this.copyMessage(message.body));
    if (message.userId === userId) option('Delete', () => void this.remove(message._id));
    actions.append(menu);
    this.openMenu = menu;
    trigger.setAttribute('aria-expanded', 'true');
    menu.querySelector('button')?.focus();
  }

  private setReply(message: Message | null): void {
    this.replyTarget = message;
    this.replyBar.hidden = !message;
    if (!message) { this.replyBar.replaceChildren(); return; }
    const detail = document.createElement('span');
    detail.textContent = `Replying to ${message.displayName}: ${message.body.slice(0, 100)}`;
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = '×';
    cancel.setAttribute('aria-label', 'Cancel reply');
    cancel.addEventListener('click', () => this.setReply(null), { signal: this.listeners.signal });
    this.replyBar.replaceChildren(detail, cancel);
    this.input.focus();
  }

  private async copyMessage(body: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(body);
      this.status.textContent = 'Message copied.';
    } catch {
      this.status.textContent = 'Could not copy message.';
    }
  }

  private async send(): Promise<void> {
    const userId = getAuthState().user?.id;
    const body = this.input.value.trim();
    if (!userId || !body || this.sending || !this.client) return;
    const generation = this.generation;
    const room = this.room;
    const replyTo = this.replyTarget?._id;
    this.sending = true;
    this.sendButton.disabled = true;
    try {
      const api = await getConvexApi();
      if (!api || !await waitForConvexAuthForUser(userId) || !this.isCurrent(userId, generation)) return;
      await this.client.mutation(api.chatMessages.send, { room, body, replyTo });
      if (!this.isCurrent(userId, generation)) return;
      this.input.value = '';
      this.counter.textContent = '0/500';
      if (this.replyTarget?._id === replyTo) this.setReply(null);
      this.status.textContent = '';
    } catch (error) {
      if (this.isCurrent(userId, generation)) this.status.textContent = error instanceof Error ? error.message : 'Could not send message.';
    } finally {
      this.sending = false;
      this.sendButton.disabled = !this.client || !this.isCurrent(userId, generation);
    }
  }

  private async remove(id: Id<'chatMessages'>): Promise<void> {
    const userId = getAuthState().user?.id;
    if (!userId || !this.client || !await waitForConvexAuthForUser(userId)) return;
    try {
      const api = await getConvexApi();
      if (!api || getAuthState().user?.id !== userId) return;
      await this.client.mutation(api.chatMessages.remove, { id });
      this.older = this.older.filter(message => message._id !== id);
      if (this.active && getAuthState().user?.id === userId) this.render(userId);
    } catch {
      this.status.textContent = 'Could not delete message.';
    }
  }
}
