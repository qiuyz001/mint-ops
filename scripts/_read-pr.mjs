import { execFileSync } from "node:child_process";

function getToken() {
  try {
    const out = execFileSync("git", ["credential", "fill"], { input: "protocol=https\nhost=github.com\n\n", encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
    const line = out.split("\n").find((l) => l.startsWith("password="));
    return line ? line.slice("password=".length).trim() : null;
  } catch { return null; }
}

const token = getToken();
const H = { accept: "application/vnd.github+json", "user-agent": "pr-reader", ...(token ? { authorization: `Bearer ${token}` } : {}) };
const R = "https://api.github.com/repos/qiuyz001/mint-ops";

const [issue, review, reviewComments] = await Promise.all([
  fetch(`${R}/issues/4/comments?per_page=50`, { headers: H }).then((r) => r.json()).catch(() => []),
  fetch(`${R}/pulls/4/reviews?per_page=50`, { headers: H }).then((r) => r.json()).catch(() => []),
  fetch(`${R}/pulls/4/comments?per_page=50`, { headers: H }).then((r) => r.json()).catch(() => []),
]);

const show = (label, arr, fmt) => {
  console.log(`\n########## ${label} (${Array.isArray(arr) ? arr.length : 0}) ##########`);
  if (!Array.isArray(arr)) return console.log(JSON.stringify(arr).slice(0, 300));
  for (const x of arr) fmt(x);
};

show("REVIEWS", review, (r) => {
  console.log(`\n--- review ${r.id} by ${r.user?.login} [${r.state}] ${r.submitted_at || ""}`);
  console.log(r.body || "(empty)");
});

show("INLINE COMMENTS", reviewComments, (c) => {
  console.log(`\n--- ${c.user?.login} on ${c.path}${c.line ? ":" + c.line : ""} ${c.created_at || ""}`);
  console.log(c.body || "(empty)");
});

show("ISSUE COMMENTS", issue, (c) => {
  console.log(`\n--- ${c.user?.login} ${c.created_at || ""}`);
  console.log(c.body || "(empty)");
});
