# QandA Learn

Nowoczesna, ciemna aplikacja webowa do nauki pytań i odpowiedzi, egzaminów A/B/C/D oraz fiszek. Przygotowana do uruchamiania na TrueNAS SCALE lub jako zwykły kontener Docker.

## Funkcje

- Port WebUI: `8928`.
- Pierwsze uruchomienie: rejestracja pierwszego użytkownika.
- Kolejne wejścia: logowanie z zapamiętaniem urządzenia w `localStorage`.
- Dashboard: liczba pytań, aktywne pytania, ignorowane pytania, ostatnie ćwiczenie, pytania dobrze znane i sprawiające problem, aktualna data i godzina.
- Import zestawów pytań z JSON.
- Eksport i usuwanie zestawów.
- Egzamin A/B/C/D: 10, 50 albo 100 pytań, wynik dopiero na końcu.
- Tryb nieskończony: wynik na żywo i zielona/czerwona animacja po odpowiedzi.
- Fiszki: pytanie na karcie, kliknięcie pokazuje odpowiedź.
- Pytania problematyczne pojawiają się częściej dzięki ważeniu na podstawie błędnych serii.
- Przycisk „Nie zadawaj tego pytania ponownie nigdy”.
- Lista ignorowanych pytań z możliwością przywrócenia.
- Dane zapisywane w `/data/db.json`.

## Format JSON

Plik powinien być tablicą obiektów:

```json
[
  {
    "id": 1,
    "pytanie": "Głównym celem edukacji zdrowotnej prowadzonej przez pielęgniarkę jest:",
    "poprawna_odpowiedz": "Kształtowanie świadomych, prozdrowotnych zachowań pacjenta i jego rodziny — przygotowanie do samoopieki, samokontroli i odpowiedzialności za własne zdrowie.",
    "bledne_odpowiedzi": [
      "Trwała zmiana zachowań zdrowotnych pacjenta (nie tylko przyrost wiedzy).",
      "Psychomotorycznej (umiejętności praktyczne, taksonomia Simpsona).",
      "Operacyjny czasownik opisujący obserwowalną czynność ucznia, warunki jej wykonania oraz kryterium poprawności (taksonomia ABCD)."
    ],
    "zrodlo": "Andruszkiewicz A., Banaszkiewicz M. (red.) Promocja zdrowia. PZWL, 2010; Karta Ottawska WHO 1986.",
    "wymaga_weryfikacji": false
  }
]
```

## Uruchomienie lokalne

```bash
npm install
npm start
```

Otwórz: `http://localhost:8928`

## Docker / TrueNAS SCALE

```bash
docker compose up -d --build
```

W TrueNAS SCALE utwórz aplikację custom / Docker Compose i ustaw:

- port hosta: `8928`
- port kontenera: `8928`
- wolumen/dataset: `/data`
- zmienne środowiskowe:
  - `PORT=8928`
  - `DATA_DIR=/data`

## Bezpieczeństwo

Hasło pierwszego użytkownika jest hashowane przez `scrypt`. Sesje są tokenami zapisywanymi po stronie serwera w `/data/db.json`, a token urządzenia jest przechowywany w przeglądarce.
