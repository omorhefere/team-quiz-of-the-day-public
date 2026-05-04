import type { Route } from "./+types/leaderboard";
import { Link, useLoaderData } from "react-router";

export function meta({ }: Route.MetaArgs) {
    return [
        { title: "Leaderboard" },
        { name: "description", content: "View team rankings!" },
    ];
}

export async function loader() {
    const today = new Date().toISOString().split('T')[0];
    const teams = ["Marketing", "Engineering", "Sales", "Design", "Product"];
    const scores: Record<string, number> = {};

    teams.forEach((team) => {
        const stored = localStorage.getItem(`quiz_scores_${team}`);
        if (stored) {
            const teamScores = JSON.parse(stored);
            scores[team] = teamScores[today] || 0;
        } else {
            scores[team] = 0;
        }
    });

    const leaderboard = teams
        .map((team) => ({
            team,
            score: scores[team],
        }))
        .sort((a, b) => b.score - a.score);

    return { leaderboard };
}

export default function Leaderboard() {
    const { leaderboard } = useLoaderData<typeof loader>();

    return (
        <div className="space-y-6">
            <div className="text-center space-y-4">
                <h1 className="text-4xl font-bold text-blue-400">
                    Team Leaderboard
                </h1>
                <p className="text-gray-400">
                    See how your team ranks today!
                </p>
            </div>

            <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
                <table className="w-full">
                    <thead className="bg-gray-700">
                        <tr>
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                Rank
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                Team
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                Score
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {leaderboard.map((entry, index) => (
                            <tr key={entry.team} className="hover:bg-gray-700/50 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span
                                        className={`inline-flex items-center justify-center w-8 h-8 rounded-full ${index === 0
                                            ? "bg-yellow-500/20 text-yellow-400"
                                            : index === 1
                                                ? "bg-gray-400/20 text-gray-300"
                                                : index === 2
                                                    ? "bg-orange-500/20 text-orange-400"
                                                    : "bg-gray-600/20 text-gray-400"
                                            }`}
                                    >
                                        {index + 1}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-gray-300">
                                    {entry.team}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span
                                        className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${entry.score > 0
                                            ? "bg-green-500/20 text-green-400"
                                            : "bg-gray-600/20 text-gray-400"
                                            }`}
                                    >
                                        {entry.score} / 10
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <h2 className="text-xl font-semibold text-blue-400 mb-4">
                    Notes
                </h2>
                <ul className="space-y-2 text-gray-400">
                    <li className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-blue-500 rounded-full text-white text-sm flex items-center justify-center">
                            1
                        </span>
                        <span>Each team can only submit once per day</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-blue-500 rounded-full text-white text-sm flex items-center justify-center">
                            2
                        </span>
                        <span>1 point per correct answer (10 questions total)</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-blue-500 rounded-full text-white text-sm flex items-center justify-center">
                            3
                        </span>
                        <span>New questions available every day</span>
                    </li>
                </ul>
            </div>

            <div className="text-center">
                <Link
                    to="/"
                    className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-6 rounded-lg transition-colors"
                >
                    Back to Home
                </Link>
            </div>
        </div>
    );
}
