<script lang="ts">
	import { enhance } from '$app/forms';

	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();

	let cosenseProjectName = $derived(
		form?.data?.cosenseProjectName || data.userConfig?.cosenseProjectName
	);
	let isSessionIdRegistered = $derived(
		form?.data?.isSessionIdRegistered || data.userConfig?.isSessionIdRegistered
	);
	let cosenseSessionIdInput: HTMLInputElement;
	let sessionInputFocused = $state(false);

	$effect(() => {
		if (form?.error) {
			alert('❌faild: ' + form.error);
		}
	});
</script>

<h1>Hi, {data.user.name}!</h1>
<img src={data.user.picture} height="100px" width="100px" alt="profile" />
<p>Email: {data.user.email}</p>

<form method="post" use:enhance action="?/signout">
	<button class="text-red-300">Sign out</button>
</form>

<hr />

<form method="post" use:enhance action="?/saveConfig" class="mt-2">
	<div class="spac-y-4">
		{#if form?.ok}
			<p class="text-green-700">保存しました！</p>
		{/if}

		<div>
			<label for="cosenseProjectName">cosense project name</label>
			<div>
				<input
					id="cosenseProjectName"
					name="cosenseProjectName"
					type="text"
					autocomplete="off"
					bind:value={cosenseProjectName}
				/>
			</div>
		</div>
		<div>
			<label for="cosenseSessionId">cosense session id</label>
			<div>
				<input
					id="cosenseSessionId"
					name="cosenseSessionId"
					type="password"
					autocomplete="off"
					defaultValue={isSessionIdRegistered ? '********' : ''}
					disabled={!!isSessionIdRegistered}
					onfocus={() => (sessionInputFocused = true)}
					onblur={(e) => {
						sessionInputFocused = false;
						if (!e.currentTarget.value) {
							e.currentTarget.value = '********';
							e.currentTarget.disabled = true;
						}
					}}
					bind:this={cosenseSessionIdInput}
				/>
				{#if !sessionInputFocused}
					<button
						type="button"
						onclick={() => {
							cosenseSessionIdInput.disabled = false;
							cosenseSessionIdInput.value = '';
							cosenseSessionIdInput.focus();
						}}>✏️edit</button
					>
				{/if}
			</div>
		</div>

		<button type="submit" class="bg-green-500 px-2 py-1 text-white">save</button>
	</div>
</form>
