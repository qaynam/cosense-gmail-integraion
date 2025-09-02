import { google } from '$lib/server/oauth';
import { createSession, generateSessionToken, setSessionTokenCookie } from '$lib/server/session';
import { createUser, getUserFromGoogleId, saveUserToken } from '$lib/server/user';
import { decodeIdToken } from 'arctic';

import type { OAuth2Tokens } from 'arctic';
import type { RequestEvent } from './$types';

type GoogleClaims = {
	iss: string;
	azp: string;
	aud: string;
	sub: string;
	email: string;
	email_verified: boolean;
	at_hash: string;
	name: string;
	picture: string;
	given_name: string;
	family_name: string;
	iat: number;
	exp: number;
};

export async function GET(event: RequestEvent): Promise<Response> {
	const storedState = event.cookies.get('google_oauth_state') ?? null;
	const codeVerifier = event.cookies.get('google_code_verifier') ?? null;
	const code = event.url.searchParams.get('code');
	const state = event.url.searchParams.get('state');

	if (storedState === null || codeVerifier === null || code === null || state === null) {
		return new Response('Please restart the process.', {
			status: 400
		});
	}
	if (storedState !== state) {
		return new Response('Please restart the process.', {
			status: 400
		});
	}

	let tokens: OAuth2Tokens;
	try {
		tokens = await google.validateAuthorizationCode(code, codeVerifier);
	} catch (e) {
		console.error('Error validating authorization code:', e);
		return new Response('Please restart the process.', {
			status: 400
		});
	}

	const claims = decodeIdToken(tokens.idToken()) as GoogleClaims;
	const googleId = claims.sub;
	const name = claims.name;
	const picture = claims.picture;
	const email = claims.email;

	let user = await getUserFromGoogleId(googleId);
	if (user !== null) {
		const sessionToken = generateSessionToken();
		const session = await createSession(sessionToken, user.id);
		setSessionTokenCookie(event, sessionToken, session.expiresAt);
	} else {
		user = await createUser(googleId, email, name, picture);
		const sessionToken = generateSessionToken();
		const session = await createSession(sessionToken, user.id);
		setSessionTokenCookie(event, sessionToken, session.expiresAt);
	}

	await saveUserToken(user.id, {
		accessToken: tokens.accessToken(),
		refreshToken: tokens.refreshToken(),
		scope: tokens.scopes(),
		tokenType: tokens.tokenType(),
		accessTokenExpiresAt: tokens.accessTokenExpiresAt().toISOString()
	});

	return new Response(null, {
		status: 302,
		headers: {
			Location: '/'
		}
	});
}
