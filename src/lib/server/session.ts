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
	const sessionData = await redis.get<SessionData | null>(`session:${sessionId}`);

	if (!sessionData) {
		return { session: null, user: null };
	}

	const session: Session = {
		id: sessionId,
		userId: sessionData.userId,
		expiresAt: new Date(sessionData.expiresAt)
	};

	if (Date.now() >= session.expiresAt.getTime()) {
		await redis.del(`session:${sessionId}`);
		return { session: null, user: null };
	}

	const user = await redis.get<User | null>(`user:${sessionData.userId}`);
	if (!user) {
		return { session: null, user: null };
	}

	if (Date.now() >= session.expiresAt.getTime() - 1000 * 60 * 60 * 24 * 15) {
		session.expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
		await redis.setex(
			`session:${sessionId}`,
			Math.floor(30 * 24 * 60 * 60),
			JSON.stringify({
				userId: session.userId,
				expiresAt: session.expiresAt.getTime()
			})
		);
	}
	return { session, user };
}

export async function invalidateSession(sessionId: string): Promise<void> {
	await redis.del(`session:${sessionId}`);
}

export async function invalidateUserSessions(userId: number): Promise<void> {
	const keys = await redis.keys(`session:*`);
	for (const key of keys) {
		const sessionData = await redis.get<SessionData | null>(key);
		if (sessionData && sessionData.userId === userId) {
			await redis.del(key);
		}
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
	await redis.setex(
		`session:${sessionId}`,
		Math.floor(sessionDuration),
		JSON.stringify({
			userId: session.userId,
			expiresAt: session.expiresAt.getTime()
		})
	);
	return session;
}

type SessionValidationResult = { session: Session; user: User } | { session: null; user: null };
