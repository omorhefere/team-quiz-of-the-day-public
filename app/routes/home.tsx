import type { Route } from "./+types/home";
import { Link } from "@react-router";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Team Quiz Of The Day" },
    { name: "description", content: "Welcome to React Router!" },
  ];
}

export async function loader() {
  return {};
}

export default function Home() {
  const teams = ["Marketing", "Engineering", "Sales", "Design", "Product"];

  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-blue-400">
          Welcome to Daily Team Quiz
        </h1>
        <p className="text-gray-400">
          Test your knowledge and compete with your team!
        </p>
      </div>

      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-semibold text-blue-400 mb-4">
          Select Your Team
        </h2>
        <p className="text-gray-400 mb-6">
          Choose a team to join. Your team's score will be tracked on the leaderboard.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {teams.map((team) => (
            <Link
              key={team}
              to={`/quiz?team=${encodeURIComponent(team)}`}
              className="bg-gray-700 hover:bg-gray-600 text-white font-medium py-3 px-4 rounded-lg transition-colors border border-gray-600 hover:border-blue-500"
            >
              {team}
            </Link>
          ))}
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-semibold text-blue-400 mb-4">
          How It Works
        </h2>
        <ol className="space-y-3 text-gray-400">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-blue-500 rounded-full text-white text-sm flex items-center justify-center">
              1
            </span>
            <span>Select your team from the list above</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-blue-500 rounded-full text-white text-sm flex items-center justify-center">
              2
            </span>
            <span>Answer 10 questions (1 point each for correct answers)</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-blue-500 rounded-full text-white text-sm flex items-center justify-center">
              3
            </span>
            <span>Submit your score to the leaderboard</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-blue-500 rounded-full text-white text-sm flex items-center justify-center">
              4
            </span>
            <span>Check back tomorrow for new questions!</span>
          </li>
        </ol>
      </div>
    </div>
  );
}
