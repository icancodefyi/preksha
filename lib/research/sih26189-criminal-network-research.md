# SIH26189 — AI Criminal Network Analysis System | Complete Deep-Dive

**Problem Statement:** AI-Powered Criminal Network Analysis System
**Organization:** Ministry of Home Affairs (MHA)
**Theme:** Blockchain & Cybersecurity

---

## 1. THE PROBLEM — Why This Matters

Modern criminal activities are organized and interconnected. Criminals operate through networks involving associates, intermediaries, financial channels, communication links, locations, and events.

**Indian LEA data sources:**
- FIRs (First Information Reports) — unstructured text, often handwritten
- CDRs (Call Detail Records) — who called whom, when, duration, tower location
- IPDRs (Internet Protocol Detail Records) — internet session metadata
- Financial transaction records — bank transfers, UPI, crypto
- Surveillance reports — CCTV, stakeout notes
- Social media intelligence — profiles, posts, connections
- Criminal history databases — previous arrests, convictions
- Tower dumps — all devices on a tower in a time window

**The core problem:** Data is fragmented, unstructured, and distributed across multiple systems. Manual analysis is slow, labor-intensive, and prone to missing critical connections.

**Impact numbers (India):**
- Delhi Police: CDR analysis is PRIMARY probe tool for tracking criminals
- CDRs go back up to 2 years (DoT 2021 mandate)
- IPDRs track WhatsApp/Telegram usage (encrypted messaging)
- courts accept CDR as electronic evidence under Section 65B Indian Evidence Act
- NDPS, cybercrime, terrorism cases ALL rely on CDR network mapping

---

## 2. EXISTING SOLUTIONS — The Landscape

### Tier 1: Enterprise (Expensive)

| Solution | Cost | Key Features | Used By |
|---|---|---|---|
| **Palantir Gotham** | $5M-$50M+/year | Data integration, CDR analysis, link analysis, geospatial, AI | FBI, DHS, NSA, Europol, German Police, Ukrainian Military |
| **IBM i2 Analyst's Notebook** | $50K-$200K/year | Link analysis, temporal analysis, social network analysis, entity extraction | 2000+ orgs worldwide, Seattle PD RTCC |
| **GraphAware Hume** | Enterprise pricing | Graph-native CDR analysis, community detection, real-time processing | Western Australia Police |

### Tier 2: Specialized Tools

| Solution | Focus | Key Features |
|---|---|---|
| **InteleLinx** | CDR analysis | Automated link analysis, visual network graphs, geospatial mapping |
| **NocTORnal** | Cybercrime investigation | Open-source, assertion ledger, SNA maths (Leiden, Burt, key-player), WORM custody |
| **TRACY Canvas** | Communication networks | Open-source, temporal filtering, behavioral scoring, multi-network views |
| **Maltego** | OSINT pivoting | Transform marketplace, breadth-first investigation |

### Tier 3: Open-Source / Research

| Solution | Focus | Key Features |
|---|---|---|
| **CrimeGraph AI** | Criminal network visualization | vis-network, force-directed graph, entity filtering, AP Police initiative |
| **OGI (OpenGraph Intel)** | OSINT link analysis | 20+ transforms, AI investigator, graph analysis, community detection |
| **Neo4j POLE** | Crime data modeling | Person-Object-Location-Event model, graph algorithms |
| **ReportEase** | FIR analysis | Mistral AI, IPC/CrPC suggestions, CCTNS integration |

### What Nobody Has Built (The Gap)

| Gap | Who Has It | Why It Matters |
|---|---|---|
| **Indian FIR NLP extraction** | Nobody (only research papers) | FIRs are the primary data source, currently manual |
| **CDR + FIR + Financial fusion** | Nobody at Indian LEA scale | Cross-referencing all data types in one platform |
| **Free for Indian police** | Nobody (Palantir = millions) | Indian police cannot afford enterprise tools |
| **Hindi/Regional language UI** | Nobody | Indian investigators need vernacular interfaces |
| **CCTNS integration** | Nobody | Crime and Criminal Tracking Network & Systems |
| **SAHYOG integration** | Nobody | Inter-agency cybercrime coordination |

---

## 3. HOW IT ACTUALLY WORKS — IRL Workflow

### Step 1: Data Ingestion
**What happens:** Investigator uploads/raw data into the system

**Data sources in practice:**
- **FIR text** (typed or scanned PDF) — complainant name, accused names, witness names, location, date, crime type, IPC sections
- **CDR data** (CSV/Excel from telecom provider) — calling number, called number, date, time, duration, cell tower ID, IMEI, IMSI
- **IPDR data** (CSV from ISP) — session start/end, IP address, data volume, subscriber ID
- **Financial records** (bank statements, UPI logs) — transaction ID, sender, receiver, amount, timestamp
- **Tower dump data** (CSV) — all devices on specific towers during time window
- **CCTV metadata** — camera ID, timestamp, vehicle plates detected

### Step 2: Entity Extraction (NLP)
**What happens:** AI extracts entities from unstructured text

**From FIRs:**
- Person names (complainant, accused, witnesses)
- Locations (crime scene, addresses)
- Vehicles (registration numbers)
- Phone numbers
- Weapons/items involved
- IPC sections applicable
- Date/time of incident

**From CDRs:**
- Phone numbers (A-party, B-party)
- Communication pairs (who called whom)
- Temporal patterns (when, how often)
- Location patterns (which towers)
- Device patterns (IMEI sharing = same person using multiple SIMs)

### Step 3: Graph Construction
**What happens:** All entities and relationships become a graph

**POLE Model (Person-Object-Location-Event):**
```
Person --[CALLED]--> Person (CDR)
Person --[OWNS]--> Vehicle (FIR/Registration)
Person --[LOCATED_AT]--> Location (CDR tower / FIR)
Person --[COMMITTED]--> Crime (FIR)
Person --[KNOWS]--> Person (co-accused / frequent contacts)
Person --[TRANSACTED_WITH]--> Person (financial)
Crime --[OCCURRED_AT]--> Location
Crime --[INVOLVED]--> Vehicle
```

### Step 4: Network Analysis (AI/ML)
**What happens:** Algorithms find hidden patterns

**Community Detection:**
- Identifies clusters of tightly connected individuals
- Reveals criminal gangs, cells, syndicates
- Algorithm: Leiden (better than Louvain — guarantees connected communities)

**Centrality Analysis:**
- Betweenness centrality: Who bridges different groups? (the "middleman")
- PageRank: Who is most influential? (the "kingpin")
- Eigenvector centrality: Who is connected to other important people?
- Degree centrality: Who has the most direct contacts?

**Pattern Detection:**
- IMEI sharing: Same device used by multiple numbers = burner phones or co-conspirators
- Temporal coordination: Multiple suspects calling each other before a crime
- Co-location: Multiple suspects' phones on same tower = physical meeting
- Communication bursts: Sudden spike in calls before an incident
- Silence patterns: Sudden communication halt after a crime

**Key Player Analysis:**
- Not just "who has most connections" but "who is critical to network cohesion"
- Removing this person would fragment the network
- Uses Burt's constraint and key-player algorithms

### Step 5: Visualization & Investigation
**What happens:** Investigator sees interactive network graph

**Dashboard features:**
- Force-directed graph showing all entities and relationships
- Click on any node to see full details
- Filter by entity type (persons, vehicles, locations, crimes)
- Timeline view showing communication patterns over time
- Geospatial view showing locations on map
- Search across all entities
- Export findings as report

### Step 6: Actionable Intelligence
**What happens:** System generates leads for investigator

**Output:**
- "Person X is the central node connecting 47 suspects across 3 states"
- "These 12 suspects coordinated via 23 calls in the 48 hours before the robbery"
- "Person Y shared IMEI with Person Z — they are using the same device"
- "This financial transaction connects the cyber fraud to the money mule network"

---

## 4. FULL FEATURE LIST

### Core Features
1. **FIR Ingestion & NLP** — Upload FIR (PDF/image/text), extract all entities automatically
2. **CDR/IPDR Import** — Parse telecom data (CSV/Excel), extract communication pairs
3. **Financial Record Import** — Parse bank statements, UPI logs
4. **Entity Resolution** — Merge duplicate entities (same person, different phones)
5. **Graph Construction** — Auto-build POLE model from all data sources
6. **Interactive Network Visualization** — Force-directed graph with zoom/pan/filter
7. **Community Detection** — Identify criminal clusters using Leiden algorithm
8. **Centrality Analysis** — Find kingpins, middlemen, bridges
9. **Key Player Identification** — Who is critical to network cohesion
10. **Temporal Analysis** — Communication patterns over time
11. **Geospatial Mapping** — Tower locations, crime scenes, suspect movements
12. **Pattern Detection** — IMEI sharing, co-location, communication bursts
13. **Link Prediction** — AI suggests likely hidden connections
14. **Case Management** — Link suspects to multiple cases
15. **Report Generation** — Export investigation findings as PDF/JSON
16. **Search & Filter** — Full-text search across all entities
17. **Timeline Reconstruction** — Reconstruct crime timeline from CDR + FIR
18. **Multi-Case Correlation** — Find connections across different FIRs

### Advanced Features
19. **Network Disruption Simulation** — "If we arrest Person X, what happens to the network?"
20. **Predictive Analysis** — "Based on patterns, Person Y is likely the next target"
21. **IMSI/IMEI Analysis** — Track device usage across multiple SIMs
22. **Tower Dump Analysis** — Find unknown suspects at crime scenes
23. **Encrypted Messaging Inference** — Correlate IPDR data to infer WhatsApp/Telegram connections
24. **Financial Flow Tracing** — Follow money through bank accounts
25. **CCTNS Integration** — Pull data from Crime and Criminal Tracking Network
26. **Hindi/Regional Language UI** — Interface for Indian investigators
27. **Offline Mode** — Work without internet (field deployment)
28. **Evidence Chain** — Track data provenance for court admissibility
29. **Role-Based Access** — Different access levels for different officers
30. **Audit Logging** — Track who accessed what data when

---

## 5. TECHNICAL ARCHITECTURE

### Layer 1: Data Ingestion
```
FIR Upload (PDF/Image/Text) --> OCR (Tesseract) --> NLP Entity Extraction (spaCy/InLegalBERT)
CDR/IPDR Upload (CSV/Excel) --> Parser --> Structured Data
Financial Records (CSV) --> Parser --> Structured Data
Tower Dump (CSV) --> Parser --> Structured Data
CCTNS API --> Structured Data
```

### Layer 2: Entity Resolution & Linking
```
Raw Entities --> Deduplication (fuzzy matching) --> Canonical Entities
Phone numbers --> Subscriber lookup --> Person linking
IMEI numbers --> Device tracking --> Multi-SIM detection
Location names --> Geocoding --> Coordinates
```

### Layer 3: Graph Database
```
Neo4j (POLE Model)
├── Person nodes (name, age, address, criminal history)
├── Phone nodes (number, IMEI, IMSI)
├── Vehicle nodes (registration, model, owner)
├── Location nodes (name, coordinates, type)
├── Crime nodes (FIR number, type, date, IPC sections)
├── Event nodes (meeting, transaction, communication)
└── Relationships (CALLED, KNOWS, OWNS, LOCATED_AT, COMMITTED, TRANSACTED_WITH)
```

### Layer 4: Analytics Engine
```
Graph Algorithms (Neo4j GDS / igraph):
├── Community Detection (Leiden)
├── Centrality (Betweenness, PageRank, Eigenvector)
├── Key Player Analysis (Burt's constraint)
├── Shortest Path (Dijkstra)
├── Triangle Count (gang detection)
├── Link Prediction (common neighbors, Adamic-Adar)
└── Temporal Pattern Detection (custom)
```

### Layer 5: AI/ML Models
```
NLP Models:
├── Named Entity Recognition (spaCy / Hugging Face)
├── FIR Entity Extraction (fine-tuned BERT/InLegalBERT)
├── Relationship Extraction (custom)
└── Anomaly Detection (Isolation Forest / Autoencoder)

Graph ML:
├── Node Classification (GNN)
├── Link Prediction (GraphSAGE)
└── Community Detection (Leiden)
```

### Layer 6: Visualization & Frontend
```
React + TypeScript
├── Force-directed graph (vis-network / Cytoscape.js / D3.js)
├── Timeline view (vis-timeline)
├── Geospatial view (Leaflet / Mapbox)
├── Dashboard (charts, stats)
├── Search interface
├── Report generator
└── Hindi/Regional language support (i18n)
```

### Layer 7: Backend API
```
FastAPI (Python)
├── Data ingestion endpoints
├── Graph query endpoints (Cypher)
├── Analytics endpoints
├── Authentication & authorization
├── File upload/download
└── WebSocket for real-time updates
```

---

## 6. TECH STACK

| Component | Technology | Why |
|---|---|---|
| Graph Database | Neo4j Community | POLE model, GDS algorithms, Cypher queries |
| Backend | FastAPI (Python) | Async, fast, ML integration |
| NLP | spaCy + InLegalBERT | Indian legal domain NER |
| OCR | Tesseract | FIR image text extraction |
| Frontend | React + TypeScript | Dashboard |
| Graph Visualization | vis-network or Cytoscape.js | Force-directed graph |
| Timeline | vis-timeline | Communication timeline |
| Map | Leaflet | Geospatial view |
| ML | PyTorch + scikit-learn | Anomaly detection, link prediction |
| Auth | JWT + RBAC | Role-based access |
| Storage | PostgreSQL | Structured data, audit logs |
| File Processing | Pandas, openpyxl | CDR/CSV parsing |

---

## 7. DEMOABILITY ASSESSMENT

### Can you demo this LIVE? YES.

**Demo Scenario (5 minutes):**

1. **Upload FIR** (30 sec)
   - Show a real FIR document (PDF)
   - System extracts: "Complainant: Rahul Sharma, Accused: Rajesh Kumar, Amit Singh, Location: Connaught Place, Delhi, Crime: Robbery, Date: 15-Aug-2025"
   - Judge sees: instant entity extraction

2. **Upload CDR data** (30 sec)
   - Show CSV with 10,000 call records
   - System parses and imports in seconds
   - Judge sees: data flowing into system

3. **Show Network Graph** (60 sec)
   - Force-directed graph appears with all entities
   - Person nodes (red), Phone nodes (green), Vehicle nodes (blue), Location nodes (yellow)
   - Relationships shown as edges
   - Judge sees: "holy shit, that's a criminal network"

4. **Run Analysis** (60 sec)
   - Click "Find Communities" → highlights 3 distinct criminal clusters
   - Click "Find Key Players" → Person X highlighted as central node
   - Click "Find Patterns" → "12 suspects coordinated via 23 calls before robbery"
   - Judge sees: AI finding hidden connections

5. **Timeline View** (30 sec)
   - Show communication timeline
   - "See? All 5 suspects called each other between 2 PM and 4 PM on the day of the robbery"
   - Judge sees: temporal evidence

6. **Geospatial View** (30 sec)
   - Show locations on map
   - "All suspects were within 500m of the crime scene at the time of the robbery"
   - Judge sees: location evidence

7. **Report Generation** (30 sec)
   - Click "Generate Report"
   - PDF with network graph, timeline, key findings
   - "This report is court-admissible under Section 65B"
   - Judge sees: complete investigation package

### Demo Data Needed
- 5-10 sample FIRs (can use public NDPS/cybercrime FIRs)
- 10,000 synthetic CDR records (generate with Python)
- 100 synthetic financial transactions
- 20-30 person entities with relationships

### Wow Factor: 9/10
- Interactive graph visualization is visually stunning
- AI finding hidden connections = instant "holy shit"
- Timeline reconstruction = compelling narrative
- Geospatial view = real-world grounding

---

## 8. HACKATHON FEASIBILITY (48 hours)

### What You Can Build in 48 Hours
- [x] FIR upload + NLP entity extraction (pre-trained model)
- [x] CDR CSV parser + import
- [x] Neo4j graph construction (POLE model)
- [x] Interactive network visualization (vis-network)
- [x] Community detection (Neo4j GDS)
- [x] Centrality analysis (Neo4j GDS)
- [x] Basic search & filter
- [x] Timeline view
- [x] Export report (PDF)

### What Is "Future Scope"
- [ ] Real-time CDR streaming
- [ ] Encrypted messaging inference
- [ ] Financial flow tracing
- [ ] CCTNS/SAHYOG API integration
- [ ] Hindi/regional language UI
- [ ] Offline mode
- [ ] Network disruption simulation

---

## 9. IMPACT METRICS (For PPT)

### Primary Metrics
- Investigation time: Days/weeks -> Minutes
- Manual cross-referencing: Hours per case -> Seconds
- Hidden connection discovery: Manual (missed) -> AI (automated)
- Case throughput: 5-10 cases/month -> 50-100 cases/month

### Secondary Metrics
- CDR analysis time: 3-5 days -> 30 seconds
- Network mapping: Manual (days) -> Automated (seconds)
- Evidence generation: Manual report -> Auto-generated court-admissible report
- Cross-case correlation: Impossible -> Automated

### Ripple Effects
- Faster identification of kingpins -> dismantle networks faster
- Cross-case correlation -> find serial offenders
- Pattern detection -> prevent future crimes
- Cost savings -> reallocate resources to field operations

---

## 10. REAL INDIAN CASES WHERE THIS WOULD HAVE HELPED

| Case | What Happened | How This Tool Helps |
|---|---|---|
| **Delhi Riots 2020** | CDR analysis used to identify suspects | Automate CDR network mapping across 1000+ suspects |
| **Mumbai 26/11** | Terrorist network communication patterns | Real-time CDR analysis to identify handlers |
| **Gurugram Cyber Fraud** | ₹500 Cr scam, 50+ suspects across states | Cross-case correlation to find common network |
| **NRHM Scam** | Multi-state corruption network | Financial flow tracing + network analysis |
| **Drug Cartels (Punjab)** | Cross-border drug network | Tower dump analysis + co-location detection |

---

## 11. REFERENCES

1. Palantir Gotham - Law Enforcement Platform Documentation
2. IBM i2 Analyst's Notebook - Visual Analysis Documentation
3. Neo4j POLE Model - Crime Investigation Sandbox
4. GraphAware Hume - CDR Analysis with Graph Databases
5. CrimeGraph AI - AP Police Initiative
6. NocTORnal - Open Source Cybercrime Investigation
7. TRACY Canvas - Criminal Network Visualization
8. FIR Dataset ICDAR 2023 - Indian Legal Document Processing
9. InLegalBERT - Indian Legal Domain Language Model
10. CDR Analysis Guide - Ministry of Cyber Affairs (2026)
11. SIH26189 - Smart India Hackathon 2026 Problem Statement
