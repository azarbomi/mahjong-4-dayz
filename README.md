# Mahjong 4 Dayz

American mahjong for your phone: play solo against computer players or with friends by room code, with live
recommendations for which hands to go for.

It is an installable web app (PWA). There is no app store step and no server to run.

## Getting it on your phone

1. Put this code on the repository's default branch.
2. In the GitHub repository: **Settings → Pages → Source: GitHub Actions**. The included workflow then builds and
   publishes the app on every push to the default branch, at `https://<your-user>.github.io/mahjong-4-dayz/`.
3. Open that address on the phone.
   - iPhone: Safari → Share → **Add to Home Screen**
   - Android: Chrome → menu → **Install app**

Friends install it the same way from the same address.

## Playing together

- One person taps **Host a game** and shares the five-letter code (or the invite link).
- Everyone else types the code and taps **Join**.
- Seats without a person are played by the computer. Friends can join after the game has started; they take over a
  computer seat.

How it works, and its limits:

- Phones connect directly to each other (WebRTC). A free public PeerJS server is used only to introduce the phones.
- The game runs on the host's phone. If the host closes the app the game pauses; the host can pick it up again
  with **Resume** on the home screen. If another player drops, the computer covers their seat until they rejoin
  with the same code.
- Each phone is only sent its own rack. The full game does live on the host's phone, so this is for friendly
  games, not for play against strangers.
- Some office and school networks block direct connections. Mobile data or home Wi-Fi usually works.

## Hints

During play, **Closest hands** shows the hands on the card you are nearest to:

- tiles away, counting jokers you hold (jokers never fill singles or pairs);
- what is still missing and how many copies are unaccounted for (not in your rack, the discards or any exposure);
- hands that can no longer be made are marked dead, with the reason;
- only hands that fit what you have already exposed are offered, and concealed hands drop out once you expose.

A dot on a rack tile marks the suggested pass or discard, and a discard you can call comes with "call it" or
"pass". Tap a hand to highlight its tiles in your rack. Hints can be turned off from the home screen or the game
menu.

## Your rack

Drag a tile to move it; your arrangement is kept as tiles come and go and is remembered on your phone. **Sort**
puts the rack back in standard order. When someone wins, their hand is laid out group by group in the order it is
written on the card, with jokers shown in the groups they complete.

## The card

The app ships with an original card of American-style hands. It is **not** the National Mah Jongg League card,
which is copyrighted. If you own that card you can type its hands under **Cards → My card** and play with them.

One hand per line: `tiles | points | flags`

```
# Evens
FF 2222a 4444a 6666b | 25
11a 222a 3333b 444c 55c | 30 | run
NNNN EEEE WW SS 11a | 30 | C
```

| Symbol | Meaning |
| --- | --- |
| `1`-`9` | number tile; the token ends with a suit letter `a`, `b` or `c` (different letters are different suits) |
| `0` | soap (white dragon used as zero) |
| `F` | flower |
| `N` `E` `W` `S` | winds |
| `G` `R` | green / red dragon |
| `DDDa` | dragon matching suit `a`; `DDDx` any dragon (`x` and `y` are different dragons) |
| `VVV` | any one wind |
| `2026a` | different symbols in one token are single tiles |
| flag `C` | concealed hand |
| flag `run` | all numbers may move up or down together (any run, any like number) |
| `=2026a` | keeps that token fixed inside a `run` hand |
| `# Name` | starts a category |

## Rules implemented

152 tiles (jokers and flowers included); Charleston with blind passes, optional second Charleston and courtesy
pass; calling a discard for a pung, kong, quint or sextet, or for Mahjong; Mahjong beats an exposure, otherwise the
next player in turn gets the tile; joker exchange; discarded jokers cannot be called; wall game when the tiles run
out. Scoring: the hand's value from each player, double from the discarder, double from everyone when self-drawn,
and double again for a jokerless hand (not for singles-and-pairs hands). Players answer a discard within 20
seconds or pass automatically. The app does not call hands dead; it just refuses a Mahjong that is not on the card.

## Development

```
npm install
npm run dev      # local dev server
npm test         # engine and hosting tests, including complete computer-played games
npm run build    # production build in dist/
```

- `src/engine` rules, card notation, hand analysis and computer players (no UI code)
- `src/net` host, client and the PeerJS connection
- `src/ui` React screens

To try multiplayer on one machine without the public server, run `npx peerjs --port 9000 --path / --host 127.0.0.1`
and open the app with `?signal=127.0.0.1:9000` in two browser windows.
