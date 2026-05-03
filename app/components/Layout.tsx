import { Link } from "@react-router";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="bg-gray-900 text-gray-100 min-h-screen">
        <nav className="bg-gray-800 border-b border-gray-700">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <Link to="/" className="text-xl font-bold text-blue-400 hover:text-blue-300">
                Daily Team Quiz
              </Link>
              <div className="flex gap-4">
                <Link
                  to="/"
                  className="text-gray-300 hover:text-white transition-colors"
                >
                  Home
                </Link>
                <Link
                  to="/quiz"
                  className="text-gray-300 hover:text-white transition-colors"
                >
                  Quiz
                </Link>
                <Link
                  to="/quiz-leaderboard"
                  className="text-gray-300 hover:text-white transition-colors"
                >
                  Leaderboard
                </Link>
              </div>
            </div>
          </div>
        </nav>
        <main className="max-w-4xl mx-auto px-4 py-8">
          {children}
        </main>
        <footer className="bg-gray-800 border-t border-gray-700 mt-8">
          <div className="max-w-4xl mx-auto px-4 py-4 text-center text-gray-400 text-sm">
            &copy; {new Date().getFullYear()} Daily Team Quiz. All rights reserved.
          </div>
        </footer>
      </body>
    </html>
  );
}
