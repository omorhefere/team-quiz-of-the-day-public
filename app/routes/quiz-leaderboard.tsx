import { useState } from "react";
import type { Route } from "./+types/quiz-leaderboard";
import { Leaderboard } from "../components/quiz/Leaderboard";
import { getLeaderboard } from "../data/leaderboard";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Leaderboard" },
    { name: "description", content: "See how your team ranks against others!" },
  ];
}

export default function Leaderboard() {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="flex justify-center mb-8 space-x-4">
        <button
          onClick={() => setPeriod("daily")}
          className={`px-4 py-2 rounded ${period === "daily" ? "bg-blue-600 text-white" : "bg-white text-gray-700"}`}
        >
          Daily
        </button>
        <button
          onClick={() => setPeriod("weekly")}
          className={`px-4 py-2 rounded ${period === "weekly" ? "bg-blue-600 text-white" : "bg-white text-gray-700"}`}
        >
          Weekly
        </button>
        <button
          onClick={() => setPeriod("monthly")}
          className={`px-4 py-2 rounded ${period === "monthly" ? "bg-blue-600 text-white" : "bg-white text-gray-700"}`}
        >
          Monthly
        </button>
      </div>
      <Leaderboard entries={getLeaderboard(period)} period={period} />
    </div>
  );
}
