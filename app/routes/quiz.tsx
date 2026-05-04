import type { Route } from "./+types/quiz";
import { Link, useLoaderData } from "react-router";
import { getTodayQuestions } from "../data/questions";
import { useState } from "react";

export function meta({ }: Route.MetaArgs) {
    return [
        { title: "Daily Quiz" },
        { name: "description", content: "Take today's quiz!" },
    ];
}

export async function loader({ request }: { request: Request }) {
    const questions = getTodayQuestions();
    const url = new URL(request.url);
    const team = url.searchParams.get("team");

    return {
        questions,
        team,
    };
}

export async function action({ request }: { request: Request }) {
    const formData = await request.formData();
    const answers = formData.getAll("answer") as number[];
    const team = formData.get("team") as string;

    if (answers.length !== 10) {
        return { error: "Please answer all 10 questions." };
    }

    const score = answers.reduce((total, answer, index) => {
        return total + (answer === index ? 1 : 0);
    }, 0);

    const storedScores = JSON.parse(
        localStorage.getItem(`quiz_scores_${team}`) || "{}"
    );
    storedScores[new Date().toISOString().split('T')[0]] = score;
    localStorage.setItem(`quiz_scores_${team}`, JSON.stringify(storedScores));

    return { success: true, score };
}

export default function Quiz() {
    const { questions, team } = useLoaderData<typeof loader>();
    const [answers, setAnswers] = useState<number[]>(Array(10).fill(-1));
    const [submitted, setSubmitted] = useState(false);

    const handleAnswerChange = (index: number, value: number) => {
        const newAnswers = [...answers];
        newAnswers[index] = value;
        setAnswers(newAnswers);
    };

    const handleSubmit = async () => {
        const formData = new FormData();
        formData.append("team", team || "");
        answers.forEach((answer, index) => {
            formData.append("answer", String(answer));
        });

        const result = await action({ request: new Request("", { method: "POST" }) });
        setSubmitted(true);
    };

    if (!questions) {
        return (
            <div className="text-center text-gray-400">
                <p>No questions available for today.</p>
                <Link to="/" className="text-blue-400 hover:underline">
                    Go Home
                </Link>
            </div>
        );
    }

    if (submitted) {
        const score = answers.reduce((total, answer, index) => {
            return total + (answer === index ? 1 : 0);
        }, 0);

        return (
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 text-center">
                <h2 className="text-2xl font-bold text-blue-400 mb-4">
                    Quiz Complete!
                </h2>
                <p className="text-gray-400 mb-2">
                    Your team: <span className="text-white">{team}</span>
                </p>
                <p className="text-4xl font-bold text-green-400 mb-4">
                    {score} / 10
                </p>
                <p className="text-gray-400 mb-6">
                    Great job! Check the leaderboard to see how you rank.
                </p>
                <Link
                    to="/quiz-leaderboard"
                    className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-6 rounded-lg transition-colors"
                >
                    View Leaderboard
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold text-blue-400">
                        Question {questions.questions[answers.findIndex((a) => a !== -1) + 1] || 1} of {questions.questions.length}
                    </h2>
                    <span className="text-gray-400">
                        Team: <span className="text-white">{team}</span>
                    </span>
                </div>

                <div className="space-y-4">
                    {questions.questions.map((q, index) => (
                        <div key={q.id} className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                            <p className="text-gray-300 mb-4">{q.question}</p>
                            <div className="space-y-2">
                                {q.options.map((option, optionIndex) => (
                                    <label
                                        key={optionIndex}
                                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${answers[index] === optionIndex
                                            ? "bg-blue-500/20 border-blue-500"
                                            : "bg-gray-600 hover:bg-gray-500 border-gray-500"
                                            } border`}
                                    >
                                        <input
                                            type="radio"
                                            name={`question-${q.id}`}
                                            value={optionIndex}
                                            checked={answers[index] === optionIndex}
                                            onChange={() => handleAnswerChange(index, optionIndex)}
                                            className="w-4 h-4 text-blue-500 border-gray-600 focus:ring-blue-500"
                                        />
                                        <span className="text-gray-300">{option}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-6 flex justify-end">
                    <button
                        onClick={handleSubmit}
                        disabled={answers.some((a) => a === -1)}
                        className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-2 px-6 rounded-lg transition-colors"
                    >
                        Submit Answers
                    </button>
                </div>
            </div>
        </div>
    );
}
