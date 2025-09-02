import { json } from '@sveltejs/kit';
import {
	getUnsavedEmailIds,
	getEmailContent,
	saveEmailRecord,
	removeEmailRecord,
	getSavedEmailRecords
} from '$lib/server/gmail';
import { importToCosense, checkPageExists } from '$lib/server/cosense';
import { redis } from '$lib/server/db';
import type { RequestEvent } from './$types';
import { CRON_SECRET } from '$env/static/private';
import type { Config } from '@sveltejs/adapter-vercel';

export const config: Config = {
	maxDuration: 300,
	runtime: 'nodejs22.x'
};

function checkAuth(event: RequestEvent): boolean {
	const authHeader =
		event.request.headers.get('authorization') || event.request.headers.get('Authorization');

	if (authHeader !== `Bearer ${CRON_SECRET}`) {
		return false;
	}

	return true;
}

export async function GET(event: RequestEvent): Promise<Response> {
	if (!checkAuth(event)) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		// Get all users who have valid tokens
		const userKeys = await redis.keys('user:*');
		const results = [];

		for (const userKey of userKeys) {
			const userIdStr = userKey.replace('user:', '');
			const userId = parseInt(userIdStr, 10);

			if (isNaN(userId)) continue;

			try {
				console.log(`Processing Gmail sync for user ${userId}...`);

				// First, check existing saved emails and remove entries where pages no longer exist
				const savedEmailRecords = await getSavedEmailRecords(userId);
				let deletedPagesCount = 0;

				for (const [emailId, record] of Object.entries(savedEmailRecords)) {
					const pageExists = await checkPageExists(userId, record.pageTitle);
					if (!pageExists) {
						console.log(`Page "${record.pageTitle}" no longer exists, removing from records`);
						await removeEmailRecord(userId, emailId);
						deletedPagesCount++;
					}
					// Small delay to avoid rate limiting
					await new Promise((resolve) => setTimeout(resolve, 200));
				}

				// Get unsaved email IDs (this will now include emails whose pages were deleted)
				// Limit to 50 emails per run to avoid timeouts and rate limits
				const EMAIL_BATCH_LIMIT = 50;
				const unsavedEmailIds = await getUnsavedEmailIds(userId, EMAIL_BATCH_LIMIT);

				if (unsavedEmailIds.length === 0 && deletedPagesCount === 0) {
					console.log(`No new emails for user ${userId}`);
					results.push({
						userId,
						processed: 0,
						deletedPages: deletedPagesCount,
						message: 'No new emails found'
					});
					continue;
				}

				console.log(`Found ${unsavedEmailIds.length} new/re-processable emails for user ${userId}`);
				if (deletedPagesCount > 0) {
					console.log(`Removed ${deletedPagesCount} deleted pages from records`);
				}

				let processedCount = 0;
				let successCount = 0;

				// Process each email
				for (const emailId of unsavedEmailIds) {
					try {
						// Get email content
						const emailContent = await getEmailContent(userId, emailId);

						if (!emailContent) {
							console.warn(`Could not retrieve content for email ${emailId}`);
							continue;
						}

						// Import to CoSense
						const importResult = await importToCosense(userId, emailContent);

						if (importResult.success && importResult.pageTitle) {
							await saveEmailRecord(userId, emailId, importResult.pageTitle);
							successCount++;
							console.log(`Successfully imported email ${emailId}: ${emailContent.subject}`);
						} else {
							console.error(`Failed to import email ${emailId}:`, importResult.error);
						}

						processedCount++;

						// Add a small delay to avoid rate limiting
						await new Promise((resolve) => setTimeout(resolve, 1000));
					} catch (emailError) {
						console.error(`Error processing email ${emailId}:`, emailError);
						processedCount++;
					}
				}

				results.push({
					userId,
					processed: processedCount,
					successful: successCount,
					failed: processedCount - successCount,
					deletedPages: deletedPagesCount,
					message: `Processed ${processedCount} emails, ${successCount} successful, ${deletedPagesCount} deleted pages cleaned up`
				});
			} catch (userError) {
				console.error(`Error processing user ${userId}:`, userError);
				results.push({
					userId,
					processed: 0,
					error: userError instanceof Error ? userError.message : 'Unknown error'
				});
			}
		}

		return json({
			success: true,
			message: 'Batch processing completed',
			results,
			totalUsers: results.length
		});
	} catch (error) {
		console.error('Batch processing error:', error);
		return json(
			{
				success: false,
				error: 'Failed to process batch Gmail sync',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
}
