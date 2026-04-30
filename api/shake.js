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
  "song": "Song Title",
  "artist": "Artist Name",
  "year": 1965,
  "itunesSearch": "Artist Song Title",
  "spotifySearch": "Artist Song Title",
  "youtubeQuery": "Artist Song Title official audio",
  "appleMusicSearch": "Artist Song Title"
}`;

  const LYRIC_PROMPT = `Here are the full lyrics to "{song}" by {artist}:

{lyrics}

Pull out the single best 1-2 line snippet that captures the shake/dance energy of this song. Return only the lyric text, no attribution, no quotation marks, no explanation.`;

  const { seen } = req.body;
  const apiKey = (process.env.ANTHROPIC_API_KEY || "").replace(/\s/g, "");

  try {
    // Step 1: Claude picks the song
    const pickResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Shake the ball. Recently shown (avoid): ${seen || "none"}. Surprise me with something unexpected.`
          }
        ],
      }),
    });

    const pickData = await pickResponse.json();
    if (!pickResponse.ok) {
      console.error("Anthropic pick error:", JSON.stringify(pickData));
      return res.status(500).json({ error: "API error", detail: pickData });
    }

    const pickText = pickData.content?.find((b) => b.type === "text")?.text || "";
    const parsed = JSON.parse(pickText.replace(/```json|```/g, "").trim());

    // Step 2: Fetch real lyrics from lyrics.ovh
    let lyric = null;
    try {
      const lyricsRes = await fetch(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(parsed.artist)}/${encodeURIComponent(parsed.song)}`
      );
      if (lyricsRes.ok) {
        const lyricsData = await lyricsRes.json();
        if (lyricsData.lyrics && lyricsData.lyrics.length > 0) {
          // Step 3: Claude picks the best line from the real lyrics
          const lyricResponse = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-6",
              max_tokens: 100,
              messages: [
                {
                  role: "user",
                  content: LYRIC_PROMPT
                    .replace("{song}", parsed.song)
                    .replace("{artist}", parsed.artist)
                    .replace("{lyrics}", lyricsData.lyrics.slice(0, 3000))
                }
              ],
            }),
          });
          if (lyricResponse.ok) {
            const lyricData = await lyricResponse.json();
            lyric = lyricData.content?.find((b) => b.type === "text")?.text?.trim() || null;
          }
        }
      }
    } catch (e) {
      console.warn("Lyrics fetch failed, skipping:", e.message);
    }

    return res.status(200).json({ ...parsed, lyric });
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: "Something went wrong", detail: err.message });
  }
}
