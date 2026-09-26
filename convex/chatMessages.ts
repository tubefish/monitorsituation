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
    return {
      ...result,
      page: result.page.map(({ _id, userId, displayName, avatarUrl, body, createdAt }) => ({
        _id, userId, displayName, avatarUrl, body, createdAt,
      })),
    };
  },
});

export const send = mutation({
  args: { body: v.string() },
  handler: async (ctx, { body }) => {
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
    const displayName = (identity.name || identity.nickname || "Member").trim().slice(0, 60) || "Member";
    const avatarUrl = identity.pictureUrl?.startsWith("https://") ? identity.pictureUrl : undefined;
    await ctx.db.insert("chatMessages", {
      userId: identity.subject,
      displayName,
      avatarUrl,
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
