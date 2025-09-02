import { gmail_v1, google } from 'googleapis';
import { getValidAccessToken } from './user';
import { redis } from './db';
import * as htmlToText from 'html-to-text';

export interface GmailMessage {
	id: string;
	threadId: string;
	subject: string;
	body: string;
	from: string;
	to: string;
	date: string;
	returnPath?: string;
	messageId?: string;
	replyTo?: string;
}

export interface SavedEmailRecord {
	[emailId: string]: {
		pageTitle: string;
		importedAt: string;
	};
}

export async function getGmailClient(userId: number): Promise<gmail_v1.Gmail | null> {
	const accessToken = await getValidAccessToken(userId);
	if (!accessToken) {
		return null;
	}

	const auth = new google.auth.OAuth2();
	auth.setCredentials({ access_token: accessToken });

	return google.gmail({ version: 'v1', auth });
}

export async function getCosenseEmails(userId: number, limit?: number): Promise<string[]> {
	const gmail = await getGmailClient(userId);
	if (!gmail) {
		throw new Error('Failed to authenticate with Gmail');
	}

	try {
		const allMessages: string[] = [];
		let pageToken: string | undefined = undefined;
		const maxResults = 500; // Gmail API maximum per request

		do {
			console.log(`Fetching emails for user ${userId}, page token: ${pageToken || 'first page'}`);

			const response: any = await gmail.users.messages.list({
				userId: 'me',
				q: 'label:cosense',
				maxResults,
				pageToken
			});

			const messages = response.data.messages?.map((msg: any) => msg.id!) || [];
			allMessages.push(...messages);

			pageToken = response.data.nextPageToken || undefined;

			console.log(`Fetched ${messages.length} emails, total so far: ${allMessages.length}`);

			// Check if we've reached the limit
			if (limit && allMessages.length >= limit) {
				console.log(`Reached limit of ${limit} emails for user ${userId}`);
				return allMessages.slice(0, limit);
			}

			// Add a small delay to avoid rate limiting
			if (pageToken) {
				await new Promise((resolve) => setTimeout(resolve, 200));
			}
		} while (pageToken);

		console.log(`Total emails found for user ${userId}: ${allMessages.length}`);
		return allMessages;
	} catch (error) {
		console.error('Failed to get Gmail messages:', error);
		throw error;
	}
}

export async function getSavedEmailRecords(userId: number): Promise<SavedEmailRecord> {
	return (await redis.get<SavedEmailRecord | null>(`userSavedEmails:${userId}`)) || {};
}

export async function getUnsavedEmailIds(userId: number, limit?: number): Promise<string[]> {
	const emailIds = await getCosenseEmails(userId, limit);
	const savedEmails = await getSavedEmailRecords(userId);
	const savedEmailIds = Object.keys(savedEmails);

	return emailIds.filter((id) => !savedEmailIds.includes(id));
}

export async function getEmailContent(
	userId: number,
	messageId: string
): Promise<GmailMessage | null> {
	const gmail = await getGmailClient(userId);
	if (!gmail) {
		throw new Error('Failed to authenticate with Gmail');
	}

	try {
		const response: any = await gmail.users.messages.get({
			userId: 'me',
			id: messageId,
			format: 'full'
		});

		const message: any = response.data;
		if (!message) {
			return null;
		}

		// Extract headers
		const headers: any[] = message.payload?.headers || [];
		const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
		const from = headers.find((h: any) => h.name === 'From')?.value || '';
		const to = headers.find((h: any) => h.name === 'To')?.value || '';
		const date = headers.find((h: any) => h.name === 'Date')?.value || '';
		const returnPath = headers.find((h: any) => h.name === 'Return-Path')?.value;
		const rfcMessageId = headers.find((h: any) => h.name === 'Message-ID')?.value;
		const replyTo = headers.find((h: any) => h.name === 'Reply-To')?.value;

		// Extract body
		let body = '';
		if (message.payload) {
			body = await extractBody(message.payload);
		}

		return {
			id: messageId, // Gmail API message ID
			threadId: message.threadId || '',
			subject,
			body,
			from,
			to,
			date,
			returnPath,
			messageId: rfcMessageId, // RFC Message-ID header
			replyTo
		};
	} catch (error) {
		console.error(`Failed to get email content for ${messageId}:`, error);
		return null;
	}
}

async function extractBody(payload: gmail_v1.Schema$MessagePart): Promise<string> {
	let body = '';

	if (payload.body?.data) {
		const content = Buffer.from(payload.body.data, 'base64').toString('utf-8');
		if (payload.mimeType === 'text/html') {
			body = htmlToText.convert(content);
		} else {
			body = content;
		}
	}

	if (payload.parts) {
		for (const part of payload.parts) {
			if (part.mimeType === 'text/plain' && part.body?.data) {
				body = Buffer.from(part.body.data, 'base64').toString('utf-8');
				break;
			}
		}

		// If no plain text found, try HTML
		if (!body) {
			for (const part of payload.parts) {
				if (part.mimeType === 'text/html' && part.body?.data) {
					const htmlContent = Buffer.from(part.body.data, 'base64').toString('utf-8');
					body = htmlToText.convert(htmlContent);
					break;
				}
			}
		}
	}

	return body;
}

export async function saveEmailRecord(
	userId: number,
	emailId: string,
	pageTitle: string
): Promise<void> {
	const savedEmails = await getSavedEmailRecords(userId);
	savedEmails[emailId] = {
		pageTitle,
		importedAt: new Date().toISOString()
	};
	await redis.set(`userSavedEmails:${userId}`, JSON.stringify(savedEmails));
}

export async function removeEmailRecord(userId: number, emailId: string): Promise<void> {
	const savedEmails = await getSavedEmailRecords(userId);
	delete savedEmails[emailId];
	await redis.set(`userSavedEmails:${userId}`, JSON.stringify(savedEmails));
}
