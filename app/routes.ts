import {
  type RouteConfig,
  route,
} from "@react-router/dev/routes";
import prerender from "@react-router/dev/prerender";

export default prerender([
  route("welcome", "./welcome/welcome.tsx"),
  route("home", "./routes/home.tsx"),
  route("quiz", "./routes/quiz.tsx"),
  route("quiz-results", "./routes/quiz-results.tsx"),
  route("quiz-leaderboard", "./routes/quiz-leaderboard.tsx"),
]);
