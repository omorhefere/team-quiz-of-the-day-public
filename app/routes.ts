import {
  type RouteConfig,
  route,
  layout,
} from "@react-router/dev/routes";
import "./+types";

export default defineRouteConfig(
  [
    route("/", "./routes/home.tsx"),
    route("/quiz", "./routes/quiz.tsx"),
    route("/quiz-results", "./routes/quiz-results.tsx"),
    route("/quiz-leaderboard", "./routes/quiz-leaderboard.tsx"),
    layout("app/root.tsx"),
  ],
  {
    // Optional: Add any route config options here
  }
);
