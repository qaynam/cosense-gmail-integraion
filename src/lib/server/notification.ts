export async function sendNotificationToDiscord(message: string, discordWebhookLink?: string) {
	if (!discordWebhookLink) {
		return;
	}

	try {
		const response = await fetch(discordWebhookLink, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				content: message
			})
		});

		if (!response.ok) {
			throw new Error(`Discord webhook failed with status: ${response.status}`);
		}

		return { success: true };
	} catch (error) {
		console.error('Failed to send Discord notification:', error);
		throw error;
	}
}
