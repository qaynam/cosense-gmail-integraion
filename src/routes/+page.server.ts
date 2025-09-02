import { fail, redirect } from '@sveltejs/kit';
import { deleteSessionTokenCookie, invalidateSession } from '$lib/server/session';

import type { Actions, RequestEvent } from './$types';
import { getUserConfig, updateUserConfig, type UserConfig } from '$lib/server/user';
import { getSavedEmailRecords } from '$lib/server/gmail';

export async function load(event: RequestEvent) {
	if (event.locals.session === null || event.locals.user === null) {
		return redirect(302, '/login');
	}
	const userConfig = await getUserConfig(event.locals.user.id);
	const savedEmails = await getSavedEmailRecords(event.locals.user.id);
	const isSessionIdRegistered = userConfig?.cosenseSessionId ? true : false;
	return {
		user: event.locals.user,
		userConfig: userConfig
			? {
					cosenseProjectName: userConfig.cosenseProjectName,
					isSessionIdRegistered
				}
			: null,
		savedEmails
	};
}

export const actions: Actions = {
	signout,
	saveConfig
};

async function signout(event: RequestEvent) {
	if (event.locals.session === null) {
		return fail(401);
	}
	invalidateSession(event.locals.session.id);
	deleteSessionTokenCookie(event);
	return redirect(302, '/login');
}

async function saveConfig(event: RequestEvent) {
	const user = event.locals.user;
	if (!user) {
		return fail(401);
	}

	const formData = await event.request.formData();
	const data: Partial<UserConfig> = Object.fromEntries(formData.entries());

	if (!data.cosenseProjectName && !data.cosenseSessionId) {
		return fail(400, { error: 'Please provide either project name or session ID, not both.' });
	}

	await updateUserConfig(user.id, data);

	return {
		ok: true,
		data: {
			cosenseProjectName: data.cosenseProjectName,
			isSessionIdRegistered: true
		}
	};
}
