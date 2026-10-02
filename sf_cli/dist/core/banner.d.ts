/**
 * Build the stats line from live sources rather than hardcoded numbers, which had
 * drifted (the banner claimed 56 agents / 63 skills / 5 platforms long after the
 * registry, skill set and platform list grew). A count that cannot be read is
 * omitted rather than guessed.
 */
export declare function getBannerStats(frameworkRoot?: string): string[];
/**
 * Print the SkillFoundry ASCII banner to stdout.
 */
export declare function printBanner(): void;
