import { getUserConfig } from './user';
import type { GmailMessage } from './gmail';

export interface CosenseImportResult {
	success: boolean;
	pageTitle?: string;
	message?: string;
	error?: string;
	details?: unknown;
}

export async function importToCosense(
	userId: number,
	email: GmailMessage
): Promise<CosenseImportResult> {
	try {
		if (!email.threadId || !email.subject || !email.body) {
			return { success: false, error: 'Missing required fields' };
		}

		const userConfig = await getUserConfig(userId);
		if (!userConfig || !userConfig.cosenseSessionId || !userConfig.cosenseProjectName) {
			return { success: false, error: 'Cosense configuration not found' };
		}

		const pageTitle = `(📮Email) | ${email.subject}`;

		const csrfToken = await getCsrfToken(userConfig.cosenseSessionId);

		// Check if page exists
		const checkUrl = `https://scrapbox.io/api/pages/${userConfig.cosenseProjectName}/${encodeURIComponent(pageTitle)}`;
		try {
			const checkResponse = await fetch(checkUrl, {
				method: 'GET',
				headers: {
					cookie: `connect.sid=${userConfig.cosenseSessionId}`
				}
			});

			if (checkResponse.ok) {
				// Page exists, check if it has descriptions
				const pageData = await checkResponse.json();
				if (pageData.descriptions && pageData.descriptions.length > 0) {
					return {
						success: false,
						error: 'Page already exists with content'
					};
				}
				// Page exists but no content, we can proceed to import
			} else if (checkResponse.status !== 404) {
				// Some other error occurred
				throw new Error(`Check request failed with status ${checkResponse.status}`);
			}
			// 404 means page doesn't exist, which is fine
		} catch (checkError) {
			console.error('Error checking page existence:', checkError);
			// Continue with import attempt even if check fails
		}

		// Convert email content to Scrapbox format with metadata
		const metadataLines = formatEmailMetadata(email);

		// Escape square brackets in email body and split into lines
		const escapedBody = escapeSquareBrackets(email.body);
		const bodyLines = escapedBody.replace(/\r\n/g, '\n').split('\n');

		const lines = [
			pageTitle,
			'',
			...metadataLines,
			...bodyLines,
			'',
			`#Eメールからの自動インポート`
		];

		// Create the import data
		const importData = {
			pages: [
				{
					title: pageTitle,
					lines
				}
			]
		};

		// Create FormData for multipart/form-data
		const formData = new FormData();
		formData.append(
			'import-file',
			new Blob([JSON.stringify(importData)], { type: 'application/json' }),
			'import.json'
		);

		// Import to Cosense
		const importUrl = `https://scrapbox.io/api/page-data/import/${userConfig.cosenseProjectName}.json`;
		const importResponse = await fetch(importUrl, {
			method: 'POST',
			headers: {
				cookie: `connect.sid=${userConfig.cosenseSessionId}`,
				'X-CSRF-TOKEN': csrfToken
			},
			body: formData
		});

		if (!importResponse.ok) {
			const errorText = await importResponse.text();
			console.error('Import failed:', errorText);
			return {
				success: false,
				error: `Import failed: ${importResponse.status} ${importResponse.statusText}`,
				details: errorText
			};
		}

		const importResult = await importResponse.json();

		// Call import-finish API
		const finishUrl = `https://scrapbox.io/api/page-data/import-finish/${userConfig.cosenseProjectName}.json`;
		try {
			const finishResponse = await fetch(finishUrl, {
				method: 'POST',
				headers: {
					cookie: `connect.sid=${userConfig.cosenseSessionId}`,
					'X-CSRF-TOKEN': csrfToken
				}
			});

			if (!finishResponse.ok) {
				const errorText = await finishResponse.text();
				console.error('Import finish failed:', errorText);
				return {
					success: false,
					error: `Import completed but finish step failed: ${finishResponse.status} ${finishResponse.statusText}`,
					details: errorText
				};
			}

			const finishResult = await finishResponse.json();
			if (finishResult.message !== 'success') {
				console.error('Unexpected finish response:', finishResult);
				return {
					success: false,
					error: 'Import completed but finish step returned unexpected response',
					details: finishResult
				};
			}
		} catch (finishError) {
			console.error('Error calling import-finish:', finishError);
			return {
				success: false,
				error: 'Import completed but finish step failed',
				details: finishError instanceof Error ? finishError.message : 'Unknown error'
			};
		}

		return {
			success: true,
			pageTitle,
			message: `Successfully imported "${pageTitle}" to Cosense`,
			details: importResult
		};
	} catch (error) {
		console.error('Cosense import error:', error);
		return {
			success: false,
			error: 'Failed to import to Cosense',
			details: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

async function getCsrfToken(cosenseSessionId: string) {
	const res = await fetch('https://scrapbox.io/api/users/me', {
		headers: {
			'content-type': 'application/json',
			cookie: `connect.sid=${cosenseSessionId}`
		}
	});
	if (!res.ok) {
		throw new Error(`Failed to get CSRF token: ${res.status} ${res.statusText}`);
	}

	const body = await res.json();

	return body.csrfToken;
}

export async function checkPageExists(userId: number, pageTitle: string): Promise<boolean> {
	try {
		const userConfig = await getUserConfig(userId);
		if (!userConfig || !userConfig.cosenseSessionId || !userConfig.cosenseProjectName) {
			return false;
		}

		const checkUrl = `https://scrapbox.io/api/pages/${userConfig.cosenseProjectName}/${encodeURIComponent(pageTitle)}/text`;
		const checkResponse = await fetch(checkUrl, {
			method: 'GET',
			headers: {
				cookie: `connect.sid=${userConfig.cosenseSessionId}`
			}
		});

		return checkResponse.ok;
	} catch (error) {
		console.error('Error checking page existence:', error);
		return false;
	}
}

function generateGmailLink(messageId: string): string {
	// Convert Gmail API message ID to Gmail web URL format
	return `https://mail.google.com/mail/u/0/#inbox/${messageId}`;
}

function escapeSquareBrackets(text: string): string {
	// Escape square brackets in email content to prevent Scrapbox link interpretation
	// Replace [text] with `[`text`]` to display literal brackets
	return text.replace(/\[([^\]]*)\]/g, '`[`$1`]`');
}

function formatEmailMetadata(email: GmailMessage): string[] {
	const metadata: string[] = [];

	// Add Gmail direct link
	const gmailLink = generateGmailLink(email.id);
	metadata.push(`[📧 Gmailで開く ${gmailLink}]`);
	metadata.push('');

	// Format date to Japanese format
	let formattedDate = email.date;
	try {
		const date = new Date(email.date);
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		formattedDate = `${year}/${month}/${day} ${hours}:${minutes}`;
	} catch (error) {
		// Keep original format if parsing fails
		console.error('Error formatting date:', error);
	}

	// Add metadata lines
	metadata.push('code:metadata.md');
	metadata.push(` From:    ${email.from}`);
	metadata.push(` To:      ${email.to}`);
	metadata.push(` 日付:    ${formattedDate}`);
	metadata.push(` 件名:    ${email.subject}`);

	if (email.returnPath) {
		// Extract domain from return-path
		const match = email.returnPath.match(/@([^>]+)/);
		const domain = match ? match[1] : email.returnPath;
		metadata.push(` 送信元:  ${domain}`);
	}

	if (email.replyTo && email.replyTo !== email.from) {
		metadata.push(` 返信先:  ${email.replyTo}`);
	}

	if (email.messageId) {
		metadata.push(` Message-ID: ${email.messageId}`);
	}

	metadata.push(''); // Empty line after metadata

	return metadata;
}
