import type { ConvexClient } from 'convex/browser';
import type { Id } from '../../convex/_generated/dataModel';
import { getAuthState, subscribeAuthState, type AuthSession } from '@/services/auth-state';
import { openSignIn } from '@/services/clerk';
import { getConvexApi, getConvexClient, waitForConvexAuthForUser } from '@/services/convex-client';

type Message = {
  _id: Id<'chatMessages'>;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  body: string;
  createdAt: number;
};

/** One shared room. The subscription exists only while the overlay is visible. */
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
  private readonly listeners = new AbortController();
  private unsubscribeAuth: (() => void) | null = null;
  private stopUpdates: (() => void) | null = null;
  private client: ConvexClient | null = null;
  private current: Message[] = [];
  private older: Message[] = [];
  private cursor: string | null = null;
  private done = true;
  private loadingOlder = false;
  private active = false;
  private generation = 0;
  private sending = false;

  constructor(close: () => void) {
    this.element.className = 'map-experience-stage map-experience-chat';
    this.element.hidden = true;
    this.element.setAttribute('aria-label', 'Global chat');

    const header = document.createElement('header');
    const title = document.createElement('strong');
    title.textContent = 'GLOBAL CHAT';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'map-chat-close';
    closeButton.textContent = '×';
    closeButton.setAttribute('aria-label', 'Close chat');
    closeButton.addEventListener('click', close, { signal: this.listeners.signal });
    header.append(title, closeButton);

    const room = document.createElement('div');
    room.className = 'map-chat-room';
    room.textContent = 'Global';
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
    this.form.append(this.input, composerFooter);
    this.form.addEventListener('submit', event => {
      event.preventDefault();
      void this.send();
    }, { signal: this.listeners.signal });
    this.signInButton.type = 'button';
    this.signInButton.className = 'map-chat-signin';
    this.signInButton.textContent = 'Sign in to chat';
    this.signInButton.addEventListener('click', () => void openSignIn(), { signal: this.listeners.signal });
    this.element.append(header, room, this.olderButton, this.list, this.status, this.form, this.signInButton);
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
    this.unsubscribeAuth?.();
    this.listeners.abort();
    this.element.remove();
  }

  private authChanged(state: AuthSession): void {
    this.generation++;
    this.stopUpdates?.();
    this.stopUpdates = null;
    this.current = [];
    this.older = [];
    this.client = null;
    this.cursor = null;
    this.done = true;
    this.list.replaceChildren();
    if (!this.active) return;
    this.form.hidden = !state.user;
    this.sendButton.disabled = true;
    this.signInButton.hidden = Boolean(state.user) || state.isPending;
    this.status.textContent = state.isPending ? 'Connecting…' : state.user ? 'Loading messages…' : 'Sign in to read and join the chat.';
    if (state.user) void this.start(state.user.id, this.generation);
  }

  private async start(userId: string, generation: number): Promise<void> {
    const [client, api] = await Promise.all([getConvexClient(), getConvexApi()]);
    if (!client || !api || !await waitForConvexAuthForUser(userId)) {
      if (this.isCurrent(userId, generation)) this.status.textContent = 'Chat is unavailable right now.';
      return;
    }
    if (!this.isCurrent(userId, generation)) return;
    this.client = client;
    this.sendButton.disabled = false;
    this.stopUpdates = client.onUpdate(api.chatMessages.list, { paginationOpts: { cursor: null, numItems: 30 } }, result => {
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
      const result = await this.client.query(api.chatMessages.list, { paginationOpts: { cursor, numItems: 30 } });
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
      if (message.userId === userId) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'map-chat-delete';
        remove.textContent = '⋯';
        remove.title = 'Delete my message';
        remove.setAttribute('aria-label', `Delete your message from ${time.textContent}`);
        remove.addEventListener('click', () => {
          if (window.confirm('Delete this message?')) void this.remove(message._id);
        }, { signal: this.listeners.signal });
        meta.append(remove);
      }
      const body = document.createElement('p');
      body.textContent = message.body;
      content.append(meta, body);
      row.append(avatar, content);
      return row;
    });
    this.list.replaceChildren(...rows);
    if (!messages.length) this.status.textContent = 'No messages yet. Start the conversation.';
  }

  private async send(): Promise<void> {
    const userId = getAuthState().user?.id;
    const body = this.input.value.trim();
    if (!userId || !body || this.sending || !this.client) return;
    const generation = this.generation;
    this.sending = true;
    this.sendButton.disabled = true;
    try {
      const api = await getConvexApi();
      if (!api || !await waitForConvexAuthForUser(userId) || !this.isCurrent(userId, generation)) return;
      await this.client.mutation(api.chatMessages.send, { body });
      if (!this.isCurrent(userId, generation)) return;
      this.input.value = '';
      this.counter.textContent = '0/500';
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
