import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("register", "routes/register.tsx"),
  route("join", "routes/join.tsx"),
  route("play", "routes/play.tsx"),
  route("leaderboard", "routes/leaderboard.tsx"),
  route("leagues/new", "routes/leagues.create.tsx", { id: "leagues-new" }),
  route("leagues/create", "routes/leagues.create.tsx", { id: "leagues-create" }),
  route("leagues/join", "routes/leagues.join.tsx"),
  route("league/:code", "routes/league.tsx"),
  // Custom quizzes (admin-managed, league-scoped).
  route("league/:code/manage", "routes/league.manage.tsx"),
  route("league/:code/settings", "routes/league.settings.tsx"),
  route("league/:code/sources", "routes/league.sources.tsx"),
  route("league/:code/generate", "routes/league.generate.tsx"),
  route("league/:code/quizzes/new", "routes/league.quiz-new.tsx"),
  route("league/:code/quizzes/:quizId/edit", "routes/league.quiz-edit.tsx"),
  route("league/:code/play", "routes/league.play.tsx"),
  // League admin auth.
  route("league/:code/admin/setup", "routes/league.admin.setup.tsx"),
  route("league/:code/admin/login", "routes/league.admin.login.tsx"),
  route("league/:code/admin/logout", "routes/league.admin.logout.tsx"),
  route("logout", "routes/logout.tsx"),
  // OG share card (dynamic image). T7.
  route("og/team/:teamId/:deckDate", "routes/og.team.tsx"),
] satisfies RouteConfig;
