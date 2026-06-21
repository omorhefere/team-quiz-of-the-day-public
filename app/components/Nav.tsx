import { Form, Link, NavLink } from "react-router";

type NavItem = { to: string; label: string };

export function Nav({
  items,
  showSignOut = false,
}: {
  items: NavItem[];
  showSignOut?: boolean;
}) {
  return (
    <nav className="border-b border-gray-800 bg-gray-950">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-1">
          <Link
            to="/"
            className="mr-4 text-sm font-bold tracking-wide text-indigo-400 hover:text-indigo-300"
          >
            OTL
          </Link>
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-indigo-600/20 text-indigo-300"
                    : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
        {showSignOut && (
          <Form method="post" action="/logout">
            <button className="text-xs text-gray-500 hover:text-gray-300">
              Sign out
            </button>
          </Form>
        )}
      </div>
    </nav>
  );
}

export function LeagueNav({
  code,
  isAdmin,
}: {
  code: string;
  isAdmin: boolean;
}) {
  const playerItems: NavItem[] = [
    { to: `/league/${code}`, label: "Leaderboard" },
    { to: `/league/${code}/play`, label: "Play quiz" },
  ];

  const adminItems: NavItem[] = [
    { to: `/league/${code}`, label: "Leaderboard" },
    { to: `/league/${code}/play`, label: "Play quiz" },
    { to: `/league/${code}/manage`, label: "Quizzes" },
    { to: `/league/${code}/sources`, label: "Sources" },
  ];

  return <Nav items={isAdmin ? adminItems : playerItems} showSignOut />;
}
