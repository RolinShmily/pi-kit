export interface Snippet {
	/** Absolute source path when loaded from Pi; stable across menu refreshes. */
	id: string;
	name: string;
	description: string;
	placement: "prepend" | "append";
	order: number;
	body: string;
}

export interface PromptCardData {
	snippets: {
		id: string;
		name: string;
		placement: "prepend" | "append";
		order: number;
		body: string;
	}[];
}
