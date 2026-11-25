# Hyperframes Composition Brief: Cadence

## Objective
Create a 20-second launch video that shows Cadence helping a person find room in a busy week and prepare a calendar change they can review.

## Output
- Composition directory: `brag-output-2026-11-25-180150/composition/`
- Rendered video: `brag-output-2026-11-25-180150/brag.mp4`
- Poster: `brag-output-2026-11-25-180150/brag.jpg`
- Share copy: `brag-output-2026-11-25-180150/share-copy.txt`
- Format: 1920×1080 landscape, 30fps, 20 seconds

## Audience and promise
For people whose calendars are packed with meetings. Cadence helps them spot open time, protect focus, prepare for meetings, and draft events from plain-language requests. It explains options and waits for confirmation before writing.

## Creative direction
Polished, quiet product film. The story moves from a packed grid to a useful option to an event draft with the user's control clearly intact. Use the real Cadence week calendar and Assistant UI as source material; the working product flow is the centerpiece.

## Visual identity
- Background: #FAF9F5
- Panels: #FFFFFF
- Text: #191816
- Secondary text: #4A4740
- Brand accent: #1E3D33
- Display font: Instrument Serif
- Body font: Inter
- Keep the warm off-white surfaces, fine borders, forest-green accents, compact calendar typography, and editorial serif headline.

## Storyboard
1. **A packed week — 3s:** real week grid, headline “Your calendar is full.”
2. **Options — 3s:** assistant appears beside the week, with a focus suggestion; headline “Your week still has options.”
3. **Ask — 4s:** type “Schedule a meeting Thursday at 3pm for 44 minutes” in the assistant composer.
4. **Review — 6s:** show the Thursday, 3:00 PM event draft with editable 44-minute duration, agenda, notes, location, optional attendee fields, and explicit confirmation control. Keep the confirmation unpressed.
5. **Make room — 4s:** focus block in the calendar, closing line “Make room for the work that matters.” and Cadence wordmark.

## Product accuracy and privacy
- Use the demo calendar and fictional placeholder data only.
- Do not include environment variables, API keys, tokens, real email addresses, or personal account details.
- Do not imply the app writes to a calendar before explicit confirmation.
- Keep the feature text faithful to the current app; do not invent customer quotes, stats, or claims.

## Motion and transitions
Let the week grid lead. Use quick, restrained reveals and soft wipes/crossfades. Simulate only the request typing and the appearance of the suggestion/draft. Preserve enough settled time to read every line. No decorative motion that competes with the product UI.

## Audio
- Music: bundled “Happy Beats / Business Moves” vol. 12 at a low, steady level.
- Cue preset: `happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json` (109.96 BPM); major visual moments may land near 8.74s, 13.11s, and 17.47s when readable.
- SFX: sparse, soft typing/click accents matched to the visible actions.
- No voiceover.

## Delivery checks
- HyperFrames check must pass with meaningful text contrast and no layout overflow.
- Inspect settled frames and transition frames before rendering.
- Extract a strong settled poster frame and replace frame 0 with it while preserving duration and audio.
