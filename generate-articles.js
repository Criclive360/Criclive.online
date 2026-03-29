// generate-articles.js
// Runs on GitHub Actions every 2 hours
// Fetches match data from CricAPI + generates articles with Gemini

const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const fs = require('fs');

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const CRIC_KEY = process.env.CRIC_API_KEY;
const CRIC_BASE = 'https://api.cricapi.com/v1';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;

// ── Helper: call Gemini ──
async function gemini(prompt) {
  try {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 1200 }
      })
    });
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch (e) {
    console.error('Gemini error:', e.message);
    return '';
  }
}

// ── Helper: slugify ──
function slug(str) {
  return str.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .substring(0, 60);
}

// ── Helper: current IST time ──
function istNow() {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

// ── Fetch upcoming/live matches ──
async function fetchMatches() {
  try {
    const res = await fetch(`${CRIC_BASE}/currentMatches?apikey=${CRIC_KEY}&offset=0`);
    const data = await res.json();
    if (data.status === 'failure') {
      console.log('CricAPI limit hit, using series schedule');
      return fetchSchedule();
    }
    return data.data || [];
  } catch (e) {
    console.error('CricAPI error:', e.message);
    return [];
  }
}

async function fetchSchedule() {
  try {
    const res = await fetch(`${CRIC_BASE}/series_info?apikey=${CRIC_KEY}&id=d5a498c8-7596-4b93-8ab0-e0efc3345312`);
    const data = await res.json();
    return data.data?.matchList || [];
  } catch (e) {
    return [];
  }
}

// ── Generate Fantasy Tips article ──
async function generateFantasyTips(match) {
  const team1 = match.teams?.[0] || match.teamInfo?.[0]?.name || 'Team 1';
  const team2 = match.teams?.[1] || match.teamInfo?.[1]?.name || 'Team 2';
  const venue = match.venue || 'TBA';
  const matchDate = match.dateTimeGMT ? new Date(match.dateTimeGMT).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' }) : 'Today';

  const prompt = `Write a Dream11 fantasy cricket tips article for the IPL 2026 match: ${team1} vs ${team2} at ${venue} on ${matchDate}.

Structure the article with these exact HTML tags (no markdown, no backticks):
- Start with a 2-sentence intro paragraph in <p> tags
- Add <h2>Pitch Report & Conditions</h2> with 2 sentences about ${venue} pitch
- Add <h2>Top Fantasy Picks — ${team1}</h2> with 3 player recommendations, each as <p><strong>Player Name</strong> — reason</p>
- Add <h2>Top Fantasy Picks — ${team2}</h2> with 3 player recommendations same format
- Add <h2>Captain & Vice-Captain Choices</h2> with 2-3 recommendations
- Add <h2>Differential Pick</h2> with 1 underrated player pick
- Add <h2>Suggested Fantasy XI</h2> as a simple list using <ul><li> tags
- End with a <div class="key-stat"><p>Key tip in one sentence</p></div>

Write in professional cricket journalism style. Keep total length to 500-600 words. Use actual IPL player names where possible.`;

  const body = await gemini(prompt);
  if (!body) return null;

  const articleSlug = `fantasy-${slug(team1)}-vs-${slug(team2)}-${Date.now()}`;
  return {
    slug: articleSlug,
    title: `${team1} vs ${team2} Dream11 Fantasy Tips, Best XI & Captain Picks — IPL 2026`,
    tag: 'Fantasy',
    team: '',
    t: 'just now',
    publishedAt: new Date().toISOString(),
    type: 'fantasy',
    matchTeams: [team1, team2],
    body: body
  };
}

// ── Generate Match Preview article ──
async function generatePreview(match) {
  const team1 = match.teams?.[0] || match.teamInfo?.[0]?.name || 'Team 1';
  const team2 = match.teams?.[1] || match.teamInfo?.[1]?.name || 'Team 2';
  const venue = match.venue || 'TBA';
  const matchDate = match.dateTimeGMT ? new Date(match.dateTimeGMT).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' }) : 'Today';

  const prompt = `Write a detailed IPL 2026 match preview article for: ${team1} vs ${team2} at ${venue} on ${matchDate}.

Structure with these exact HTML tags:
- Opening <p> paragraph setting the stage for the match
- <h2>Head-to-Head Record</h2> with recent IPL h2h stats
- <h2>Pitch Report — ${venue}</h2> describing surface conditions
- <h2>${team1} — Form & Predicted XI</h2> with current form and likely playing XI as <ul><li> list
- <h2>${team2} — Form & Predicted XI</h2> same format
- <h2>Key Player Battles</h2> with 2-3 exciting player matchups
- <h2>Our Prediction</h2> with match prediction and reasoning
- End with <div class="key-stat"><p>One key stat that could decide the match</p></div>

Professional cricket journalism style. 550-650 words. Use actual IPL player names.`;

  const body = await gemini(prompt);
  if (!body) return null;

  const articleSlug = `preview-${slug(team1)}-vs-${slug(team2)}-${Date.now()}`;
  return {
    slug: articleSlug,
    title: `${team1} vs ${team2} Match Preview, Predicted XI & Match Prediction — IPL 2026`,
    tag: 'Match Preview',
    team: '',
    t: 'just now',
    publishedAt: new Date().toISOString(),
    type: 'preview',
    matchTeams: [team1, team2],
    body: body
  };
}

// ── Generate Match Summary article ──
async function generateSummary(match) {
  const team1 = match.teams?.[0] || 'Team 1';
  const team2 = match.teams?.[1] || 'Team 2';
  const result = match.status || 'Match completed';
  const score1 = match.score?.[0] ? `${match.score[0].r}/${match.score[0].w} (${match.score[0].o} ov)` : '';
  const score2 = match.score?.[1] ? `${match.score[1].r}/${match.score[1].w} (${match.score[1].o} ov)` : '';

  const prompt = `Write a match summary article for IPL 2026: ${team1} vs ${team2}.
Result: ${result}
${score1 ? `${team1}: ${score1}` : ''}
${score2 ? `${team2}: ${score2}` : ''}

Structure with HTML tags:
- Opening <p> with the match result summary
- <h2>Match Summary</h2> with ball-by-ball narrative
- <h2>Star Performers</h2> with top batters and bowlers as <p><strong>Name</strong> — performance</p>
- <h2>Key Moments</h2> with 2-3 turning points
- <h2>Points Table Impact</h2> brief mention
- End with <div class="key-stat"><p>Player of the match and reason</p></div>

Professional cricket journalism style. 500-600 words.`;

  const body = await gemini(prompt);
  if (!body) return null;

  const articleSlug = `summary-${slug(team1)}-vs-${slug(team2)}-${Date.now()}`;
  return {
    slug: articleSlug,
    title: `${team1} vs ${team2} Match Summary, Scorecard & Highlights — IPL 2026`,
    tag: 'Match Report',
    team: '',
    t: 'just now',
    publishedAt: new Date().toISOString(),
    type: 'summary',
    matchTeams: [team1, team2],
    body: body
  };
}

// ── Main ──
async function main() {
  console.log(`Starting article generation at ${istNow()}`);

  // Load existing articles
  let existing = [];
  try {
    existing = JSON.parse(fs.readFileSync('articles.json', 'utf8'));
    console.log(`Loaded ${existing.length} existing articles`);
  } catch (e) {
    console.log('No existing articles.json — creating fresh');
  }

  const matches = await fetchMatches();
  console.log(`Found ${matches.length} matches`);

  const newArticles = [];
  const now = Date.now();

  for (const match of matches.slice(0, 3)) { // Max 3 matches to save API calls
    const team1 = match.teams?.[0] || '';
    const team2 = match.teams?.[1] || '';
    if (!team1 || !team2) continue;

    const matchKey = `${team1}-${team2}`.toLowerCase().replace(/\s/g, '');
    const matchDate = match.dateTimeGMT ? new Date(match.dateTimeGMT) : null;
    const hoursUntilMatch = matchDate ? (matchDate - now) / 3600000 : null;
    const isLive = match.matchStarted && !(match.status || '').toLowerCase().includes('won');
    const isFinished = (match.status || '').toLowerCase().includes('won') || (match.status || '').toLowerCase().includes('draw');

    // Check if we already generated articles for this match today
    const todayStr = new Date().toDateString();
    const alreadyGenerated = existing.some(a =>
      a.matchTeams && a.matchTeams.join('-').toLowerCase().replace(/\s/g, '').includes(matchKey.split('-')[0]) &&
      new Date(a.publishedAt).toDateString() === todayStr
    );

    console.log(`Match: ${team1} vs ${team2} | Hours until: ${hoursUntilMatch?.toFixed(1)} | Live: ${isLive} | Finished: ${isFinished} | Already generated: ${alreadyGenerated}`);

    // Generate Fantasy Tips — 3 hours before match
    if (!isFinished && hoursUntilMatch !== null && hoursUntilMatch <= 3 && hoursUntilMatch >= 0) {
      const hasFantasy = existing.some(a => a.type === 'fantasy' && new Date(a.publishedAt).toDateString() === todayStr && a.matchTeams?.[0] === team1);
      if (!hasFantasy) {
        console.log(`Generating Fantasy Tips for ${team1} vs ${team2}...`);
        const art = await generateFantasyTips(match);
        if (art) { newArticles.push(art); console.log('Fantasy Tips generated ✓'); }
        await new Promise(r => setTimeout(r, 3000)); // Rate limit
      }
    }

    // Generate Preview — 2 hours before match
    if (!isFinished && hoursUntilMatch !== null && hoursUntilMatch <= 2 && hoursUntilMatch >= 0) {
      const hasPreview = existing.some(a => a.type === 'preview' && new Date(a.publishedAt).toDateString() === todayStr && a.matchTeams?.[0] === team1);
      if (!hasPreview) {
        console.log(`Generating Preview for ${team1} vs ${team2}...`);
        const art = await generatePreview(match);
        if (art) { newArticles.push(art); console.log('Preview generated ✓'); }
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    // Generate Summary — when match is finished
    if (isFinished) {
      const hasSummary = existing.some(a => a.type === 'summary' && new Date(a.publishedAt).toDateString() === todayStr && a.matchTeams?.[0] === team1);
      if (!hasSummary) {
        console.log(`Generating Summary for ${team1} vs ${team2}...`);
        const art = await generateSummary(match);
        if (art) { newArticles.push(art); console.log('Summary generated ✓'); }
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  if (newArticles.length === 0) {
    console.log('No new articles to generate right now.');
    // Still save to update timeAgo timestamps
  }

  // Merge: new articles on top, keep last 50 total
  const merged = [...newArticles, ...existing]
    .filter((a, i, arr) => arr.findIndex(x => x.slug === a.slug) === i) // dedupe
    .slice(0, 50);

  fs.writeFileSync('articles.json', JSON.stringify(merged, null, 2));
  console.log(`Saved ${merged.length} total articles (${newArticles.length} new)`);
  console.log('Done!');
}

main().catch(console.error);
