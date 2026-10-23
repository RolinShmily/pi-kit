export interface Snippet {
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
