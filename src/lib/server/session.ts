import { redis } from './db';
import { encodeBase32, encodeHexLowerCase } from '@oslojs/encoding';
import { sha256 } from '@oslojs/crypto/sha2';

import type { User } from './user';
import type { RequestEvent } from '@sveltejs/kit';

interface SessionData {
	userId: number;
	expiresAt: number;
}

export interface Session extends Omit<SessionData, 'expiresAt'> {
	id: string;
	expiresAt: Date;
}

export async function validateSessionToken(token: string): Promise<SessionValidationResult> {
	const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
	const sessionData = await redis.json.get(`session:${sessionId}`, '$') as SessionData[] | null;
	
	if (!sessionData || sessionData.length === 0) {
		return { session: null, user: null };
	}
	
	const session: Session = {
		id: sessionId,
		userId: sessionData[0].userId,
		expiresAt: new Date(sessionData[0].expiresAt)
	};


	if (Date.now() >= session.expiresAt.getTime()) {
		await redis.del(`session:${sessionId}`);
		return { session: null, user: null };
	}

	const userData = await redis.json.get(`user:${session.userId}`, '$') as User[] | null;
	if (!userData || userData.length === 0) {
		return { session: null, user: null };
	}
	
	const user = userData[0];

	if (Date.now() >= session.expiresAt.getTime() - 1000 * 60 * 60 * 24 * 15) {
		session.expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
		await redis.json.set(`session:${sessionId}`, '$', {
			userId: session.userId,
			expiresAt: session.expiresAt.getTime()
		});
		await redis.expire(`session:${sessionId}`, Math.floor(30 * 24 * 60 * 60));
	}
	return { session, user };
}

export async function invalidateSession(sessionId: string): Promise<void> {
	// Get session data to find userId before deletion
	const sessionData = await redis.get<SessionData | null>(`session:${sessionId}`);
	
	await redis.del(`session:${sessionId}`);
	
	// Remove from user's session set if session existed
	if (sessionData) {
		await redis.srem(`user:${sessionData.userId}:sessions`, sessionId);
	}
}

export async function invalidateUserSessions(userId: number): Promise<void> {
	// Use a set to track user sessions for more efficient invalidation
	const userSessionsKey = `user:${userId}:sessions`;
	const sessionIds = await redis.smembers(userSessionsKey);
	
	if (sessionIds.length > 0) {
		// Delete all sessions for the user
		const sessionKeys = sessionIds.map(id => `session:${id}`);
		await redis.del(...sessionKeys);
		
		// Clear the user sessions set
		await redis.del(userSessionsKey);
	}
}

export function setSessionTokenCookie(event: RequestEvent, token: string, expiresAt: Date): void {
	event.cookies.set('session', token, {
		httpOnly: true,
		path: '/',
		secure: import.meta.env.PROD,
		sameSite: 'lax',
		expires: expiresAt
	});
}

export function deleteSessionTokenCookie(event: RequestEvent): void {
	event.cookies.set('session', '', {
		httpOnly: true,
		path: '/',
		secure: import.meta.env.PROD,
		sameSite: 'lax',
		maxAge: 0
	});
}

export function generateSessionToken(): string {
	const tokenBytes = new Uint8Array(20);
	crypto.getRandomValues(tokenBytes);
	const token = encodeBase32(tokenBytes).toLowerCase();
	return token;
}

export async function createSession(token: string, userId: number): Promise<Session> {
	const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
	const sessionDuration = 30 * 24 * 60 * 60;
	const session: Session = {
		id: sessionId,
		userId,
		expiresAt: new Date(Date.now() + sessionDuration * 1000)
	};
	
	// Store session data
	await redis.json.set(`session:${sessionId}`, '$', {
		userId: session.userId,
		expiresAt: session.expiresAt.getTime()
	});
	await redis.expire(`session:${sessionId}`, Math.floor(sessionDuration));
	
	// Add session to user's session set for efficient cleanup
	await redis.sadd(`user:${userId}:sessions`, sessionId);
	await redis.expire(`user:${userId}:sessions`, Math.floor(sessionDuration));
	
	return session;
}

type SessionValidationResult = { session: Session; user: User } | { session: null; user: null };
