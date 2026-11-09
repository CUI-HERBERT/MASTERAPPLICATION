CREATE TABLE `planner_state` (
  `user_id` text PRIMARY KEY NOT NULL,
  `state_json` text NOT NULL,
  `version` integer DEFAULT 1 NOT NULL,
  `updated_at` text NOT NULL
);
