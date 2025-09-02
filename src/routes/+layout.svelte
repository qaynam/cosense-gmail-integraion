<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<title>Cosense Gmail Integration</title>
</svelte:head>

<main class="container mx-auto mt-20 rounded-lg border border-neutral-200 bg-white p-6">
	<h1 class="mb-6 text-center text-2xl font-bold">Cosense Gmail Integration</h1>
	{@render children()}
</main>
