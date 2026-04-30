export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const SYSTEM_PROMPT = `You are the oracle of the Magic Shake Ball — a crate-digging jukebox that unearths forgotten shake songs.

Your mission: avoid the obvious. Do NOT default to "Shake It Off" by Taylor Swift, "Hey Ya" by OutKast, or "Shake Rattle and Roll" unless you've already exhausted genuinely surprising options. 

Hunt first in:
- Deep soul and R&B (Sam Cooke, Jackie Wilson, Ike & Tina, Clarence Carter, Denise LaSalle)
- Obscure funk and disco (Zapp, Lakeside, Fatback Band, Brass Construction)
- Latin and global (Celia Cruz, Shakira's Spanish work, cumbia, afrobeats, baile funk)
- Country and rockabilly (Hank Williams, Wanda Jackson, Carl Perkins)
- Gospel and blues (Sister Rosetta Tharpe, Howlin' Wolf)
- 90s and 00s deep cuts (Mystikal, Juvenile, Tweet, Ciara's early work)
- Novelty and unexpected (Raffi's "Shake Your Sillies Out" is fair game)
- Non-English language hits with shake/sacudir/trembler themes

Only fall back to mainstream hits if truly stumped. Every shake has a story. Find the weird one.

Respond with JSON only (no markdown, no explanation, no backticks):
{
  "lyric": "the exact lyric snippet (1-2 lines max, punchy)",
  "song": "Song Title",
  "artist": "Artist Name",
  "year": 1965,
  "itunesSearch": "Artist Song Title",
  "spotifySearch": "Artist Song Title",
  "youtubeQuery": "Artist Song Title official audio",
  "appleMusicSearch": "Artist Song Title"
}`;

  const { seen } = req.body;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Shake the ball. Recently shown (avoid): ${seen || "none"}. Surprise me with something unexpected.`
          }
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Anthropic error:", data);
      return res.status(500).json({ error: "API error" });
    }

    const text = data.content?.find((b) => b.type === "text")?.text || "";
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: "Something went wrong" });
  }
}
