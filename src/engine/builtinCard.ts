// An original card of American-style hands written for this app. It is not the National Mah Jongg
// League card; players who own that card can type its hands into the card editor.
export const BUILTIN_CARD = `# Year
FFFF 2026a 222b 666c | 25
222a 000 2222b 6666b | 25
FF 2026a NNNN SSSS | 30
2026a 2026b 222c 666c | 35 | C

# Evens
FF 2222a 4444a 6666a | 25
222a 444a 6666b 8888b | 25
FFFF 22a 44a 66a 8888a | 30
FF 2222a 44b 66b 8888a | 30
22a 444a 44b 666b 8888c | 30
222a 444b 666c 88a 888b | 35 | C

# Odds
11a 333a 5555a 777a 99a | 25
111a 333a 5555b 7777b | 25
FFFF 1111a 9999b 55c | 30
FFF 135a 7777b 9999c | 30
11a 33a 555b 777b 9999c | 30
111a 333b 555c 777a 99b | 35 | C

# Like Numbers
FF 1111a 1111b 1111c | 25 | run
FFFF 111a 111b 1111c | 25 | run
111a 111b 11c DDDa DDDb | 30 | run

# Runs
11a 222a 3333a 444a 55a | 25 | run
111a 222a 3333b 4444b | 25 | run
FF 1111a 2222a 3333a | 25 | run
11a 22a 333b 444b 5555c | 30 | run
111a 2222a 333b 4444b | 30 | run
1a 22a 333a 4444a 5555a | 30 | run
FF 111a 222a 333a DDDa | 30 | run
123a 111b 222b 333b 44c | 35 | C run

# Threes
333a 666a 6666b 9999b | 25
FF 3333a 6666b 9999c | 25
33a 666a 9999a 666b 33b | 30
FFFF 33a 66a 99a 3333b | 30
333a 666a 999a 33b 666b | 35 | C

# Sums
FF 3333a 4444a 7777a | 25
FF 4444a 5555b 9999b | 25
FF 2222a 7777b 9999c | 30

# Winds and Dragons
NNNN EE WW SSSS FF | 25
FFFF NNNN SSSS DDx | 25
FFFF EEEE WWWW DDx | 25
VVVV FF 1111a DDDDa | 25 | run
NNN EEE WWW SSS DDx | 30
GGGG RRRR 0000 FF | 30
NEWS GGG RRR 0000 | 35 | C

# Quints
FF 11111a 22222a 33a | 40 | run
FFFFF 1111a DDDDDa | 40 | run
11111a 2222b 33333c | 45 | run
VVVVV 11a 11b 11111c | 45 | run

# Singles and Pairs
FF 11a 22a 33a 44a 55a 66a | 50 | C run
NN EE WW SS 11a 11b 11c | 50 | C run
FF 22a 44a 66a 88a 22b 88b | 50 | C
11a 33a 55a 77a 99a 11b 99b | 50 | C
NEWS GG RR 00 11a 11b | 50 | C run
FF 2026a 2026b 2026c | 75 | C
`;
