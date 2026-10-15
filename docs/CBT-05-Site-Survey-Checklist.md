# CBT-05 — School Site Survey Checklist

**Purpose:** Visit the school once, before you sign or install, and collect the facts that decide the price, the installer scope and whether the offline exam server can run safely.
**Who fills it in:** The person doing the visit (you or a technician), with the school's ICT contact or administrator.
**Time needed:** About 2 to 3 hours, plus 30 minutes with the head or proprietor.
**Companion documents:** CBT-Technical-Design (architecture), CBT-04 §6 (Windows service and installer), CBT-01 §5 (account creation).

How to use this: tick each box, write the answer on the line, and take a photo wherever it says **[photo]**. At the end, apply the go/no-go rules in Part 12.

---

## Part 0 — Visit details

| Field | Answer |
|---|---|
| School name | |
| Address / town / state | |
| Date of visit | |
| Surveyor | |
| School contact (name, role, phone, WhatsApp) | |
| Decision maker (name, role) | |
| Named server contact (the one person who looks after the lab PC day to day) | |
| School short code for student codes (3 to 5 letters, e.g. ABC) | |

---

## Part 1 — Size and scope (interview the head / admin)

| # | Question | Answer |
|---|---|---|
| 1.1 | Number of students: nursery / primary / JSS / SSS | |
| 1.2 | Number of classes and arms (e.g. JSS1A, JSS1B) | |
| 1.3 | Number of teachers who will set questions | |
| 1.4 | Number of parents or guardians (estimate) | |
| 1.5 | Share of parents with a smartphone (rough %) | |
| 1.6 | Share of parents who use WhatsApp / email / SMS only | |
| 1.7 | Terms per year and exam periods per term (CA, mid-term, exam) | |
| 1.8 | Largest group that sits one paper at once | |
| 1.9 | Which exams go on the platform in the first term? | |
| 1.10 | Are any students under 13? (consent, see CBT-01 US-4.9) | |
| 1.11 | Do primary pupils need image-heavy or audio questions? | |
| 1.12 | Is there a second computer lab or a second campus? (MVP supports one lab per school) | |

Write the licence count used for the quote: ______ students × ₦800 per term.

---

## Part 2 — Current process and pain points

| # | Question | Answer |
|---|---|---|
| 2.1 | How are exams written today (paper, J-Card, other)? | |
| 2.2 | What does the school pay for J-Card or similar, and how often? | |
| 2.3 | What does the school like about it? | |
| 2.4 | What frustrates staff and parents most? | |
| 2.5 | Printing cost per term for exam papers (estimate) | |
| 2.6 | How long does marking and result entry take now? | |
| 2.7 | How do parents currently receive results? | |
| 2.8 | Who approves results before parents see them? | |
| 2.9 | Which grading scale and pass mark does the school use? Attach a sample report card. | |
| 2.10 | Which question types do teachers use (multiple choice, true/false, fill-in, theory)? Theory is marked by hand in the MVP. | |
| 2.11 | Do teachers already have questions in Word or Excel? Ask for 2 sample files (Part 10). | |

---

## Part 3 — Lab room

| # | Check | Answer / tick |
|---|---|---|
| 3.1 | Number of working PCs | |
| 3.2 | Number of PCs that are broken or unreliable | |
| 3.3 | Seating capacity at one sitting | |
| 3.4 | Is the room lockable, with a key holder named? | |
| 3.5 | Windows ventilation / heat (fans, AC, windows open) | |
| 3.6 | Is there a projector or board for instructions? | |
| 3.7 | Can a teacher or invigilator see every screen from the front? | |
| 3.8 | Does the room have a fire extinguisher and a clear exit? | |

**[photo]** the whole lab, the server PC and the network cabinet.

---

## Part 4 — PC inventory (one row per PC; repeat on a separate sheet if needed)

Run these on each PC (or on a sample of at least 5 if there are more than 30, then note the spread):

- `winver` shows the Windows version.
- `systeminfo` shows RAM, CPU and 32 or 64-bit.
- Open `chrome://version` or `edge://version` for the browser version.

| PC label | Windows version | 32 / 64-bit | CPU | RAM | Free disk | Browser + version | Screen size | Works? |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |
| | | | | | | | | |
| | | | | | | | | |
| | | | | | | | | |
| | | | | | | | | |

Rules to apply:

- **Windows 7 and 8 stop at Chrome 109.** The exam client targets Chrome 109, so these PCs work, but note them. Do not promise Edge or newer Chrome on them.
- A PC with **less than 2 GB RAM** or a very slow disk will struggle. Mark it as "reserve".
- The exam client needs only a browser. Nothing is installed on student PCs.
- Check that each PC can open a plain web page from another PC on the network (Part 6).
- Check each browser is not forced into a kiosk or proxy setting that blocks local addresses.

Summary: ____ PCs meet the standard · ____ PCs are workable on Chrome 109 · ____ PCs are unusable.

---

## Part 5 — Server PC candidate

The server is one of the lab PCs, or a spare PC, running the CBT exam server as a Windows service (CBT-04 §6).

| # | Requirement | Minimum | Preferred | Actual |
|---|---|---|---|---|
| 5.1 | Windows | 10 64-bit | 11 64-bit | |
| 5.2 | CPU | Core i3 | Core i5 | |
| 5.3 | RAM | 4 GB | 8 GB | |
| 5.4 | Free disk (installer refuses below 10 GB) | 10 GB | 20 GB or more, on an SSD | |
| 5.5 | Network | Ethernet cable | Ethernet cable | |
| 5.6 | Admin rights available to the installer | Yes | Yes | |
| 5.7 | Antivirus | Allow an exclusion for the data folder | | |
| 5.8 | Automatic Windows updates and forced restarts | Can be paused during exams | Set active hours | |
| 5.9 | Sleep / hibernate | Must be turned off | | |
| 5.10 | Is the PC used by students or staff for other work? | Prefer no | Dedicated | |

Also record:

- Who has the Windows admin password? ____________________
- Is the PC joined to a school domain or controlled by an IT vendor? ____________________
- Is it behind a UPS (Part 7)? ____________________

**[photo]** the server PC, its label and the cable that connects it to the switch.

Do not use a PC that is Windows 7/8, 32-bit, Wi-Fi only, or has less than 4 GB RAM as the server. If no PC qualifies, add a spare PC to the quote (Part 12).

---

## Part 6 — Network

| # | Check | Answer / tick |
|---|---|---|
| 6.1 | Are the lab PCs wired (Ethernet) or on Wi-Fi? | |
| 6.2 | Switch(es): make, number of ports, any unmanaged or damaged ports | |
| 6.3 | Router: make, who manages it, admin login available? | |
| 6.4 | Who assigns addresses (DHCP on the router)? | |
| 6.5 | Subnet (run `ipconfig /all`; e.g. 192.168.0.x / 255.255.255.0) | |
| 6.6 | Can the router reserve a fixed address for the server PC (DHCP reservation)? | |
| 6.7 | Chosen server address (e.g. 192.168.0.10) | |
| 6.8 | Does the router isolate clients ("AP or client isolation")? Must be OFF for the lab. | |
| 6.9 | Ping the server PC from 3 student PCs (`ping 192.168.0.10`): reply and time | |
| 6.10 | Open a test page on the server from a student PC (the surveyor starts a simple local web server, or use shared folder copy) | |
| 6.11 | Copy a 50 MB file from the server to a student PC: seconds taken | |
| 6.12 | Is Windows Firewall on, and can the installer add a rule for the local subnet only? | |
| 6.13 | Any wireless access point that students' phones can join on the same network? | |

Rules:

- Wi-Fi labs can work, but need a test with the full class connected at once. If the copy test takes over 60 seconds for 50 MB, the exam load will suffer. Recommend cabling.
- The server address must not change. If the router cannot reserve one, set a static address on the server PC itself.
- Student PCs reach the server by `http://<server-address>:<port>`, the port from CBT-04 §11.

Switch and cable faults to look for: loose RJ45 ends, ports without link lights, unlabelled patching.

**[photo]** the switch and router, and the cable labels.

---

## Part 7 — Power

| # | Check | Answer |
|---|---|---|
| 7.1 | Mains supply reliability (typical outage hours per day) | |
| 7.2 | Generator or inverter? Size and fuel cost | |
| 7.3 | Switch-over time (seconds) | |
| 7.4 | UPS on the server PC? Capacity (VA) and battery age | |
| 7.5 | UPS on the switch and router? | |
| 7.6 | Are student PCs on the same backed-up supply? | |
| 7.7 | Enough sockets and extension leads, properly rated? | |
| 7.8 | Earthing / surge protection present? | |

Why this matters: the server writes every answer to disk with `synchronous=FULL`, so a sudden power cut will not corrupt it, but the exam still pauses for everyone. A UPS on the **server, switch and router** is the single most useful protection.

Recommendation to give: a UPS of 1 kVA or larger for the server, switch and router, giving at least 30 minutes of run time.

---

## Part 8 — Internet and sync

The exam itself runs offline. Internet is needed only for sync with the cloud (packs down, results up) and the parent portal.

| # | Check | Answer |
|---|---|---|
| 8.1 | Internet type (fibre, radio, MTN/Airtel/Glo router, none) | |
| 8.2 | Provider and plan, monthly cost, data cap | |
| 8.3 | Speed test result from the server PC (download / upload) | |
| 8.4 | How often is it down? | |
| 8.5 | Does the server PC have internet access at all? | |
| 8.6 | Are outbound HTTPS connections allowed (no blocking proxy)? | |
| 8.7 | Does the network block unusual sites or time-limit access? | |
| 8.8 | Can a staff member carry a USB drive to a place with internet if needed? | |

Rules:

- If the server PC has no internet at all, plan for the USB fallback (`.cbtpack`, `.cbtkey`, `.cbtsync`; see CBT-03 §18). Record who will carry the drive and how often.
- Unreliable internet is fine. The school server calls out to the cloud and retries; nothing depends on it being up during an exam.
- A very small data plan is acceptable: results are tiny. Packs with images may be larger, so check for uploads of media.

---

## Part 9 — Backup, access and support

| # | Check | Answer |
|---|---|---|
| 9.1 | Is there an external drive or second disk for backups? Capacity | |
| 9.2 | Who will check that backups run each week? | |
| 9.3 | Is there a safe place off the premises for a monthly backup copy? | |
| 9.4 | Will the school allow remote support (e.g. a remote desktop tool)? | |
| 9.5 | Who is the first-line contact when something fails on exam day? | |
| 9.6 | Will an invigilator or teacher be present in the lab for every exam? | |
| 9.7 | Who can restart the server PC and run the "start exam" console? | |
| 9.8 | Are all staff phone numbers and emails collected for teacher invites? | |

---

## Part 10 — Data to collect for set-up

| Item | Format | Received? |
|---|---|---|
| School logo and letterhead | PNG / SVG | |
| Class and arm list | Excel | |
| Subject list per class | Excel | |
| Student list (name, class, admission number, gender, date of birth if used) | Excel | |
| Guardian list (name, phone, relationship, email) | Excel | |
| Teacher list (name, email, subjects, classes) | Excel | |
| Grading scale and pass mark | Document or report card | |
| 2 sample question files in Word or Excel | .docx / .xlsx | |
| Academic calendar for the year | Any | |
| Current report card template | PDF / photo | |

Data rules to confirm with the school:

- Phone numbers must be in a form that converts to E.164 (e.g. +234…). Guardians are matched by phone, so one parent with three children gets one login (CBT-01 §5).
- Check for duplicate parents with two different phone numbers, shared family phones and numbers that belong to staff.
- Ask whether the school already has parental consent for storing children's data. If not, the school collects it and records it in the platform (CBT-01 US-4.9).
- Confirm the school is the data controller and who signs the data processing note.

---

## Part 11 — People and training plan

| # | Question | Answer |
|---|---|---|
| 11.1 | Who is the school's system administrator (Admin portal)? | |
| 11.2 | Who sets exam rules and approves results? | |
| 11.3 | Who will train the teachers, and on what day? | |
| 11.4 | Is there a mock exam day before the first real exam? | |
| 11.5 | Will students practise the interface beforehand (a short mock quiz)? | |
| 11.6 | How will parents be told about the portal (letters, WhatsApp, PTA)? | |
| 11.7 | Can the school print activation slips for parents who do not use email or SMS? | |
| 11.8 | Roll-out plan: one class first, or the whole school? | |

Suggested training: one 90-minute teacher session (questions and imports), one 30-minute invigilator session (start and end of a sitting, what to do if a PC fails), one student practice sitting.

---

## Part 12 — Go / no-go and quote effects

Score each line. Any **Red** must be fixed or priced before work starts.

| Area | Green (proceed) | Amber (proceed with a fix) | Red (stop or re-quote) |
|---|---|---|---|
| Server PC | Meets Part 5 preferred | Meets minimum | None qualifies: add a spare PC to the quote |
| Student PCs | 90% or more usable | 70 to 90% usable | Below 70%: limit sittings to smaller batches or hire PCs |
| Network | Wired, ping under 5 ms, copy under 20 s | Wi-Fi tested with a full class | Isolation on and cannot be turned off, or copy over 60 s |
| Power | UPS on server, switch, router | UPS on server only | No backup power at all |
| Internet for sync | Stable on server PC | Intermittent | None: USB fallback required and named courier |
| Backup drive | Present and a named owner | Present, no owner | None: add a drive to the quote |
| Server contact | Named and available | Named but part-time | Nobody |
| Data | Lists received and clean | Needs cleaning | Missing or unreliable |
| Parents reachable | Most have phone or WhatsApp | Many are offline | Very few: plan printed slips and school-assisted activation |
| Decision maker | Signed off | Verbal agreement | Not engaged |

Effects on price and scope:

| Finding | Effect |
|---|---|
| Per-student licence | ₦800 per student per term (Part 1 count) |
| Exam-server fee | ₦200,000 per year per school |
| Spare server PC or UPS | Quote separately; schools often buy these |
| Cabling or switch repair | Quote separately |
| Remote data cleaning of lists | Extra charge per agreed day |
| On-site training beyond the first session | Extra charge |

Decision: ☐ Go ☐ Go with fixes ☐ Hold ☐ No-go

Fixes required before install:
1. ______________________________________________
2. ______________________________________________
3. ______________________________________________

---

## Part 13 — Installation-day checklist

Use this after approval, on the day the server is installed (CBT-04 §6).

- ☐ Server PC address fixed or reserved (Part 6)
- ☐ Sleep and hibernate turned off; Windows active hours set
- ☐ Windows Firewall rule added for the school subnet only
- ☐ Antivirus exclusion added for the data folder
- ☐ Installer run as administrator; service shows "Running"
- ☐ Device activated with a one-time code from the platform owner
- ☐ First sync finished: classes, students, exams visible
- ☐ Backup drive connected and a test backup written
- ☐ Server console opens from a student PC browser
- ☐ Mock exam run with at least 10 PCs at once
- ☐ Pull the power cable on the server mid-exam; restart; no answers lost
- ☐ Console shows seat status; invigilator can start and end a sitting
- ☐ USB fallback tested once (export and import)
- ☐ Server contact trained and holds the support number
- ☐ Handover sheet signed

---

## Part 14 — Sign-off

| Role | Name | Signature | Date |
|---|---|---|---|
| Surveyor | | | |
| School representative | | | |
| School head / proprietor | | | |

Attach: photos, PC inventory sheet, speed test and ping results, data files received.
