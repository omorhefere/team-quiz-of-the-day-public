import type { Route } from "./+types/quiz-results";
import { Link } from "@react-router";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Quiz Results" },
    { name: "description", content: "View your quiz results!" },
  ];
}

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const team = url.searchParams.get("team");
  const score = url.searchParams.get("score");

  return {
    team,
    score,
  };
}

export default function QuizResults() {
  const { team, score } = await loader();

  return (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-blue-400">
          Quiz Results
        </h1>
        <p className="text-gray-400">
          Great job completing today's quiz!
        </p>
      </div>

      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 text-center">
        <h2 className="text-xl font-semibold text-blue-400 mb-4">
          Your Team: <span className="text-white">{team}</span>
        </h2>
        <p className="text-gray-400 mb-2">
          Your Score:
        </p>
        <p className="text-6xl font-bold text-green-400 mb-4">
          {score || 0} / 10
        </p>
        <div className="bg-gray-700 rounded-lg p-4 mb-6">
          <p className="text-gray-400">
            Keep practicing to improve your team's ranking!
          </p>
        </div>
        <div className="flex gap-4 justify-center">
          <Link
            to="/quiz-leaderboard"
            className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-6 rounded-lg transition-colors"
          >
            View Leaderboard
          </Link>
          <Link
            to="/"
            className="bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-6 rounded-lg transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
