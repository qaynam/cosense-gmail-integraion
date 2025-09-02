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

	await redis.json.set(`user:${userId}`, '$', user as unknown as Record<string, unknown>);
	await redis.set(`googleId:${googleId}`, userId);

	return user;
}

export async function getUserFromGoogleId(googleId: string): Promise<User | null> {
	const userId = await redis.get(`googleId:${googleId}`);
	if (!userId) {
		return null;
	}

	const userData = (await redis.json.get(`user:${userId}`, '$')) as User[] | null;
	return userData && userData.length > 0 ? userData[0] : null;
}

export async function updateUserConfig(userId: number, config: Partial<UserConfig>) {
	// Get existing config or use empty object
	const existingConfigData = await redis.json.get<UserConfig[] | null>(`userConfig:${userId}`, '$');
	const existingConfig =
		existingConfigData && existingConfigData.length > 0 ? existingConfigData[0] : {};

	// Merge with new config
	const updatedConfig = { ...existingConfig, ...config };

	// Save the complete updated config
	await redis.json.set(`userConfig:${userId}`, '$', updatedConfig);
}

export async function getUserConfig(userId: number): Promise<UserConfig | null> {
	const configData = (await redis.json.get(`userConfig:${userId}`, '$')) as UserConfig[] | null;
	return configData && configData.length > 0 ? configData[0] : null;
}

export async function saveUserToken(userId: number, userToken: UserToken) {
	const tokenToSave = {
		...userToken,
		refreshToken: encryptToken(userToken.refreshToken)
	};

	await redis.json.set(`token:${userId}`, '$', tokenToSave);
}

export async function getUserToken(userId: number): Promise<UserToken | null> {
	const tokenData = (await redis.json.get(`token:${userId}`, '$')) as UserToken[] | null;
	if (!tokenData || tokenData.length === 0) {
		return null;
	}

	return {
		...tokenData[0],
		refreshToken: decryptToken(tokenData[0].refreshToken)
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
