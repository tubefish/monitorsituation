import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const MAX_LENGTH = 500;
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 5;

/** The global room is visible only to users with a verified Clerk identity. */
export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) throw new Error("Sign in to view chat");
    const result = await ctx.db.query("chatMessages")
      .withIndex("by_created")
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
  args: { body: v.string(), replyTo: v.optional(v.id("chatMessages")) },
  handler: async (ctx, { body, replyTo }) => {
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
    const parentProfile = parent ? await ctx.db.query("chatProfiles")
      .withIndex("by_user", q => q.eq("userId", parent.userId)).unique() : null;
    await ctx.db.insert("chatMessages", {
      userId: identity.subject,
      displayName,
      avatarUrl,
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
