# Can't Stop · Laboratorium ryzyka

Polski interaktywny analizator gry Sida Sacksona. Autor implementacji: **hermes-the-goat**.

**Strona:** https://hermes-the-goat.github.io/cant-stop-lab/

## Co jest liczone

- Dokładna enumeracja 1296 jednakowo prawdopodobnych uporządkowanych rzutów czterema uczciwymi kośćmi.
- Szansa istnienia przynajmniej jednej pary dającej każdą sumę 2–12.
- Partnerzy sum: osobno liczba rzutów i liczba podziałów czterech oznaczonych kości. Rzut `4,5,3,4` ma dwa podziały `7+9` i jeden `8+8`; nie oznacza to trzech niezależnych zdarzeń.
- Ranking trójek według szansy przetrwania kolejnego rzutu, bez ograniczenia wysokości tras. Dla stałego prawdopodobieństwa p: przetrwanie n rzutów = p^n, średni czas do skuszenia (wliczając rzut kończący) = 1/(1-p). Pierwszy n z ryzykiem >50% nie jest średnią.
- Panel EV porównuje zatrzymanie teraz z jednym dodatkowym rzutem i zatrzymaniem po sukcesie. Jednostką wartości są kroki, nie szansa wygrania gry. Uwzględnia podane odległości do szczytu, lecz nie zastępuje pełnej strategii wyścigu.
- Osobna zakładka drzewa uczenia maszynowego oraz odtwarzalna symulacja. Szczegóły i ograniczenia: [MODEL.md](MODEL.md).

## Zasady

Standardowe długości kolumn: 3,5,7,9,11,13,11,9,7,5,3. Maksymalnie trzy neutralne znaczniki w turze. W wybranym podziale wykonuje się oba legalne ruchy, gdy to możliwe. Dublet sum może dać dwa kroki. Brak legalnego ruchu oznacza utratę całego niezapisanego postępu. Szczyt zostaje zdobyty dopiero przy zatrzymaniu; zdobyta kolumna jest zamknięta dla obu graczy.

Symulacja dotyczy wariantu **Long Game: dwóch graczy, pięć szczytów do zwycięstwa**. Bez przeskakiwania pionków i bez wariantu wymuszonego kontynuowania.

Źródła odczytane podczas implementacji:
- [Instrukcja](https://cdn.1j1ju.com/medias/d8/88/07-cant-stop-rulebook.pdf)
- [Board Game Arena — zasady i wariant Long Game](https://en.doc.boardgamearena.com/Gamehelpcantstop)

## Uruchomienie

Strona nie wymaga bundlera ani usług zewnętrznych:

```bash
python3 -m http.server 8000
```

Otwórz http://localhost:8000. Korzystaj z serwera HTTP, nie `file://`, ponieważ dane są wczytywane przez fetch.

Zależności Python: numpy, scikit-learn, pytest. Na Debianie:

```bash
sudo apt install python3-numpy python3-sklearn python3-pytest
python3 -m pytest -q
node --test test_ui.cjs
```

Kod i dane są publiczne. To niezależne narzędzie analityczne, bez powiązania z wydawcami gry.
