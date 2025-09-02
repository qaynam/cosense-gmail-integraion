import { redis } from './db';

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

export async function updateUserConfig(userId: number, config: UserConfig) {
	await redis.set(`userConfig:${userId}`, JSON.stringify(config));
}

export async function getUserConfig(userId: number): Promise<UserConfig | null> {
	return await redis.get<UserConfig | null>(`userConfig:${userId}`);
}
