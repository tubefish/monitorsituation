import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const MAX_LENGTH = 500;
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 5;
const ACTIVE_WINDOW_MS = 90_000;
const roomValidator = v.union(
  v.literal("global"),
  v.literal("geopolitics"),
  v.literal("markets"),
  v.literal("crypto"),
);

/** Room messages are visible only to users with a verified Clerk identity. */
export const list = query({
  args: { room: roomValidator, paginationOpts: paginationOptsValidator },
  handler: async (ctx, { room, paginationOpts }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) throw new Error("Sign in to view chat");
    const result = await ctx.db.query("chatMessages")
      .withIndex("by_room_created", q => q.eq("room", room === "global" ? undefined : room))
      .order("desc")
      .paginate({ ...paginationOpts, numItems: Math.min(50, Math.max(1, paginationOpts.numItems)) });
    const profiles = new Map<string, Promise<{ displayName: string; avatarUrl?: string } | null>>();
    return {
      ...result,
      page: await Promise.all(result.page.map(async ({ _id, userId, displayName, avatarUrl, body, createdAt, replyTo, replyDisplayName, replyExcerpt }) => {
        if (!profiles.has(userId)) {
          profiles.set(userId, ctx.db.query("chatProfiles")
            .withIndex("by_user", q => q.eq("userId", userId)).unique());
        }
        const profile = await profiles.get(userId);
        return {
          _id, userId, displayName: profile?.displayName ?? displayName,
          avatarUrl: profile?.avatarUrl ?? avatarUrl, body, createdAt,
          replyTo, replyDisplayName, replyExcerpt,
        };
      })),
    };
  },
});

/** Recent signed-in participants in this room, including only those active in the past 90 seconds. */
export const countOnline = query({
  args: { room: roomValidator, refresh: v.number() },
  handler: async (ctx, { room, refresh }) => {
    void refresh; // A new 30-second bucket refreshes the reactive query when everyone leaves.
    const active = await ctx.db.query("chatPresence")
      .withIndex("by_room_seen", q => q.eq("room", room).gte("lastSeenAt", Date.now() - ACTIVE_WINDOW_MS))
      .collect();
    return active.length;
  },
});

export const heartbeat = mutation({
  args: { room: roomValidator },
  handler: async (ctx, { room }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) throw new Error("Sign in to join chat");
    const now = Date.now();
    const existing = await ctx.db.query("chatPresence")
      .withIndex("by_user", q => q.eq("userId", identity.subject)).unique();
    if (existing) {
      if (existing.room !== room || now - existing.lastSeenAt >= 30_000) {
        await ctx.db.patch(existing._id, { room, lastSeenAt: now });
      }
    } else {
      await ctx.db.insert("chatPresence", { userId: identity.subject, room, lastSeenAt: now });
    }
  },
});

/** The caller's Clerk identity owns this profile; no user ID is accepted from the browser. */
export const setMyProfile = mutation({
  args: { displayName: v.string(), avatarUrl: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) throw new Error("Sign in to update chat profile");
    const displayName = args.displayName.trim();
    if (!displayName || displayName.length > 60) throw new Error("Invalid display name");
    const avatarUrl = args.avatarUrl?.trim();
    if (avatarUrl && (avatarUrl.length > 2048 || !avatarUrl.startsWith("https://"))) {
      throw new Error("Invalid profile photo");
    }
    const existing = await ctx.db.query("chatProfiles")
      .withIndex("by_user", q => q.eq("userId", identity.subject)).unique();
    if (existing) {
      if (existing.displayName !== displayName || existing.avatarUrl !== avatarUrl) {
        await ctx.db.patch(existing._id, { displayName, avatarUrl });
      }
    } else {
      await ctx.db.insert("chatProfiles", { userId: identity.subject, displayName, avatarUrl });
    }
  },
});

export const send = mutation({
  args: { room: roomValidator, body: v.string(), replyTo: v.optional(v.id("chatMessages")) },
  handler: async (ctx, { room, body, replyTo }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) throw new Error("Sign in to send messages");
    const cleaned = body.trim();
    if (!cleaned || cleaned.length > MAX_LENGTH) throw new Error("Messages must be 1–500 characters");
    const now = Date.now();
    const recent = await ctx.db.query("chatMessages")
      .withIndex("by_user_created", q => q.eq("userId", identity.subject))
      .order("desc")
      .take(RATE_MAX);
    if (recent.length === RATE_MAX && now - recent[RATE_MAX - 1]!.createdAt < RATE_WINDOW_MS) {
      throw new Error("You're sending too quickly. Try again in a moment.");
    }
    const profile = await ctx.db.query("chatProfiles")
      .withIndex("by_user", q => q.eq("userId", identity.subject)).unique();
    const displayName = profile?.displayName ?? ((identity.name || identity.nickname || "Member").trim().slice(0, 60) || "Member");
    const avatarUrl = profile?.avatarUrl ?? (identity.pictureUrl?.startsWith("https://") ? identity.pictureUrl : undefined);
    const parent = replyTo ? await ctx.db.get(replyTo) : null;
    if (replyTo && !parent) throw new Error("The message you're replying to is unavailable");
    if (parent && (parent.room ?? "global") !== room) throw new Error("Replies must stay in the same room");
    const parentProfile = parent ? await ctx.db.query("chatProfiles")
      .withIndex("by_user", q => q.eq("userId", parent.userId)).unique() : null;
    await ctx.db.insert("chatMessages", {
      userId: identity.subject,
      displayName,
      avatarUrl,
      room: room === "global" ? undefined : room,
      replyTo,
      replyDisplayName: parentProfile?.displayName ?? parent?.displayName,
      replyExcerpt: parent?.body.slice(0, 120),
      body: cleaned,
      createdAt: now,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("chatMessages") },
  handler: async (ctx, { id }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) throw new Error("Sign in to delete messages");
    const message = await ctx.db.get(id);
    if (!message || message.userId !== identity.subject) throw new Error("Message unavailable");
    await ctx.db.delete(id);
  },
});
