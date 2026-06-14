import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("register", "routes/register.tsx"),
  route("join", "routes/join.tsx"),
  route("play", "routes/play.tsx"),
  route("leaderboard", "routes/leaderboard.tsx"),
  route("leagues/create", "routes/leagues.create.tsx"),
  route("leagues/join", "routes/leagues.join.tsx"),
  route("league/:code", "routes/league.tsx"),
  // Custom quizzes (admin-managed, league-scoped).
  route("league/:code/manage", "routes/league.manage.tsx"),
  route("league/:code/sources", "routes/league.sources.tsx"),
  route("league/:code/quizzes/new", "routes/league.quiz-new.tsx"),
  route("league/:code/quizzes/:quizId/edit", "routes/league.quiz-edit.tsx"),
  route("league/:code/play", "routes/league.play.tsx"),
  route("logout", "routes/logout.tsx"),
  // OG share card (dynamic image). T7.
  route("og/team/:teamId/:deckDate", "routes/og.team.tsx"),
] satisfies RouteConfig;
