# Can't Stop · Laboratorium ryzyka

Polski interaktywny analizator gry Sida Sacksona. Autor implementacji: **hermes-the-goat**.

**Strona:** https://hermes-the-goat.github.io/cant-stop-lab/

## Co jest liczone

- Dokładna enumeracja 1296 jednakowo prawdopodobnych uporządkowanych rzutów czterema uczciwymi kośćmi.
- Szansa istnienia przynajmniej jednej pary dającej każdą sumę 2–12.
- Partnerzy sum: osobno liczba rzutów i liczba podziałów czterech oznaczonych kości. Rzut `4,5,3,4` ma dwa podziały `7+9` i jeden `8+8`; nie oznacza to trzech niezależnych zdarzeń.
- Ranking trójek według szansy przetrwania kolejnego rzutu, bez ograniczenia wysokości tras. Dla stałego prawdopodobieństwa p: przetrwanie n rzutów = p^n, średni czas do skuszenia (wliczając rzut kończący) = 1/(1-p). Pierwszy n z ryzykiem >50% nie jest średnią.
- Plansza zaczyna bez wybranych kolumn. Wybierz dokładnie trzy; kwadratowy przycisk ↺ czyści wybór i przywraca pełne odległości wszystkich kolumn. Nie wpisujesz faktycznego dorobku tury i nie otrzymujesz werdyktu opartego na domyślnych czterech krokach.
- Przy 1 lub 2 wybranych kolumnach panel pokazuje **TOP 5 dopełnień — najniższe ryzyko wpadki**. Każda trójka zawiera cały bieżący wybór. Ranking malejąco według szansy przeżycia, remisy leksykograficznie według numerów kolumn; nie według EV. Ryzyko i EV liczymy od nowa z edytowanych odległości wybranych kolumn, a dla nowych z pełnych długości. Kliknięcie zachowuje te odległości, resetuje tylko nowo dodane kolumny i otwiera próg bankowania. Przy pustym wyborze pozostaje instrukcja.
- EV przyrostu względnego / rzut to bezwarunkowa średnia `Σ kroki / pełna długość kolumny` (zero za wpadkę), nie EV netto: faktyczny dorobek tury nie jest podawany. Trójki to hipotetyczne stany z trzema zajętymi znacznikami, nie model dobierania wolnych znaczników w trakcie rzutu.
- Próg bankowania jest względny: `s = Σ (kroki tej tury w kolumnie / pełna długość kolumny)`. Dwa kroki na 2 to `2/3`, na 7 to `2/13`. Wyświetlane 100% oznacza ekwiwalent jednej pełnej kolumny, nie szansę wygranej; suma może przekraczać 100%.
- Dla każdego rzutu wybieramy parowanie maksymalizujące przyrost względny, nie liczbę surowych kroków. Dublet jest ograniczony pozostałymi polami, ale dzielimy zawsze przez pełną długość. `g_rel` to bezwarunkowy średni przyrost z 1296 rzutów (zero za wpadkę). Porównanie obejmuje tylko bankowanie teraz lub jeden dodatkowy rzut i bankowanie po sukcesie: `Δ = g_rel − q·s`, próg `s* = g_rel/q`. Powyżej progu wygrywa bankowanie, na progu obojętność; dla q=0 nie ma skończonego progu, dla q=1 próg wynosi zero. To nie optymalna strategia wyścigu.
- Średnia `T = 1/q` i mediana (najmniejsze `n ≥ 1` z `p^n ≤ 0,5`) obejmują rzut kończący się wpadką. Dla q=1 obie wynoszą 1, dla q=0 są nieskończone. To projekcja geometryczna **zamrożonego stanu**, także po edycji odległości do szczytów: stałe p, bez postępu w kolejnych rzutach. Nie jest prognozą rzeczywistej zmieniającej się planszy.
- Ranking trójek zachowuje surową miarę „E kroków / rzut”; nie należy jej mylić z względnym przyrostem na planszy. Drzewo nadal przyjmuje dorobek względny jako ułamek (40% na planszy = 0,4 w modelu), lecz próg nie jest dorobkiem i nie jest kopiowany do modelu.
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
node --test test_*.cjs
```

Kod i dane są publiczne. To niezależne narzędzie analityczne, bez powiązania z wydawcami gry.
