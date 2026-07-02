import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Cancel unsigned bets that haven't been signed 30 minutes before their match kicks off.
crons.interval("expire pre-kickoff bets", { minutes: 1 }, internal.core.expirePreKickoffBets);

export default crons;
