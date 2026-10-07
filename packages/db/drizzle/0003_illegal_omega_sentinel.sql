CREATE TABLE `player_news_fetches` (
	`player_id` text PRIMARY KEY NOT NULL,
	`attempted_at` text NOT NULL,
	`ok` integer NOT NULL,
	`item_count` integer NOT NULL
);
