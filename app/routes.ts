import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("register", "routes/register.tsx"),
  route("join", "routes/join.tsx"),
  route("play", "routes/play.tsx"),
  route("leaderboard", "routes/leaderboard.tsx"),
  route("logout", "routes/logout.tsx"),
  // OG share card (dynamic image). T7.
  route("og/team/:teamId/:deckDate", "routes/og.team.tsx"),
] satisfies RouteConfig;
