# 🏅 Toronto Sports Activity Finder

A web app that helps residents discover **free and affordable drop-in sports activities** at City of Toronto community centres — all in one place.

---

### 📖 The Story Behind the App

**1. Context:**
The official City of Toronto website features individual pages for its many community centres, each listing the scheduled activities available at that specific location.

**2. Problem Statement:**
While you can easily view a schedule if you already know which community centre you want to visit, there is no built-in way to search in reverse. For example, if you want to play Basketball or Badminton, you cannot easily find a list of all community centres offering those sports without manually checking each centre's page one by one.

**3. The Solution:**
To solve this, we built a data pipeline that pulls schedule data weekly from the city website and essentially "transposes the matrix." By reorganizing the data to be sport-centric rather than centre-centric, we deliver a significantly improved user experience tailored for the majority of sports enthusiasts looking to play their favorite games across the city.

---

## ✨ Features

- **Live schedule data** — scraped weekly from the City of Toronto Parks & Recreation listings
- **Smart filters** — narrow results by day of week, age group, cost (Free / Paid), tags, and community centre
- **Responsive design** — works on desktop, tablet, and mobile
- **Serverless backend** — AWS Lambda + API Gateway + DynamoDB, deployed with SAM

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                      Data Pipeline                                   │
│                                                                      │
│  fetch_schedules.py  ──►  Gemini normalization                       │
│       │                        │                                     │
│       ▼                        ▼                                     │
│  SportSchedules.json / CommunityCentres.json  ──►  seed_dynamo.py    │
│                                                          │           │
│                                                          ▼           │
│                                                    AWS DynamoDB      │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                        Backend                           │
│                                                          │
│  API Gateway (HTTP)  ──►  Lambda (Python 3.12)           │
│    GET /sports                getSports                  │
│    GET /sports/{sport}/schedules   getSportSchedules     │
│                                                          │
│  Infrastructure: AWS SAM (template.yaml)                 │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                       Frontend                           │
│                                                          │
│  React 19 + Vite 8 + React Router                        │
│  Deployed to GitHub Pages                                │
│                                                          │
│  Pages:                                                  │
│    /              HomePage — sport grid + hero           │
│    /sport/:name   SportResultsPage — filtered schedules  │
│                                                          │
│  Components:                                             │
│    Navbar, SportTile, FilterBar, ScheduleTable           │
└──────────────────────────────────────────────────────────┘
```

---

## 📊 Data Pipeline

### 1. Fetch raw schedules

```bash
# Scrape schedules from City of Toronto website
python fetch_schedules.py 
```

### 2. Normalize with Gemini

Activities that don't match the canonical sport list are normalized via **Gemini 2.5 Flash** API calls. The model maps raw names to a standard sport and extracts tags:

| Raw Name | Sport | Tags |
|---|---|---|
| Multi-Sport with Family | Multi-Sport | `["Family"]` |
| Dodgeball (2SLGBTQ+) | Dodgeball | `["2SLGBTQ+"]` |
| Parasport: Wheelchair Basketball | Basketball | `["Parasport: Wheelchair"]` |
| Open Gym with Caregiver | Open Gym | `["Caregiver"]` |

All girls & women events are tagged `"Women"`.

After this step, script produces `SportSchedules.json` and `CommunityCentres.json` with actual values.

### 3. Seed DynamoDB

```bash
cd backend/scripts
python seed_dynamo.py
```

This script:
1. **Clears** all existing entries from both DynamoDB tables
2. **Deduplicates** the JSON data
3. **Batch-writes** the cleaned data into `community-centers-TorontoXP` and `sports-schedules-TorontoXP`

---

## 🗂️ Project Structure

```
SportsActivityFinder/
├── backend/
│   ├── template.yaml            # AWS SAM infrastructure definition
│   ├── samconfig.toml           # SAM deploy configuration
│   ├── lambdas/
│   │   ├── getSports.py         # Lambda — list all sports
│   │   └── getSportSchedules.py # Lambda — schedules for a sport
│   └── scripts/
│       └── seed_dynamo.py       # Seed DynamoDB tables from JSON
├── public/                  # Static assets (sport icons, logos)
├── src/
│   ├── App.jsx              # Root component + routing
│   ├── main.jsx             # Entry point
│   ├── pages/
│   │   ├── HomePage.jsx     # Sport grid landing page
│   │   └── SportResultsPage.jsx  # Filtered schedule results
│   ├── components/
│   │   ├── Navbar.jsx       # Top navigation bar
│   │   ├── SportTile.jsx    # Individual sport card
│   │   ├── FilterBar.jsx    # Multi-filter sidebar
│   │   └── ScheduleTable.jsx # Schedule results table
│   └── services/
│       └── api.js           # API client (axios)
├── .github/workflows/
│   └── deploy.yml           # GitHub Pages deploy workflow
└── .env.example             # Environment variable template
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 20
- **Python** ≥ 3.12
- **AWS CLI** configured with credentials
- **AWS SAM CLI** (for backend deployment)

### Frontend — Local Development

```bash
cd frontend/SportsActivityFinder

# Install dependencies
npm install

# Start dev server (uses VITE_API_BASE_URL from .env or .env.local)
npm run dev
```

Create a `.env.local` from the example:

```bash
cp .env.example .env.local
# Then set VITE_API_BASE_URL to your API Gateway endpoint
```

### Backend — Build & Deploy

```bash
cd backend

# Build the SAM application
sam build

# Deploy (guided for first time, then uses samconfig.toml)
sam deploy --guided    # first time
sam deploy             # subsequent deploys
```


