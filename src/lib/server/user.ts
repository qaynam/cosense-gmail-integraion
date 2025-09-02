import { redis } from './db';
import { encryptToken, decryptToken } from './crypto';
import { google } from './oauth';

export interface User {
	id: number;
	email: string;
	googleId: string;
	name: string;
	picture: string;
}

export interface UserConfig {
	cosenseProjectName: string;
	cosenseSessionId: string;
}

export interface UserToken {
	accessToken: string;
	refreshToken: string;
	scope: string[];
	tokenType: string;
	accessTokenExpiresAt: string;
}

export async function createUser(
	googleId: string,
	email: string,
	name: string,
	picture: string
): Promise<User> {
	const userId = Date.now();
	const user: User = {
		id: userId,
		googleId,
		email,
		name,
		picture
	};

	await redis.set(`user:${userId}`, JSON.stringify(user));
	await redis.set(`googleId:${googleId}`, userId);

	return user;
}

export async function getUserFromGoogleId(googleId: string): Promise<User | null> {
	const userId = await redis.get(`googleId:${googleId}`);
	if (!userId) {
		return null;
	}

	return await redis.get<User | null>(`user:${userId}`);
}

export async function updateUserConfig(userId: number, config: Partial<UserConfig>) {
	const existingConfig = (await redis.get(`userConfig:${userId}`)) || {};
	const updatedConfig = { ...existingConfig, ...config };
	await redis.set(`userConfig:${userId}`, JSON.stringify(updatedConfig));
}

export async function getUserConfig(userId: number): Promise<UserConfig | null> {
	return await redis.get<UserConfig | null>(`userConfig:${userId}`);
}

export async function saveUserToken(userId: number, userToken: UserToken) {
	const tokenToSave = {
		...userToken,
		refreshToken: encryptToken(userToken.refreshToken)
	};

	await redis.set(`token:${userId}`, JSON.stringify(tokenToSave));
}

export async function getUserToken(userId: number): Promise<UserToken | null> {
	const tokenData = await redis.get<UserToken | null>(`token:${userId}`);
	if (!tokenData) {
		return null;
	}

	return {
		...tokenData,
		refreshToken: decryptToken(tokenData.refreshToken)
	};
}

export async function refreshAccessToken(userId: number): Promise<string | null> {
	const userToken = await getUserToken(userId);
	if (!userToken || !userToken.refreshToken) {
		return null;
	}

	try {
		const tokens = await google.refreshAccessToken(userToken.refreshToken);

		const updatedToken: UserToken = {
			...userToken,
			accessToken: tokens.accessToken(),
			accessTokenExpiresAt: tokens.accessTokenExpiresAt().toISOString()
		};

		await saveUserToken(userId, updatedToken);
		return tokens.accessToken();
	} catch (error) {
		console.error('Failed to refresh token:', error);
		return null;
	}
}

export async function getValidAccessToken(userId: number): Promise<string | null> {
	const userToken = await getUserToken(userId);
	if (!userToken) {
		return null;
	}

	const expiresAt = new Date(userToken.accessTokenExpiresAt);
	const now = new Date();

	// Check if token expires within the next 5 minutes
	if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
		return await refreshAccessToken(userId);
	}

	return userToken.accessToken;
}
