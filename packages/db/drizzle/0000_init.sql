CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `computed_cache` (
	`league_id` text NOT NULL,
	`week` integer NOT NULL,
	`kind` text NOT NULL,
	`inputs_hash` text NOT NULL,
	`payload_json` text NOT NULL,
	`computed_at` text NOT NULL,
	PRIMARY KEY(`league_id`, `week`, `kind`, `inputs_hash`)
);
--> statement-breakpoint
CREATE TABLE `defense_vs_position` (
	`league_id` text NOT NULL,
	`season` integer NOT NULL,
	`through_week` integer NOT NULL,
	`team` text NOT NULL,
	`position` text NOT NULL,
	`pts_allowed_pg` real NOT NULL,
	`games` integer NOT NULL,
	PRIMARY KEY(`league_id`, `season`, `through_week`, `team`, `position`)
);
--> statement-breakpoint
CREATE TABLE `http_cache` (
	`url` text PRIMARY KEY NOT NULL,
	`etag` text,
	`body` text NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `league_player_week_points` (
	`league_id` text NOT NULL,
	`season` integer NOT NULL,
	`week` integer NOT NULL,
	`player_id` text NOT NULL,
	`actual_pts` real,
	`proj_pts` real,
	PRIMARY KEY(`league_id`, `season`, `week`, `player_id`)
);
--> statement-breakpoint
CREATE INDEX `lpwp_player_idx` ON `league_player_week_points` (`league_id`,`player_id`,`season`);--> statement-breakpoint
CREATE TABLE `league_users` (
	`league_id` text NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`team_name` text,
	`avatar` text,
	PRIMARY KEY(`league_id`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `leagues` (
	`league_id` text PRIMARY KEY NOT NULL,
	`season` integer NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`settings_json` text NOT NULL,
	`scoring_json` text NOT NULL,
	`roster_positions_json` text NOT NULL,
	`previous_league_id` text,
	`synced_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `matchups` (
	`league_id` text NOT NULL,
	`week` integer NOT NULL,
	`roster_id` integer NOT NULL,
	`matchup_id` integer,
	`starters_json` text NOT NULL,
	`players_points_json` text NOT NULL,
	`points` real NOT NULL,
	PRIMARY KEY(`league_id`, `week`, `roster_id`)
);
--> statement-breakpoint
CREATE INDEX `matchups_pair_idx` ON `matchups` (`league_id`,`week`,`matchup_id`);--> statement-breakpoint
CREATE TABLE `nfl_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`season` integer NOT NULL,
	`week` integer NOT NULL,
	`season_type` text NOT NULL,
	`display_week` integer NOT NULL,
	`leg` integer NOT NULL,
	`previous_season` integer,
	`season_start_date` text,
	`fetched_at` text NOT NULL,
	CONSTRAINT "nfl_state_single_row" CHECK(id = 1)
);
--> statement-breakpoint
CREATE TABLE `player_week_projection_snapshots` (
	`season` integer NOT NULL,
	`season_type` text NOT NULL,
	`week` integer NOT NULL,
	`player_id` text NOT NULL,
	`stats_json` text NOT NULL,
	`opponent` text,
	`source` text NOT NULL,
	`fetched_at` text NOT NULL,
	PRIMARY KEY(`season`, `season_type`, `week`, `player_id`)
);
--> statement-breakpoint
CREATE INDEX `pwps_season_week_idx` ON `player_week_projection_snapshots` (`season`,`week`);--> statement-breakpoint
CREATE INDEX `pwps_player_idx` ON `player_week_projection_snapshots` (`player_id`,`season`);--> statement-breakpoint
CREATE TABLE `player_week_projections` (
	`season` integer NOT NULL,
	`season_type` text NOT NULL,
	`week` integer NOT NULL,
	`player_id` text NOT NULL,
	`stats_json` text NOT NULL,
	`opponent` text,
	`source` text NOT NULL,
	`fetched_at` text NOT NULL,
	PRIMARY KEY(`season`, `season_type`, `week`, `player_id`)
);
--> statement-breakpoint
CREATE INDEX `pwp_season_week_idx` ON `player_week_projections` (`season`,`week`);--> statement-breakpoint
CREATE INDEX `pwp_player_idx` ON `player_week_projections` (`player_id`,`season`);--> statement-breakpoint
CREATE TABLE `player_week_stats` (
	`season` integer NOT NULL,
	`season_type` text NOT NULL,
	`week` integer NOT NULL,
	`player_id` text NOT NULL,
	`stats_json` text NOT NULL,
	`source` text NOT NULL,
	PRIMARY KEY(`season`, `season_type`, `week`, `player_id`, `source`)
);
--> statement-breakpoint
CREATE INDEX `pws_season_week_idx` ON `player_week_stats` (`season`,`week`);--> statement-breakpoint
CREATE INDEX `pws_player_idx` ON `player_week_stats` (`player_id`,`season`);--> statement-breakpoint
CREATE TABLE `players` (
	`player_id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`first_name` text,
	`last_name` text,
	`position` text,
	`fantasy_positions_json` text NOT NULL,
	`team` text,
	`status` text,
	`injury_status` text,
	`injury_body_part` text,
	`active` integer,
	`age` real,
	`years_exp` real,
	`depth_chart_order` integer,
	`search_rank` integer,
	`gsis_id` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `players_team_idx` ON `players` (`team`);--> statement-breakpoint
CREATE INDEX `players_position_idx` ON `players` (`position`);--> statement-breakpoint
CREATE INDEX `players_gsis_idx` ON `players` (`gsis_id`);--> statement-breakpoint
CREATE INDEX `players_search_rank_idx` ON `players` (`search_rank`);--> statement-breakpoint
CREATE TABLE `rosters` (
	`league_id` text NOT NULL,
	`roster_id` integer NOT NULL,
	`owner_id` text,
	`players_json` text NOT NULL,
	`starters_json` text NOT NULL,
	`reserve_json` text NOT NULL,
	`taxi_json` text NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`losses` integer DEFAULT 0 NOT NULL,
	`ties` integer DEFAULT 0 NOT NULL,
	`fpts` real DEFAULT 0 NOT NULL,
	`fpts_against` real DEFAULT 0 NOT NULL,
	`waiver_budget_used` integer DEFAULT 0 NOT NULL,
	`synced_at` text NOT NULL,
	PRIMARY KEY(`league_id`, `roster_id`)
);
--> statement-breakpoint
CREATE INDEX `rosters_owner_idx` ON `rosters` (`league_id`,`owner_id`);--> statement-breakpoint
CREATE TABLE `schedule` (
	`season` integer NOT NULL,
	`week` integer NOT NULL,
	`game_id` text NOT NULL,
	`game_type` text NOT NULL,
	`home` text NOT NULL,
	`away` text NOT NULL,
	`kickoff_utc` text,
	`kickoff_approximate` integer DEFAULT false NOT NULL,
	`roof` text,
	`spread_line` real,
	`total_line` real,
	`home_score` real,
	`away_score` real,
	PRIMARY KEY(`season`, `game_id`)
);
--> statement-breakpoint
CREATE INDEX `schedule_season_week_idx` ON `schedule` (`season`,`week`);--> statement-breakpoint
CREATE INDEX `schedule_home_idx` ON `schedule` (`season`,`home`);--> statement-breakpoint
CREATE INDEX `schedule_away_idx` ON `schedule` (`season`,`away`);--> statement-breakpoint
CREATE TABLE `sync_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job` text NOT NULL,
	`requested_at` text NOT NULL,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`started_at` text,
	`finished_at` text,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `sync_requests_status_idx` ON `sync_requests` (`status`,`id`);--> statement-breakpoint
CREATE INDEX `sync_requests_job_idx` ON `sync_requests` (`job`,`requested_at`);--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text NOT NULL,
	`calls_made` integer DEFAULT 0 NOT NULL,
	`rows_changed` integer DEFAULT 0 NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `sync_runs_job_idx` ON `sync_runs` (`job`,`id`);--> statement-breakpoint
CREATE INDEX `sync_runs_job_status_idx` ON `sync_runs` (`job`,`status`,`id`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`league_id` text NOT NULL,
	`transaction_id` text NOT NULL,
	`week` integer NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`adds_json` text,
	`drops_json` text,
	`waiver_bid` real,
	`roster_ids_json` text NOT NULL,
	`creator` text,
	`created_at` integer NOT NULL,
	`status_updated_at` integer,
	`draft_picks_json` text DEFAULT '[]' NOT NULL,
	`waiver_budget_json` text DEFAULT '[]' NOT NULL,
	`consenter_ids_json` text,
	PRIMARY KEY(`league_id`, `transaction_id`)
);
--> statement-breakpoint
CREATE INDEX `transactions_week_idx` ON `transactions` (`league_id`,`week`,`created_at`);--> statement-breakpoint
CREATE INDEX `transactions_created_idx` ON `transactions` (`league_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `trending` (
	`player_id` text NOT NULL,
	`type` text NOT NULL,
	`count` integer NOT NULL,
	`lookback_hours` integer NOT NULL,
	`fetched_at` text NOT NULL,
	PRIMARY KEY(`player_id`, `type`, `lookback_hours`)
);
--> statement-breakpoint
CREATE TABLE `usage_week` (
	`season` integer NOT NULL,
	`week` integer NOT NULL,
	`player_id` text NOT NULL,
	`team` text,
	`snap_pct` real,
	`targets` real,
	`target_share` real,
	`air_yards_share` real,
	`carries` real,
	`carry_share` real,
	`rz_touches` real,
	PRIMARY KEY(`season`, `week`, `player_id`)
);
--> statement-breakpoint
CREATE INDEX `usage_player_idx` ON `usage_week` (`player_id`,`season`);