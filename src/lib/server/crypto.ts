import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { TOKEN_ENCRYPTION_KEY } from '$env/static/private';

const ALGORITHM = 'aes-256-cbc';

function getKey(): Buffer {
	return createHash('sha256').update(TOKEN_ENCRYPTION_KEY).digest();
}

export function encryptToken(token: string): string {
	const iv = randomBytes(16);
	const key = getKey();
	const cipher = createCipheriv(ALGORITHM, key, iv);
	
	let encrypted = cipher.update(token, 'utf8', 'hex');
	encrypted += cipher.final('hex');
	
	return iv.toString('hex') + ':' + encrypted;
}

export function decryptToken(encryptedToken: string): string {
	const parts = encryptedToken.split(':');
	const iv = Buffer.from(parts[0], 'hex');
	const encrypted = parts[1];
	const key = getKey();
	
	const decipher = createDecipheriv(ALGORITHM, key, iv);
	
	let decrypted = decipher.update(encrypted, 'hex', 'utf8');
	decrypted += decipher.final('utf8');
	
	return decrypted;
}